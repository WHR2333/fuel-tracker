"""Fuel record CRUD router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.fuel_record import FuelRecord
from app.models.vehicle import Vehicle
from app.schemas import FuelRecordCreate, FuelRecordRead
from app.security import verify_token
from app.services.helpers import calc_total_cost, gen_id

router = APIRouter(
    tags=["records"],
    dependencies=[Depends(verify_token)],
)


def _apply(payload: FuelRecordCreate, r: FuelRecord) -> None:
    total = calc_total_cost(float(payload.liters), float(payload.price))
    r.record_date = payload.record_date
    r.odometer = payload.odometer
    r.liters = payload.liters
    r.price = payload.price
    r.total_cost = total
    # Pump amount defaults to the canonical total_cost; client may override.
    r.pump_amount = payload.pump_amount if payload.pump_amount is not None else total
    r.paid_amount = payload.paid_amount if payload.paid_amount is not None else r.pump_amount
    r.full_tank = payload.full_tank
    r.station = payload.station
    r.fuel_type = payload.fuel_type
    r.note = payload.note
    r.light = payload.light


@router.get("/api/v1/vehicles/{vid}/records", response_model=list[FuelRecordRead])
def list_records(vid: str, session: Session = Depends(get_session)) -> list[FuelRecord]:
    if not session.get(Vehicle, vid):
        raise HTTPException(404, "vehicle not found")
    stmt = (
        select(FuelRecord)
        .where(FuelRecord.vehicle_id == vid)
        .order_by(FuelRecord.record_date, FuelRecord.created_at)
    )
    return list(session.execute(stmt).scalars().all())


@router.post(
    "/api/v1/vehicles/{vid}/records",
    response_model=FuelRecordRead,
    status_code=201,
)
def create_record(
    vid: str,
    payload: FuelRecordCreate,
    session: Session = Depends(get_session),
) -> FuelRecord:
    if not session.get(Vehicle, vid):
        raise HTTPException(404, "vehicle not found")
    rid = payload.id or gen_id("r")
    if session.get(FuelRecord, rid):
        raise HTTPException(409, f"record {rid} already exists")
    rec = FuelRecord(id=rid, vehicle_id=vid)
    _apply(payload, rec)
    session.add(rec)
    session.flush()
    session.refresh(rec)
    return rec


@router.put("/api/v1/records/{rid}", response_model=FuelRecordRead)
def update_record(
    rid: str,
    payload: FuelRecordCreate,
    session: Session = Depends(get_session),
) -> FuelRecord:
    rec = session.get(FuelRecord, rid)
    if not rec:
        raise HTTPException(404, "record not found")
    _apply(payload, rec)
    session.add(rec)
    session.flush()
    session.refresh(rec)
    return rec


@router.delete("/api/v1/records/{rid}", status_code=204)
def delete_record(rid: str, session: Session = Depends(get_session)) -> None:
    rec = session.get(FuelRecord, rid)
    if not rec:
        raise HTTPException(404, "record not found")
    session.delete(rec)