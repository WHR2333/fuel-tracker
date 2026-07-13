"""Authentication: JWT login with brute-force protection.

Credentials are checked against the users table (bcrypt).
On first startup the admin user is seeded from env vars.
"""
from __future__ import annotations

import datetime as _dt
import time
from dataclasses import dataclass, field
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.models.user import User

# ---------------------------------------------------------------------------
# Current-user DTO returned by verify_token
# ---------------------------------------------------------------------------


class CurrentUser:
    __slots__ = ("id", "username", "is_admin")

    def __init__(self, id: str, username: str, is_admin: bool) -> None:
        self.id = id
        self.username = username
        self.is_admin = is_admin


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

_ALGORITHM = "HS256"


def _create_token(user: User) -> str:
    expire = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=settings.token_expire_hours)
    payload = {"sub": user.username, "uid": user.id, "admin": user.is_admin, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def _decode_token(token: str) -> dict:
    """Return the JWT payload; raise 401 on any failure."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


_bearer_scheme = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """FastAPI dependency — returns the authenticated user."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = _decode_token(credentials.credentials)
    return CurrentUser(
        id=payload.get("uid", ""),
        username=payload.get("sub", ""),
        is_admin=bool(payload.get("admin", False)),
    )


async def require_admin(user: CurrentUser = Depends(verify_token)) -> CurrentUser:
    """FastAPI dependency — rejects non-admin users."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Brute-force protection  (in-memory, per-IP)
# ---------------------------------------------------------------------------

@dataclass
class _AttemptTracker:
    max_failures: int = 5
    lockout_seconds: int = 900  # 15 minutes
    _store: dict[str, tuple[int, float]] = field(default_factory=dict)

    def check(self, ip: str) -> None:
        entry = self._store.get(ip)
        if entry is None:
            return
        count, locked_until = entry
        now = time.time()
        if count >= self.max_failures and now < locked_until:
            remaining = int(locked_until - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in {remaining}s.",
            )
        if now >= locked_until and count >= self.max_failures:
            self._store.pop(ip, None)

    def record_failure(self, ip: str) -> None:
        entry = self._store.get(ip, (0, 0.0))
        count = entry[0] + 1
        locked_until = time.time() + self.lockout_seconds if count >= self.max_failures else entry[1]
        self._store[ip] = (count, locked_until)

    def record_success(self, ip: str) -> None:
        self._store.pop(ip, None)


_limiter = _AttemptTracker()


# ---------------------------------------------------------------------------
# Login / password endpoints
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, session: Session = Depends(get_session)) -> LoginResponse:
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    _limiter.check(ip)

    user = session.execute(select(User).where(User.username == body.username)).scalars().first()
    if not user or not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        _limiter.record_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _limiter.record_success(ip)
    token = _create_token(user)
    return LoginResponse(access_token=token)


@router.get("/me")
async def me(current: CurrentUser = Depends(verify_token)) -> dict:
    return {"username": current.username, "is_admin": current.is_admin}


@router.put("/password")
async def change_own_password(
    body: ChangePasswordRequest,
    current: CurrentUser = Depends(verify_token),
    session: Session = Depends(get_session),
) -> dict:
    user = session.get(User, current.id)
    if not user or not bcrypt.checkpw(body.old_password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    user.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    session.add(user)
    return {"detail": "Password changed"}
