"""FastAPI app factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import admin, analytics, maintenance, records, vehicles
from app.security import router as auth_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Validate critical security settings before accepting traffic.
    if not settings.admin_password:
        raise RuntimeError("ADMIN_PASSWORD is not set. Refusing to start.")
    if not settings.secret_key:
        raise RuntimeError("SECRET_KEY is not set. Refusing to start.")
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Fuel Tracker API",
        version="0.5.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(vehicles.router)
    app.include_router(records.router)
    app.include_router(maintenance.router)
    app.include_router(analytics.router)
    app.include_router(admin.router)

    @app.get("/api/v1/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "env": settings.app_env}

    return app


app = create_app()