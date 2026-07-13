"""Vehicle CRUD router — scoped to the current user."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.vehicle import Vehicle
from app.schemas import VehicleCreate, VehicleRead
from app.security import CurrentUser, verify_token
from app.services.helpers import gen_id, get_user_vehicle

router = APIRouter(prefix="/api/v1/vehicles", tags=["vehicles"])


def _to_read(v: Vehicle) -> VehicleRead:
    data = {c.name: getattr(v, c.name) for c in Vehicle.__table__.columns}
    data.setdefault("created_at", datetime.utcnow())
    data.setdefault("updated_at", datetime.utcnow())
    return VehicleRead(**data)


@router.get("", response_model=list[VehicleRead])
def list_vehicles(
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> list[VehicleRead]:
    rows = session.execute(
        select(Vehicle).where(Vehicle.user_id == current.id).order_by(Vehicle.created_at)
    ).scalars().all()
    return [_to_read(v) for v in rows]


@router.post("", response_model=VehicleRead, status_code=201)
def create_vehicle(
    payload: VehicleCreate,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> VehicleRead:
    vid = payload.id or gen_id("v")
    if session.get(Vehicle, vid):
        raise HTTPException(409, f"vehicle {vid} already exists")
    vehicle = Vehicle(
        id=vid,
        user_id=current.id,
        name=payload.name,
        plate=payload.plate,
        tank=payload.tank,
        model=payload.model,
    )
    session.add(vehicle)
    session.flush()
    session.refresh(vehicle)
    return _to_read(vehicle)


@router.get("/{vid}", response_model=VehicleRead)
def get_vehicle(
    vid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> VehicleRead:
    return _to_read(get_user_vehicle(vid, current.id, session))


@router.put("/{vid}", response_model=VehicleRead)
def update_vehicle(
    vid: str,
    payload: VehicleCreate,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> VehicleRead:
    v = get_user_vehicle(vid, current.id, session)
    v.name = payload.name
    v.plate = payload.plate
    v.tank = payload.tank
    v.model = payload.model
    session.add(v)
    session.flush()
    session.refresh(v)
    return _to_read(v)


@router.delete("/{vid}", status_code=204)
def delete_vehicle(
    vid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> None:
    v = get_user_vehicle(vid, current.id, session)
    session.delete(v)


@router.delete("", status_code=200)
def delete_all_vehicles(
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> dict:
    """Delete ALL vehicles (and cascaded records) for the current user."""
    rows = session.execute(
        select(Vehicle).where(Vehicle.user_id == current.id)
    ).scalars().all()
    for v in rows:
        session.delete(v)
    return {"deleted": len(rows)}
