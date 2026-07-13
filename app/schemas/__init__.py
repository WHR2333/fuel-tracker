"""Pydantic request/response schemas — separate from ORM models for API stability."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# === Vehicle ===

class VehicleBase(BaseModel):
    name: str = Field(max_length=64)
    plate: str = Field(max_length=16)
    tank: Decimal = Field(default=Decimal("50"), ge=0)
    model: str = Field(default="", max_length=128)


class VehicleCreate(VehicleBase):
    id: str | None = Field(default=None, max_length=32)


class VehicleRead(VehicleBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


# === FuelRecord ===

FullTankType = Literal["yes", "no"]


class FuelRecordBase(BaseModel):
    record_date: date
    odometer: Decimal = Field(ge=0)
    liters: Decimal = Field(gt=0)
    price: Decimal = Field(gt=0)
    # Server-computed from liters * price; client may omit on create.
    total_cost: Decimal | None = None
    # The "pump-displayed" amount (油机显示金额) — usually identical to total_cost
    # but lets the user record pump-vs-paid discrepancies.
    pump_amount: Decimal | None = None
    # What the user actually paid after any discount (实付金额).
    paid_amount: Decimal | None = None
    full_tank: FullTankType = "yes"
    station: str = Field(default="", max_length=128)
    fuel_type: str = Field(default="92", max_length=8)
    note: str = Field(default="", max_length=2000)
    light: bool = False
    skipped_previous: bool = False


class FuelRecordCreate(FuelRecordBase):
    id: str | None = Field(default=None, max_length=32)


class FuelRecordRead(FuelRecordBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vehicle_id: str
    # Server-derived — always present on read.
    total_cost: Decimal
    pump_amount: Decimal | None = None
    paid_amount: Decimal | None = None
    created_at: datetime


# === Maintenance ===

# Reminder trigger mode. "either" = whichever of next_date / next_odo comes first.
TriggerType = Literal["date", "odo", "either", "none"]


class MaintenanceBase(BaseModel):
    record_date: date
    odometer: Decimal = Field(default=Decimal("0"), ge=0)
    maint_type: str = Field(default="", max_length=64)
    # User-supplied name; empty means use the preset's default name.
    custom_name: str = Field(default="", max_length=64)
    item: str = Field(default="", max_length=128)
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    note: str = Field(default="", max_length=2000)
    trigger: TriggerType = "either"
    next_date: date | None = None
    next_odo: Decimal | None = None


class MaintenanceCreate(MaintenanceBase):
    id: str | None = Field(default=None, max_length=32)


class MaintenanceRead(MaintenanceBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vehicle_id: str
    custom_name: str = ""
    trigger: TriggerType = "either"
    created_at: datetime


# === Analytics ===

class MonthlyStat(BaseModel):
    month: str  # YYYY-MM
    count: int
    total_cost: Decimal
    total_fuel: Decimal
    distance: Decimal
    l_per_100km: float


class AnalyticsResponse(BaseModel):
    vehicle_id: str
    overall_l_per_100km: float
    overall_cost: Decimal
    total_distance: Decimal
    monthly: list[MonthlyStat]