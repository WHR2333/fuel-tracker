"""Fuel record CRUD router — scoped to current user's vehicles."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.fuel_record import FuelRecord
from app.schemas import FuelRecordCreate, FuelRecordRead
from app.security import CurrentUser, verify_token
from app.services.helpers import calc_total_cost, gen_id, get_user_vehicle

router = APIRouter(tags=["records"])


def _apply(payload: FuelRecordCreate, r: FuelRecord) -> None:
    total = calc_total_cost(float(payload.liters), float(payload.price))
    r.record_date = payload.record_date
    r.odometer = payload.odometer
    r.liters = payload.liters
    r.price = payload.price
    r.total_cost = total
    r.pump_amount = payload.pump_amount if payload.pump_amount is not None else total
    r.paid_amount = payload.paid_amount if payload.paid_amount is not None else r.pump_amount
    r.full_tank = payload.full_tank
    r.station = payload.station
    r.fuel_type = payload.fuel_type
    r.note = payload.note
    r.light = payload.light
    r.skipped_previous = payload.skipped_previous


@router.get("/api/v1/vehicles/{vid}/records", response_model=list[FuelRecordRead])
def list_records(
    vid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> list[FuelRecord]:
    get_user_vehicle(vid, current.id, session)
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
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> FuelRecord:
    get_user_vehicle(vid, current.id, session)
    rid = payload.id or gen_id("r")
    if session.get(FuelRecord, rid):
        raise HTTPException(409, f"record {rid} already exists")
    rec = FuelRecord(id=rid, vehicle_id=vid)
    _apply(payload, rec)
    session.add(rec)
    session.flush()
    session.refresh(rec)
    return rec


def _get_record_for_user(rid: str, user_id: str, session: Session) -> FuelRecord:
    rec = session.get(FuelRecord, rid)
    if not rec:
        raise HTTPException(404, "record not found")
    get_user_vehicle(rec.vehicle_id, user_id, session)
    return rec


@router.put("/api/v1/records/{rid}", response_model=FuelRecordRead)
def update_record(
    rid: str,
    payload: FuelRecordCreate,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> FuelRecord:
    rec = _get_record_for_user(rid, current.id, session)
    _apply(payload, rec)
    session.add(rec)
    session.flush()
    session.refresh(rec)
    return rec


@router.delete("/api/v1/records/{rid}", status_code=204)
def delete_record(
    rid: str,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> None:
    rec = _get_record_for_user(rid, current.id, session)
    session.delete(rec)
