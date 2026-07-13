"""FastAPI app factory."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import admin, analytics, maintenance, records, vehicles
from app.security import router as auth_router

_STATIC_DIR = Path("/app/static_dist")


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

    # Serve the built React app. Static assets (/assets/*) are served by
    # StaticFiles; every other non-API GET returns index.html so that
    # React Router handles client-side routing.
    if _STATIC_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="static-assets")

        @app.get("/{full_path:path}")
        async def spa_fallback(request: Request, full_path: str):
            # If the path points to an actual file in static_dist (e.g. favicon.ico), serve it.
            file = _STATIC_DIR / full_path
            if file.is_file():
                return FileResponse(file)
            # Otherwise return index.html for React Router to handle.
            return FileResponse(_STATIC_DIR / "index.html")

    return app


app = create_app()