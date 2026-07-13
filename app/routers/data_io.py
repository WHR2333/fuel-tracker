"""Import / Export — CSV format with Chinese headers, ZIP packaging.

Export: ZIP with 3 CSV files (车辆.csv / 加油记录.csv / 保养记录.csv).
Import: incremental upsert, vehicle association by name, data validation.
"""
from __future__ import annotations

import csv
import io
import zipfile
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.fuel_record import FuelRecord
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.security import CurrentUser, verify_token
from app.services.helpers import gen_id

router = APIRouter(prefix="/api/v1/data", tags=["data"])


# ── Column mappings (Chinese ↔ internal) ──────────────────────────────────

VEHICLE_COLS = {
    "车辆名称": "name",
    "车牌号": "plate",
    "车型": "model",
}

RECORD_COLS = {
    "车辆名称": "_vehicle_name",  # resolved to vehicle_id on import
    "日期": "record_date",
    "里程(公里)": "odometer",
    "加油量(升)": "liters",
    "单价(元/升)": "price",
    "是否加满": "full_tank",       # 加满 / 未加满
    "油品": "fuel_type",
    "加油站": "station",
    "备注": "note",
    "油量灯亮": "light",           # 是 / 否
    "上次加油没记录": "skipped_previous",  # 是 / 否
    "机显金额": "pump_amount",
    "实付金额": "paid_amount",
}

MAINT_COLS = {
    "车辆名称": "_vehicle_name",
    "日期": "record_date",
    "里程(公里)": "odometer",
    "保养类型": "maint_type",
    "自定义名称": "custom_name",
    "项目": "item",
    "费用(元)": "cost",
    "备注": "note",
    "提醒方式": "trigger",         # 日期 / 里程 / 都提醒 / 不提醒
    "下次日期": "next_date",
    "下次里程(公里)": "next_odo",
}

TRIGGER_MAP = {"日期": "date", "里程": "odo", "都提醒": "either", "不提醒": "none"}
TRIGGER_MAP_REVERSE = {v: k for k, v in TRIGGER_MAP.items()}


# ── Helpers ────────────────────────────────────────────────────────────────

def _csv_str(rows: list[dict], col_map: dict[str, str]) -> str:
    """Write rows to CSV string using Chinese headers."""
    buf = io.StringIO()
    headers = list(col_map.keys())
    writer = csv.DictWriter(buf, fieldnames=headers)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


def _safe_decimal(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None


# ── Export ─────────────────────────────────────────────────────────────────

@router.get("/export")
def export_csv(
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
):
    """Export current user's data as a ZIP of 3 CSV files."""
    vehicles = list(
        session.execute(select(Vehicle).where(Vehicle.user_id == current.id))
        .scalars().all()
    )
    vname_map = {v.id: v.name for v in vehicles}
    vids = {v.id for v in vehicles}

    records = list(
        session.execute(select(FuelRecord).where(FuelRecord.vehicle_id.in_(vids or {""})))
        .scalars().all()
    )
    maints = list(
        session.execute(select(MaintenanceRecord).where(MaintenanceRecord.vehicle_id.in_(vids or {""})))
        .scalars().all()
    )

    # Build vehicle rows.
    v_rows = [
        {"车辆名称": v.name, "车牌号": v.plate, "车型": v.model}
        for v in vehicles
    ]

    # Build record rows.
    r_rows = []
    for r in records:
        r_rows.append({
            "车辆名称": vname_map.get(r.vehicle_id, ""),
            "日期": str(r.record_date)[:10],
            "里程(公里)": r.odometer,
            "加油量(升)": r.liters,
            "单价(元/升)": r.price,
            "是否加满": "加满" if r.full_tank == "yes" else "未加满",
            "油品": r.fuel_type,
            "加油站": r.station,
            "备注": r.note,
            "油量灯亮": "是" if r.light else "否",
            "上次加油没记录": "是" if r.skipped_previous else "否",
            "机显金额": r.pump_amount or "",
            "实付金额": r.paid_amount or "",
        })

    # Build maintenance rows.
    m_rows = []
    for m in maints:
        m_rows.append({
            "车辆名称": vname_map.get(m.vehicle_id, ""),
            "日期": str(m.record_date)[:10],
            "里程(公里)": m.odometer,
            "保养类型": m.maint_type,
            "自定义名称": m.custom_name,
            "项目": m.item,
            "费用(元)": m.cost,
            "备注": m.note,
            "提醒方式": TRIGGER_MAP_REVERSE.get(m.trigger, "都提醒"),
            "下次日期": str(m.next_date)[:10] if m.next_date else "",
            "下次里程(公里)": m.next_odo or "",
        })

    # Pack into ZIP.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("车辆.csv", "﻿" + _csv_str(v_rows, VEHICLE_COLS))
        zf.writestr("加油记录.csv", "﻿" + _csv_str(r_rows, RECORD_COLS))
        zf.writestr("保养记录.csv", "﻿" + _csv_str(m_rows, MAINT_COLS))
    buf.seek(0)

    filename = f"省油的灯_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Import ─────────────────────────────────────────────────────────────────

class ImportError_(Exception):
    """Raised when import validation fails."""
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"{len(errors)} validation errors")


