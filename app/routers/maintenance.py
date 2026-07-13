"""Maintenance record CRUD router — scoped to current user's vehicles."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.maintenance import MaintenanceRecord
from app.schemas import MaintenanceCreate, MaintenanceRead
from app.security import CurrentUser, verify_token
from app.services.helpers import gen_id, get_user_vehicle

router = APIRouter(tags=["maintenance"])


def _apply(payload: MaintenanceCreate, m: MaintenanceRecord) -> None:
    m.record_date = payload.record_date
    m.odometer = payload.odometer
    m.maint_type = payload.maint_type
    m.custom_name = payload.custom_name
    m.item = payload.item
    m.cost = payload.cost
    m.note = payload.note
    m.trigger = payload.trigger
    m.next_date = payload.next_date
    m.next_odo = payload.next_odo


@router.get(
    "/api/v1/vehicles/{vid}/maintenance",
    response_model=list[MaintenanceRead],
)
def list_maintenance(
    vid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> list[MaintenanceRecord]:
    get_user_vehicle(vid, current.id, session)
    stmt = (
        select(MaintenanceRecord)
        .where(MaintenanceRecord.vehicle_id == vid)
        .order_by(MaintenanceRecord.record_date)
    )
    return list(session.execute(stmt).scalars().all())


@router.post(
    "/api/v1/vehicles/{vid}/maintenance",
    response_model=MaintenanceRead,
    status_code=201,
)
def create_maintenance(
    vid: str,
    payload: MaintenanceCreate,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> MaintenanceRecord:
    get_user_vehicle(vid, current.id, session)
    mid = payload.id or gen_id("m")
    if session.get(MaintenanceRecord, mid):
        raise HTTPException(409, f"maintenance {mid} already exists")
    m = MaintenanceRecord(id=mid, vehicle_id=vid)
    _apply(payload, m)
    session.add(m)
    session.flush()
    session.refresh(m)
    return m


def _get_maint_for_user(mid: str, user_id: str, session: Session) -> MaintenanceRecord:
    m = session.get(MaintenanceRecord, mid)
    if not m:
        raise HTTPException(404, "maintenance not found")
    get_user_vehicle(m.vehicle_id, user_id, session)
    return m


@router.put("/api/v1/maintenance/{mid}", response_model=MaintenanceRead)
def update_maintenance(
    mid: str,
    payload: MaintenanceCreate,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> MaintenanceRecord:
    m = _get_maint_for_user(mid, current.id, session)
    _apply(payload, m)
    session.add(m)
    session.flush()
    session.refresh(m)
    return m


@router.delete("/api/v1/maintenance/{mid}", status_code=204)
def delete_maintenance(
    mid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> None:
    m = _get_maint_for_user(mid, current.id, session)
    session.delete(m)
