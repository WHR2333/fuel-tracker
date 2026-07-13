"""SQLModel engine and session helpers."""
import logging
from collections.abc import Iterator

import bcrypt
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=5,
    max_overflow=10,
)


@event.listens_for(Engine, "connect")
def _set_mariadb_utc(dbapi_connection, _connection_record):  # noqa: ANN001
    """Force UTC so DATETIME columns round-trip consistently."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET time_zone = '+00:00'")
    cursor.close()


def init_db() -> None:
    """Create all tables and seed the admin user. Called on startup."""
    from app.models import fuel_record, maintenance, vehicle, user  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # --- migrate: add user_id column to existing vehicles if missing ---
    with Session(engine) as sess:
        try:
            sess.execute(text("SELECT user_id FROM vehicles LIMIT 1"))  # noqa: S608
        except Exception:
            logger.info("Adding user_id column to vehicles table")
            sess.execute(text("ALTER TABLE vehicles ADD COLUMN user_id VARCHAR(32) NULL"))  # noqa: S608
            sess.execute(text(  # noqa: S608
                "CREATE INDEX IF NOT EXISTS ix_vehicles_user_id ON vehicles (user_id)"
            ))
            sess.commit()

    # --- seed admin user if users table is empty ---
    with Session(engine) as sess:
        existing = sess.exec(select(user.User)).first()
        if existing is None:
            pw_hash = bcrypt.hashpw(
                settings.admin_password.encode(), bcrypt.gensalt()
            ).decode()
            admin = user.User(
                id="u_admin",
                username=settings.admin_user,
                password_hash=pw_hash,
                is_admin=True,
            )
            sess.add(admin)
            sess.commit()
            logger.info("Created admin user: %s", settings.admin_user)

        # Migrate: assign orphan vehicles (no user_id) to admin.
        admin_user = sess.exec(
            select(user.User).where(user.User.is_admin == True)  # noqa: E712
        ).first()
        if admin_user:
            sess.execute(text(  # noqa: S608
                "UPDATE vehicles SET user_id = :uid WHERE user_id IS NULL"
            ).params(uid=admin_user.id))
            sess.commit()


def get_session() -> Iterator[Session]:
    """FastAPI dependency: yield a session, commit on success, rollback on error."""
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise