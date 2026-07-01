FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py schema.sql ./
COPY static/ ./static/

EXPOSE 5000

# 启动时自动初始化数据库
CMD ["sh", "-c", "python -c 'import pymysql; c=pymysql.connect(host=\"$MYSQL_HOST\",port=int(\"${MYSQL_PORT:-3306}\"),user=\"$MYSQL_USER\",password=\"$MYSQL_PASSWORD\"); c.cursor().execute(\"CREATE DATABASE IF NOT EXISTS fuel_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci\"); c.close()' && python app.py"]
