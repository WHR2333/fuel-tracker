"""Analytics: monthly fuel consumption stats."""
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.fuel_record import FuelRecord
from app.models.vehicle import Vehicle
from app.schemas import AnalyticsResponse, MonthlyStat
from app.security import verify_token

router = APIRouter(
    prefix="/api/v1/vehicles",
    tags=["analytics"],
    dependencies=[Depends(verify_token)],
)


@router.get("/{vid}/analytics", response_model=AnalyticsResponse)
def get_analytics(vid: str, session: Session = Depends(get_session)) -> AnalyticsResponse:
    if not session.get(Vehicle, vid):
        raise HTTPException(404, "vehicle not found")

    stmt = (
        select(FuelRecord)
        .where(FuelRecord.vehicle_id == vid)
        .order_by(FuelRecord.record_date)
    )
    records = list(session.execute(stmt).scalars().all())
    if not records:
        return AnalyticsResponse(
            vehicle_id=vid,
            overall_l_per_100km=0.0,
            overall_cost=Decimal("0"),
            total_distance=Decimal("0"),
            monthly=[],
        )

    # bucket by YYYY-MM, keep first/last odometer and totals
    buckets: dict[str, dict] = {}
    for r in records:
        key = r.record_date.strftime("%Y-%m")
        b = buckets.setdefault(
            key,
            {
                "count": 0,
                "total_cost": Decimal("0"),
                "total_fuel": Decimal("0"),
                "first_odo": None,
                "last_odo": None,
            },
        )
        b["count"] += 1
        b["total_cost"] += r.total_cost
        b["total_fuel"] += r.liters
        b["first_odo"] = r.odometer if b["first_odo"] is None else min(b["first_odo"], r.odometer)
        b["last_odo"] = r.odometer if b["last_odo"] is None else max(b["last_odo"], r.odometer)

    monthly: list[MonthlyStat] = []
    for key in sorted(buckets):
        b = buckets[key]
        distance = max(Decimal("0"), (b["last_odo"] or Decimal("0")) - (b["first_odo"] or Decimal("0")))
        l_per_100 = (
            float(b["total_fuel"] / distance * 100) if distance > 0 else 0.0
        )
        monthly.append(
            MonthlyStat(
                month=key,
                count=b["count"],
                total_cost=b["total_cost"],
                total_fuel=b["total_fuel"],
                distance=distance,
                l_per_100km=round(l_per_100, 2),
            )
        )

    total_cost = sum((b["total_cost"] for b in buckets.values()), Decimal("0"))
    total_fuel = sum((b["total_fuel"] for b in buckets.values()), Decimal("0"))
    total_distance = sum(
        (max(Decimal("0"), (b["last_odo"] or Decimal("0")) - (b["first_odo"] or Decimal("0")))
         for b in buckets.values()),
        Decimal("0"),
    )
    overall = float(total_fuel / total_distance * 100) if total_distance > 0 else 0.0

    return AnalyticsResponse(
        vehicle_id=vid,
        overall_l_per_100km=round(overall, 2),
        overall_cost=total_cost,
        total_distance=total_distance,
        monthly=monthly,
    )