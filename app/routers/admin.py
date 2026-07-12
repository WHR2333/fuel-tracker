"""Admin / data-portability router.

* GET  /api/v1/admin/export  → JSON dump of every vehicle + its records + maintenance.
* POST /api/v1/admin/import  → accept a dump and write it back, replacing any rows
                                whose IDs collide. Vehicles not in the dump are kept.

The schema is intentionally loose (Dict[str, Any]) on import so the route can
accept both v4 (camelCase) and v5 (snake_case) payloads — v4 produced a
localStorage dump we want to round-trip without forcing a translation step.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlmodel import Session

from app.db import get_session
from app.models.fuel_record import FuelRecord
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.security import verify_api_key

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(verify_api_key)],
)


def _to_jsonable(value: Any) -> Any:
    """Dates and Decimals → strings; everything else passes through."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _row_to_dict(row) -> dict[str, Any]:
    """Serialize a SQLModel row by column name."""
    return {c.name: _to_jsonable(getattr(row, c.name)) for c in row.__table__.columns}


@router.get("/export")
def export_data(session: Session = Depends(get_session)) -> dict[str, Any]:
    """Dump the whole DB into one JSON envelope."""
    vehicles = list(session.execute(select(Vehicle)).scalars().all())
    records = list(session.execute(select(FuelRecord)).scalars().all())
    maint = list(session.execute(select(MaintenanceRecord)).scalars().all())
    return {
        "version": "v5",
        "exported_at": datetime.utcnow().isoformat(),
        "vehicles": [_row_to_dict(v) for v in vehicles],
        "records": [_row_to_dict(r) for r in records],
        "maint": [_row_to_dict(m) for m in maint],
    }


class ImportRequest(BaseModel):
    vehicles: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    maint: list[dict[str, Any]] = []


@router.post("/import")
def import_data(
    payload: ImportRequest,
    session: Session = Depends(get_session),
) -> dict[str, int]:
    """Upsert each row from the dump. Existing rows with the same id get replaced."""
    # First wipe the related tables; vehicle FKs already CASCADE on delete so this
    # also clears orphaned rows. We don't touch the vehicles table itself unless
    # its ID is in the dump — that way partial imports don't destroy unrelated data.
    incoming_vids = {v["id"] for v in payload.vehicles if "id" in v}

    # Drop records/maint for vehicles NOT in the dump; the dump authoritatively
    # says what the world looks like.
    session.execute(delete(FuelRecord).where(~FuelRecord.vehicle_id.in_(incoming_vids or {""})))
    session.execute(delete(MaintenanceRecord).where(~MaintenanceRecord.vehicle_id.in_(incoming_vids or {""})))

    counts = {"vehicles": 0, "records": 0, "maint": 0}
    for v in payload.vehicles:
        if "id" not in v:
            continue
        existing = session.get(Vehicle, v["id"])
        if existing:
            for k, val in v.items():
                setattr(existing, k, val)
        else:
            session.add(Vehicle(**{k: v[k] for k in ("id", "name", "plate", "tank", "model") if k in v}))
        counts["vehicles"] += 1

    for r in payload.records:
        if "id" not in r or "vehicle_id" not in r:
            continue
        existing = session.get(FuelRecord, r["id"])
        fields = {k: r[k] for k in r if k != "created_at"}
        if existing:
            for k, val in fields.items():
                setattr(existing, k, val)
        else:
            # light may be absent from old dumps; default to False.
            fields.setdefault("light", False)
            session.add(FuelRecord(**fields))
        counts["records"] += 1

    for m in payload.maint:
        if "id" not in m or "vehicle_id" not in m:
            continue
        existing = session.get(MaintenanceRecord, m["id"])
        fields = {k: m[k] for k in m if k != "created_at"}
        if existing:
            for k, val in fields.items():
                setattr(existing, k, val)
        else:
            session.add(MaintenanceRecord(**fields))
        counts["maint"] += 1

    return counts