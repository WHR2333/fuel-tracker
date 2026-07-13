"""FastAPI app factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import admin, analytics, maintenance, records, vehicles


@asynccontextmanager
async def lifespan(_app: FastAPI):
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

    app.include_router(vehicles.router)
    app.include_router(records.router)
    app.include_router(maintenance.router)
    app.include_router(analytics.router)
    app.include_router(admin.router)

    @app.get("/api/v1/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "env": settings.app_env}

    @app.get("/api/v1/config", tags=["meta"])
    def config() -> dict:
        """Frontend calls this on startup to get runtime config (API key, etc.)
        so the build doesn't need to bake in environment-specific values."""
        return {"apiKey": settings.api_key}

    return app


app = create_app()