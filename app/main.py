"""FastAPI app factory."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import admin, analytics, maintenance, records, vehicles

STATIC_DIR = Path(__file__).resolve().parent.parent / "static_dist"


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

    # Serve built frontend assets (Vite output) when the static_dist directory
    # exists — i.e. inside the Docker image. Falls back gracefully if absent.
    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


app = create_app()