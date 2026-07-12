"""Vehicle CRUD router."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.vehicle import Vehicle
from app.schemas import VehicleCreate, VehicleRead
from app.security import verify_api_key
from app.services.helpers import gen_id

router = APIRouter(
    prefix="/api/v1/vehicles",
    tags=["vehicles"],
    dependencies=[Depends(verify_api_key)],
)


def _to_read(v: Vehicle) -> VehicleRead:
    data = {c.name: getattr(v, c.name) for c in Vehicle.__table__.columns}
    # ensure timestamps exist even if server_default didn't populate
    data.setdefault("created_at", datetime.utcnow())
    data.setdefault("updated_at", datetime.utcnow())
    return VehicleRead(**data)


@router.get("", response_model=list[VehicleRead])
def list_vehicles(session: Session = Depends(get_session)) -> list[VehicleRead]:
    rows = session.execute(select(Vehicle).order_by(Vehicle.created_at)).scalars().all()
    return [_to_read(v) for v in rows]


@router.post("", response_model=VehicleRead, status_code=201)
def create_vehicle(
    payload: VehicleCreate,
    session: Session = Depends(get_session),
) -> VehicleRead:
    vid = payload.id or gen_id("v")
    if session.get(Vehicle, vid):
        raise HTTPException(409, f"vehicle {vid} already exists")
    vehicle = Vehicle(
        id=vid,
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
def get_vehicle(vid: str, session: Session = Depends(get_session)) -> VehicleRead:
    v = session.get(Vehicle, vid)
    if not v:
        raise HTTPException(404, "vehicle not found")
    return _to_read(v)


@router.put("/{vid}", response_model=VehicleRead)
def update_vehicle(
    vid: str,
    payload: VehicleCreate,
    session: Session = Depends(get_session),
) -> VehicleRead:
    v = session.get(Vehicle, vid)
    if not v:
        raise HTTPException(404, "vehicle not found")
    v.name = payload.name
    v.plate = payload.plate
    v.tank = payload.tank
    v.model = payload.model
    session.add(v)
    session.flush()
    session.refresh(v)
    return _to_read(v)


@router.delete("/{vid}", status_code=204)
def delete_vehicle(vid: str, session: Session = Depends(get_session)) -> None:
    v = session.get(Vehicle, vid)
    if not v:
        raise HTTPException(404, "vehicle not found")
    session.delete(v)