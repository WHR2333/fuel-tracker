"""Admin / data-portability router — scoped to current user's data."""
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
from app.security import CurrentUser, verify_token

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _row_to_dict(row) -> dict[str, Any]:
    return {c.name: _to_jsonable(getattr(row, c.name)) for c in row.__table__.columns}


@router.get("/export")
def export_data(
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Export only the current user's data."""
    vehicles = list(
        session.execute(select(Vehicle).where(Vehicle.user_id == current.id)).scalars().all()
    )
    vids = {v.id for v in vehicles}
    records = list(
        session.execute(select(FuelRecord).where(FuelRecord.vehicle_id.in_(vids or {""}))).scalars().all()
    )
    maint = list(
        session.execute(select(MaintenanceRecord).where(MaintenanceRecord.vehicle_id.in_(vids or {""}))).scalars().all()
    )
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
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    """Import data scoped to the current user."""
    incoming_vids = {v["id"] for v in payload.vehicles if "id" in v}

    # Only touch vehicles/records belonging to this user.
    user_vids = {
        v.id for v in
        session.execute(select(Vehicle).where(Vehicle.user_id == current.id)).scalars().all()
    }
    affected_vids = user_vids & incoming_vids if incoming_vids else set()

    session.execute(delete(FuelRecord).where(FuelRecord.vehicle_id.in_(affected_vids or {""})))
    session.execute(delete(MaintenanceRecord).where(MaintenanceRecord.vehicle_id.in_(affected_vids or {""})))

    counts = {"vehicles": 0, "records": 0, "maint": 0}
    for v in payload.vehicles:
        if "id" not in v:
            continue
        existing = session.get(Vehicle, v["id"])
        if existing:
            if existing.user_id != current.id:
                continue
            for k, val in v.items():
                setattr(existing, k, val)
        else:
            session.add(Vehicle(
                **{k: v[k] for k in ("id", "name", "plate", "tank", "model") if k in v},
                user_id=current.id,
            ))
        counts["vehicles"] += 1

    for r in payload.records:
        if "id" not in r or "vehicle_id" not in r:
            continue
        if r["vehicle_id"] not in incoming_vids:
            continue
        existing = session.get(FuelRecord, r["id"])
        fields = {k: r[k] for k in r if k != "created_at"}
        if existing:
            for k, val in fields.items():
                setattr(existing, k, val)
        else:
            fields.setdefault("light", False)
            session.add(FuelRecord(**fields))
        counts["records"] += 1

    for m in payload.maint:
        if "id" not in m or "vehicle_id" not in m:
            continue
        if m["vehicle_id"] not in incoming_vids:
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
