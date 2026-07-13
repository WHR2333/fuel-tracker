"""User table."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(primary_key=True, max_length=32)
    username: str = Field(max_length=64, unique=True, index=True)
    password_hash: str = Field(max_length=128)
    is_admin: bool = Field(default=False)
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )
