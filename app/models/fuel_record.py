"""Fuel record table.

* `total_cost` is the canonical "liters × price" — server fills it on insert.
* `pump_amount` is what the gas-station display showed (usually identical to
  total_cost but lets us record pump-vs-paid discrepancies).
* `paid_amount` is what actually came out of the user's wallet (after any
  discount or rounding). When null, the UI assumes paid_amount = pump_amount.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, func
from sqlmodel import Field, SQLModel


class FuelRecord(SQLModel, table=True):
    __tablename__ = "fuel_records"

    id: str = Field(primary_key=True, max_length=32)
    # CASCADE so deleting a vehicle removes its records — the v4 export/import
    # flow expects this and the API couldn't otherwise implement "clear all data".
    vehicle_id: str = Field(
        sa_column=Column(
            String(32),
            ForeignKey("vehicles.id", ondelete="CASCADE"),
            index=True,
        ),
    )
    record_date: date = Field(index=True)
    odometer: Decimal = Field(max_digits=10, decimal_places=2)
    liters: Decimal = Field(max_digits=8, decimal_places=3)
    price: Decimal = Field(max_digits=6, decimal_places=3)
    total_cost: Decimal = Field(max_digits=10, decimal_places=3)
    pump_amount: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=3)
    paid_amount: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=3)
    full_tank: str = Field(default="yes", max_length=3)  # yes | no
    station: str = Field(default="", max_length=128)
    fuel_type: str = Field(default="92", max_length=8)
    note: str = Field(default="", max_length=2000)
    # True when the user filled up while the fuel-gauge low-fuel light was on —
    # surfaced in the UI as the 💡 icon on the record card.
    light: bool = Field(default=False)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )