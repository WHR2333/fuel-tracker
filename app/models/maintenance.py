"""Maintenance record table.

Reminder semantics:
* `trigger` is "date" / "odo" / "either" / "none". Reminder fires when:
  - "date"   → next_date is reached
  - "odo"    → next_odo is reached
  - "either" → whichever of next_date / next_odo comes first
  - "none"   → user explicitly disabled reminders for this record
* `custom_name` lets users name their own preset (e.g. "刹车油") instead of
  picking from the 12 hardcoded ones. Empty string falls back to the preset
  label.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlmodel import Field, SQLModel


class MaintenanceRecord(SQLModel, table=True):
    __tablename__ = "maint_records"

    id: str = Field(primary_key=True, max_length=32)
    # CASCADE so deleting a vehicle removes its maintenance records.
    vehicle_id: str = Field(
        sa_column=Column(
            String(32),
            ForeignKey("vehicles.id", ondelete="CASCADE"),
            index=True,
        ),
    )
    record_date: date = Field(index=True)
    odometer: Decimal = Field(default=Decimal("0"), max_digits=10, decimal_places=2)
    maint_type: str = Field(default="", max_length=64)
    custom_name: str = Field(default="", max_length=64)
    item: str = Field(default="", max_length=128)
    cost: Decimal = Field(default=Decimal("0"), max_digits=10, decimal_places=3)
    note: str = Field(default="", max_length=2000)
    trigger: str = Field(default="either", max_length=8)  # date | odo | either | none
    next_date: Optional[date] = Field(default=None)
    next_odo: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )