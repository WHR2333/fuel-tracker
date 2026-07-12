"""SQLModel engine and session helpers."""
from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

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
    """Create all tables. Called on startup."""
    # Import models so SQLModel.metadata is populated before create_all.
    from app.models import fuel_record, maintenance, vehicle  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: yield a session, commit on success, rollback on error."""
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise