"""
油耗记录系统 - Flask 后端
API 层，前端通过 fetch 调用。
数据存储: MariaDB (通过环境变量配置)
"""

import json
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pymysql
from pymysql.cursors import DictCursor

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# --- 数据库连接 ---

DB_CONFIG = {
    'host': os.environ.get('MYSQL_HOST', 'mariadb'),
    'port': int(os.environ.get('MYSQL_PORT', 3306)),
    'user': os.environ.get('MYSQL_USER', 'fuel'),
    'password': os.environ.get('MYSQL_PASSWORD', 'fuel123'),
    'database': os.environ.get('MYSQL_DATABASE', 'fuel_tracker'),
    'charset': 'utf8mb4',
    'cursorclass': DictCursor,
}


def get_db():
    return pymysql.connect(**DB_CONFIG)


def exec_sql(sql, params=None, fetch=True):
    """执行 SQL，返回结果列表（fetch=True）或影响行数"""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            if fetch:
                result = cur.fetchall()
            else:
                conn.commit()
                result = cur.rowcount
        return result
    finally:
        conn.close()


# --- 首页 ---

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


# --- 车辆 API ---

@app.route('/api/vehicles', methods=['GET'])
def list_vehicles():
    rows = exec_sql('SELECT * FROM vehicles ORDER BY created_at')
    return jsonify(rows)


@app.route('/api/vehicles', methods=['POST'])
def create_vehicle():
    data = request.json
    vid = data.get('id', _gen_id())
    exec_sql(
        'INSERT INTO vehicles (id, name, plate, tank, model) VALUES (%s,%s,%s,%s,%s)',
        [vid, data.get('name',''), data.get('plate',''), data.get('tank',50), data.get('model','')],
        fetch=False
    )
    rows = exec_sql('SELECT * FROM vehicles WHERE id=%s', [vid])
    return jsonify(rows[0]), 201


@app.route('/api/vehicles/<vid>', methods=['PUT'])
def update_vehicle(vid):
    data = request.json
    exec_sql(
        'UPDATE vehicles SET name=%s, plate=%s, tank=%s, model=%s WHERE id=%s',
        [data.get('name',''), data.get('plate',''), data.get('tank',50), data.get('model',''), vid],
        fetch=False
    )
    rows = exec_sql('SELECT * FROM vehicles WHERE id=%s', [vid])
    if not rows:
        return jsonify({'error': 'not found'}), 404
    return jsonify(rows[0])


@app.route('/api/vehicles/<vid>', methods=['DELETE'])
def delete_vehicle(vid):
    exec_sql('DELETE FROM vehicles WHERE id=%s', [vid], fetch=False)
    return '', 204


# --- 加油记录 API ---

@app.route('/api/vehicles/<vid>/records', methods=['GET'])
def list_records(vid):
    rows = exec_sql(
        'SELECT * FROM fuel_records WHERE vehicle_id=%s ORDER BY record_date, created_at',
        [vid]
    )
    return jsonify(rows)


@app.route('/api/vehicles/<vid>/records', methods=['POST'])
def create_record(vid):
    data = request.json
    rid = data.get('id', _gen_id())
    exec_sql(
        '''INSERT INTO fuel_records
           (id, vehicle_id, record_date, odometer, liters, price, total_cost,
            full_tank, station, fuel_type, note, purpose)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        [rid, vid,
         data['date'], data['odo'], data['liters'], data['price'],
         data['liters'] * data['price'],
         data.get('fullTank', 'yes'), data.get('station', ''),
         data.get('fuelType', '92'), data.get('note', ''),
         data.get('purpose', 'commute')],
        fetch=False
    )
    rows = exec_sql('SELECT * FROM fuel_records WHERE id=%s', [rid])
    return jsonify(rows[0]), 201


@app.route('/api/vehicles/<vid>/records/<rid>', methods=['PUT'])
def update_record(vid, rid):
    data = request.json
    exec_sql(
        '''UPDATE fuel_records SET
           record_date=%s, odometer=%s, liters=%s, price=%s, total_cost=%s,
           full_tank=%s, station=%s, fuel_type=%s, note=%s, purpose=%s
           WHERE id=%s AND vehicle_id=%s''',
        [data['date'], data['odo'], data['liters'], data['price'],
         data['liters'] * data['price'],
         data.get('fullTank', 'yes'), data.get('station', ''),
         data.get('fuelType', '92'), data.get('note', ''),
         data.get('purpose', 'commute'),
         rid, vid],
        fetch=False
    )
    rows = exec_sql('SELECT * FROM fuel_records WHERE id=%s', [rid])
    if not rows:
        return jsonify({'error': 'not found'}), 404
    return jsonify(rows[0])


@app.route('/api/vehicles/<vid>/records/<rid>', methods=['DELETE'])
def delete_record(vid, rid):
    exec_sql('DELETE FROM fuel_records WHERE id=%s AND vehicle_id=%s', [rid, vid], fetch=False)
    return '', 204


# --- 保养记录 API ---

@app.route('/api/vehicles/<vid>/maintenance', methods=['GET'])
def list_maintenance(vid):
    rows = exec_sql(
        'SELECT * FROM maint_records WHERE vehicle_id=%s ORDER BY record_date',
        [vid]
    )
    return jsonify(rows)


@app.route('/api/vehicles/<vid>/maintenance', methods=['POST'])
def create_maintenance(vid):
    data = request.json
    mid = data.get('id', _gen_id())
    exec_sql(
        '''INSERT INTO maint_records
           (id, vehicle_id, record_date, odometer, maint_type, item, cost, note, next_date, next_odo)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        [mid, vid, data['date'], data.get('odo', 0), data.get('type', ''),
         data.get('item', ''), data.get('cost', 0), data.get('note', ''),
         data.get('nextDate'), data.get('nextOdo')],
        fetch=False
    )
    rows = exec_sql('SELECT * FROM maint_records WHERE id=%s', [mid])
    return jsonify(rows[0]), 201


@app.route('/api/vehicles/<vid>/maintenance/<mid>', methods=['DELETE'])
def delete_maintenance(vid, mid):
    exec_sql('DELETE FROM maint_records WHERE id=%s AND vehicle_id=%s', [mid, vid], fetch=False)
    return '', 204


# --- 数据导入导出 ---

@app.route('/api/export', methods=['GET'])
def export_all():
    vehicles = exec_sql('SELECT * FROM vehicles ORDER BY created_at')
    result = []
    for v in vehicles:
        records = exec_sql(
            'SELECT * FROM fuel_records WHERE vehicle_id=%s ORDER BY record_date, created_at',
            [v['id']]
        )
        maint = exec_sql(
            'SELECT * FROM maint_records WHERE vehicle_id=%s ORDER BY record_date',
            [v['id']]
        )
        result.append({
            'vehicle': v,
            'records': records,
            'maintenance': maint,
        })
    return jsonify(result)


@app.route('/api/import', methods=['POST'])
def import_all():
    data = request.json
    count = {'vehicles': 0, 'records': 0, 'maintenance': 0}
    for entry in data:
        v = entry['vehicle']
        exists = exec_sql('SELECT id FROM vehicles WHERE id=%s', [v['id']])
        if not exists:
            exec_sql(
                'INSERT INTO vehicles (id, name, plate, tank, model) VALUES (%s,%s,%s,%s,%s)',
                [v['id'], v['name'], v['plate'], v['tank'], v['model']],
                fetch=False
            )
            count['vehicles'] += 1
        for r in entry.get('records', []):
            exists_r = exec_sql('SELECT id FROM fuel_records WHERE id=%s', [r['id']])
            if not exists_r:
                exec_sql(
                    '''INSERT INTO fuel_records
                       (id, vehicle_id, record_date, odometer, liters, price, total_cost,
                        full_tank, station, fuel_type, note, purpose)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                    [r['id'], v['id'], r['record_date'], r['odometer'], r['liters'],
                     r['price'], r['total_cost'], r['full_tank'], r.get('station',''),
                     r.get('fuel_type','92'), r.get('note',''), r.get('purpose','commute')],
                    fetch=False
                )
                count['records'] += 1
        for m in entry.get('maintenance', []):
            exists_m = exec_sql('SELECT id FROM maint_records WHERE id=%s', [m['id']])
            if not exists_m:
                exec_sql(
                    '''INSERT INTO maint_records
                       (id, vehicle_id, record_date, odometer, maint_type, item, cost, note, next_date, next_odo)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                    [m['id'], v['id'], m['record_date'], m.get('odometer',0),
                     m.get('maint_type',''), m.get('item',''), m.get('cost',0),
                     m.get('note',''), m.get('next_date'), m.get('next_odo')],
                    fetch=False
                )
                count['maintenance'] += 1
    return jsonify(count)


# --- 健康检查 ---

@app.route('/api/health')
def health():
    try:
        conn = get_db()
        conn.ping()
        conn.close()
        return jsonify({'status': 'ok', 'database': 'connected'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- 工具 ---

def _gen_id():
    import time, random, string
    ts = int(time.time() * 1000)
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f'r{ts:x}_{rand}'


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
