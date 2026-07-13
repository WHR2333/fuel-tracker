"""ID generator + small helpers shared by routers."""
import random
import string
import time

from fastapi import HTTPException
from sqlmodel import Session

from app.models.vehicle import Vehicle


def gen_id(prefix: str = "r") -> str:
    """Generate a short sortable ID like r19f5180003f_yuql0u."""
    ts = int(time.time() * 1000)
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}{ts:x}_{rand}"


def calc_total_cost(liters: float, price: float) -> float:
    """Round to 3 decimals to match DECIMAL(10,3)."""
    return round(liters * price, 3)


def get_user_vehicle(vid: str, user_id: str, session: Session) -> Vehicle:
    """Return a vehicle only if it belongs to the given user; else 404."""
    v = session.get(Vehicle, vid)
    if not v or v.user_id != user_id:
        raise HTTPException(404, "vehicle not found")
    return v