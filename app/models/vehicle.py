"""Vehicle table."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlmodel import Field, SQLModel


class Vehicle(SQLModel, table=True):
    __tablename__ = "vehicles"

    id: str = Field(primary_key=True, max_length=32)
    user_id: str = Field(
        sa_column=Column(
            String(32),
            ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
        ),
    )
    name: str = Field(max_length=64)
    plate: str = Field(max_length=16)
    tank: Decimal = Field(default=Decimal("50"), max_digits=6, decimal_places=2)
    model: str = Field(default="", max_length=128)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), onupdate=func.now()),
    )