def _read_csv(zf: zipfile.ZipFile, filename: str, col_map: dict[str, str]) -> list[dict]:
    """Read a CSV from the ZIP, map Chinese headers to internal keys."""
    if filename not in zf.namelist():
        return []
    raw = zf.read(filename).decode("utf-8-sig")  # strip BOM
    reader = csv.DictReader(io.StringIO(raw))
    rows = []
    for row in reader:
        mapped = {}
        for zh_col, internal in col_map.items():
            mapped[internal] = row.get(zh_col, "").strip()
        rows.append(mapped)
    return rows


def _validate_import(
    v_rows: list[dict],
    r_rows: list[dict],
    m_rows: list[dict],
) -> list[str]:
    """Validate import data. Returns list of error messages (empty = OK)."""
    errors: list[str] = []

    # Validate vehicles.
    vnames = set()
    for i, v in enumerate(v_rows, 1):
        name = v.get("name", "")
        if not name:
            errors.append(f"车辆第{i}行：车辆名称不能为空")
        elif name in vnames:
            errors.append(f"车辆第{i}行：车辆名称「{name}」重复")
        vnames.add(name)

    # Validate fuel records.
    for i, r in enumerate(r_rows, 1):
        vname = r.get("_vehicle_name", "")
        if not vname:
            errors.append(f"加油记录第{i}行：车辆名称不能为空")
        elif vname not in vnames:
            errors.append(f"加油记录第{i}行：车辆「{vname}」不存在于车辆表中")

        d = r.get("record_date", "")
        if not d:
            errors.append(f"加油记录第{i}行：日期不能为空")
        else:
            try:
                date.fromisoformat(d[:10])
            except ValueError:
                errors.append(f"加油记录第{i}行：日期格式错误「{d}」，应为 YYYY-MM-DD")

        odo = _safe_decimal(r.get("odometer"))
        if odo is None or odo < 0:
            errors.append(f"加油记录第{i}行：里程必须为非负数")

        liters = _safe_decimal(r.get("liters"))
        if liters is None or liters <= 0:
            errors.append(f"加油记录第{i}行：加油量必须为正数")

        price = _safe_decimal(r.get("price"))
        if price is None or price <= 0:
            errors.append(f"加油记录第{i}行：单价必须为正数")

        ft = r.get("full_tank", "")
        if ft not in ("加满", "未加满"):
            errors.append(f"加油记录第{i}行：是否加满 应为「加满」或「未加满」")

    # Validate maintenance records.
    for i, m in enumerate(m_rows, 1):
        vname = m.get("_vehicle_name", "")
        if not vname:
            errors.append(f"保养记录第{i}行：车辆名称不能为空")
        elif vname not in vnames:
            errors.append(f"保养记录第{i}行：车辆「{vname}」不存在于车辆表中")

        d = m.get("record_date", "")
        if d:
            try:
                date.fromisoformat(d[:10])
            except ValueError:
                errors.append(f"保养记录第{i}行：日期格式错误「{d}」")

    return errors


@router.post("/import")
async def import_csv(
    file: UploadFile,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
):
    """Import from a ZIP of CSVs. Incremental upsert with validation."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "请上传 ZIP 文件")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(400, "无效的 ZIP 文件")

    v_rows = _read_csv(zf, "车辆.csv", VEHICLE_COLS)
    r_rows = _read_csv(zf, "加油记录.csv", RECORD_COLS)
    m_rows = _read_csv(zf, "保养记录.csv", MAINT_COLS)

    if not v_rows and not r_rows and not m_rows:
        raise HTTPException(400, "ZIP 中未找到有效的 CSV 文件")

    # Validate.
    errors = _validate_import(v_rows, r_rows, m_rows)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": f"数据校验失败（{len(errors)} 项）", "errors": errors[:20]},
        )

    # Build vehicle name → id mapping (existing + newly created).
    existing_vehicles = {
        v.name: v for v in
        session.execute(select(Vehicle).where(Vehicle.user_id == current.id))
        .scalars().all()
    }
    vname_to_id: dict[str, str] = {}

    counts = {"vehicles": 0, "records": 0, "maint": 0, "skipped": 0}

    # Upsert vehicles.
    for v in v_rows:
        name = v["name"]
        if name in existing_vehicles:
            veh = existing_vehicles[name]
            veh.plate = v.get("plate", veh.plate)
            veh.model = v.get("model", veh.model)
            vname_to_id[name] = veh.id
        else:
            vid = gen_id("v")
            session.add(Vehicle(
                id=vid, user_id=current.id,
                name=name,
                plate=v.get("plate", ""),
                model=v.get("model", ""),
            ))
            vname_to_id[name] = vid
        counts["vehicles"] += 1
    session.flush()

    # Upsert fuel records (dedup by vehicle_id + date + odometer).
    for r in r_rows:
        vid = vname_to_id.get(r["_vehicle_name"], "")
        if not vid:
            continue
        d = r["record_date"][:10]
        odo = _safe_decimal(r.get("odometer")) or Decimal("0")
        liters = _safe_decimal(r.get("liters")) or Decimal("0")
        price = _safe_decimal(r.get("price")) or Decimal("0")
        total = round(liters * price, 3)
        pump = _safe_decimal(r.get("pump_amount")) or total
        paid = _safe_decimal(r.get("paid_amount")) or pump
        ft = "yes" if r.get("full_tank") == "加满" else "no"
        light = r.get("light") == "是"
        skipped = r.get("skipped_previous") == "是"

        # Dedup: find existing record with same vehicle + date + odometer.
        existing = session.execute(
            select(FuelRecord).where(
                FuelRecord.vehicle_id == vid,
                FuelRecord.record_date == d,
                FuelRecord.odometer == odo,
            )
        ).scalars().first()

        if existing:
            # Update existing.
            existing.liters = liters
            existing.price = price
            existing.total_cost = total
            existing.pump_amount = pump
            existing.paid_amount = paid
            existing.full_tank = ft
            existing.fuel_type = r.get("fuel_type", "92")
            existing.station = r.get("station", "")
            existing.note = r.get("note", "")
            existing.light = light
            existing.skipped_previous = skipped
        else:
            session.add(FuelRecord(
                id=gen_id("r"), vehicle_id=vid,
                record_date=d, odometer=odo,
                liters=liters, price=price, total_cost=total,
                pump_amount=pump, paid_amount=paid,
                full_tank=ft,
                fuel_type=r.get("fuel_type", "92"),
                station=r.get("station", ""),
                note=r.get("note", ""),
                light=light, skipped_previous=skipped,
            ))
        counts["records"] += 1

    # Upsert maintenance records (dedup by vehicle_id + date + item).
    for m in m_rows:
        vid = vname_to_id.get(m["_vehicle_name"], "")
        if not vid:
            continue
        d = m.get("record_date", "")[:10]
        item = m.get("item", "")

        existing = session.execute(
            select(MaintenanceRecord).where(
                MaintenanceRecord.vehicle_id == vid,
                MaintenanceRecord.record_date == d,
                MaintenanceRecord.item == item,
            )
        ).scalars().first()

        trigger = TRIGGER_MAP.get(m.get("trigger", ""), "either")
        next_date_str = m.get("next_date", "")
        next_date_val = next_date_str[:10] if next_date_str else None
        next_odo = _safe_decimal(m.get("next_odo"))

        if existing:
            existing.odometer = _safe_decimal(m.get("odometer")) or Decimal("0")
            existing.maint_type = m.get("maint_type", "")
            existing.custom_name = m.get("custom_name", "")
            existing.cost = _safe_decimal(m.get("cost")) or Decimal("0")
            existing.note = m.get("note", "")
            existing.trigger = trigger
            existing.next_date = next_date_val
            existing.next_odo = next_odo
        else:
            session.add(MaintenanceRecord(
                id=gen_id("m"), vehicle_id=vid,
                record_date=d,
                odometer=_safe_decimal(m.get("odometer")) or Decimal("0"),
                maint_type=m.get("maint_type", ""),
                custom_name=m.get("custom_name", ""),
                item=item,
                cost=_safe_decimal(m.get("cost")) or Decimal("0"),
                note=m.get("note", ""),
                trigger=trigger,
                next_date=next_date_val,
                next_odo=next_odo,
            ))
        counts["maint"] += 1

    return counts
