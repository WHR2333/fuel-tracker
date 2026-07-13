"""User management router — admin only for CRUD, any user for self password change."""
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlmodel import Session

from app.db import get_session
from app.models.user import User
from app.security import CurrentUser, require_admin, verify_token
from app.services.helpers import gen_id

router = APIRouter(prefix="/api/v1/users", tags=["users"])


# --- schemas ---

class UserCreate(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    id: str
    username: str
    is_admin: bool


class UserUpdate(BaseModel):
    username: str | None = None


class AdminSetPassword(BaseModel):
    new_password: str


# --- admin endpoints ---

@router.get("", response_model=list[UserRead])
def list_users(
    _admin: CurrentUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[User]:
    return list(session.execute(select(User).order_by(User.is_admin.desc(), User.created_at)).scalars().all())


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    body: UserCreate,
    _admin: CurrentUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> User:
    if session.execute(select(User).where(User.username == body.username)).scalars().first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        id=gen_id("u"),
        username=body.username,
        password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        is_admin=False,
    )
    session.add(user)
    session.flush()
    session.refresh(user)
    return user


@router.put("/{uid}", response_model=UserRead)
def update_user(
    uid: str,
    body: UserUpdate,
    _admin: CurrentUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> User:
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.username is not None:
        existing = session.execute(select(User).where(User.username == body.username, User.id != uid)).scalars().first()
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = body.username
    session.add(user)
    session.flush()
    session.refresh(user)
    return user


@router.delete("/{uid}", status_code=204)
def delete_user(
    uid: str,
    admin: CurrentUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> None:
    if uid == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    session.delete(user)


@router.put("/{uid}/password")
def admin_set_password(
    uid: str,
    body: AdminSetPassword,
    _admin: CurrentUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    session.add(user)
    return {"detail": "Password changed"}
