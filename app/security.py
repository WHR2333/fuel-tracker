"""Authentication: JWT login with brute-force protection.

Replaces the old static API-key approach.  Credentials are checked against
ADMIN_USER / ADMIN_PASSWORD from environment variables.
"""
from __future__ import annotations

import datetime as _dt
import time
from dataclasses import dataclass, field

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

_ALGORITHM = "HS256"


def _create_token(username: str) -> str:
    expire = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=settings.token_expire_hours)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def _decode_token(token: str) -> str:
    """Return the username from a valid JWT; raise 401 on any failure."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


_bearer_scheme = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency — returns the authenticated username."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return _decode_token(credentials.credentials)


# ---------------------------------------------------------------------------
# Brute-force protection  (in-memory, per-IP)
# ---------------------------------------------------------------------------

@dataclass
class _AttemptTracker:
    """Track failed login attempts per IP with auto-expiring lockouts."""

    max_failures: int = 5
    lockout_seconds: int = 900  # 15 minutes

    # ip → (fail_count, locked_until_timestamp)
    _store: dict[str, tuple[int, float]] = field(default_factory=dict)

    def check(self, ip: str) -> None:
        """Raise 429 if the IP is currently locked out."""
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
        # Lockout expired — reset
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
# Login endpoint
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request) -> LoginResponse:
    # Prefer the real client IP from X-Forwarded-For (set by reverse proxies).
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    _limiter.check(ip)

    if body.username != settings.admin_user or body.password != settings.admin_password:
        _limiter.record_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _limiter.record_success(ip)
    token = _create_token(body.username)
    return LoginResponse(access_token=token)


@router.get("/me")
async def me(username: str = Depends(verify_token)) -> dict:
    """Validate a token and return the username."""
    return {"username": username}
