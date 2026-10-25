import re
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.api import auth, complexes, events, facilities, letters, management_reports, marketplace, news, notifications, profile, purchase_requests, registrations, reports, uploads, votings
from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.models import entities  # noqa: F401
from app.services.schema import ensure_runtime_schema
from app.services.seed import seed_initial_data

settings = get_settings()
app = FastAPI(title=f"{settings.app_name} API", version="1.3.33")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_routers = [
    auth.router,
    complexes.router,
    profile.router,
    news.router,
    marketplace.router,
    management_reports.router,
    purchase_requests.router,
    facilities.router,
    votings.router,
    letters.router,
    reports.router,
    events.router,
    notifications.router,
    registrations.router,
    uploads.router,
]
for router in api_routers:
    app.include_router(router, prefix="/api")
    if settings.app_public_path:
        app.include_router(router, prefix=f"{settings.app_public_path}/api")


@app.on_event("startup")
def startup() -> None:
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for _ in range(30):
        try:
            if settings.auto_create_tables:
                Base.metadata.create_all(bind=engine)
            ensure_runtime_schema(engine)
            if settings.seed_on_startup:
                with SessionLocal() as db:
                    seed_initial_data(db)
            return
        except OperationalError as exc:
            last_error = exc
            time.sleep(2)
    if last_error:
        raise last_error


def health_response() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


@app.get("/api/health")
def health() -> dict[str, str]:
    return health_response()


if settings.app_public_path:
    @app.get(f"{settings.app_public_path}/api/health")
    def public_health() -> dict[str, str]:
        return health_response()


app.mount(settings.upload_url_prefix, StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")
if settings.app_public_path:
    app.mount(settings.public_upload_url_prefix, StaticFiles(directory=settings.upload_dir, check_dir=False), name="public_uploads")

dist = Path(settings.frontend_dist_dir)
if dist.exists():
    legacy_bundle_pattern = re.compile(r"(?:^|/)assets/index-[^/]+\.(js|css)$")

    @app.middleware("http")
    async def recover_stale_frontend_bundle(request: Request, call_next):
        response = await call_next(request)
        if response.status_code != 404 or not legacy_bundle_pattern.search(request.url.path):
            return response

        suffix = Path(request.url.path).suffix
        current_bundles = sorted(
            (dist / "assets").glob(f"index-*{suffix}"),
            key=lambda candidate: candidate.stat().st_mtime,
            reverse=True,
        )
        if not current_bundles:
            return response

        media_type = "application/javascript" if suffix == ".js" else "text/css"
        return FileResponse(
            current_bundles[0],
            media_type=media_type,
            headers={"Cache-Control": "no-store, max-age=0", "X-Rukun-Asset-Recovery": "current"},
        )

    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    if settings.app_public_path:
        app.mount(f"{settings.app_public_path}/assets", StaticFiles(directory=dist / "assets"), name="public_assets")


def frontend_response(full_path: str) -> FileResponse:
    index = dist / "index.html"
    if index.exists():
        target = dist / full_path
        if full_path and target.exists() and target.is_file():
            headers = {"Cache-Control": "no-store, max-age=0"} if full_path == "rukun.webmanifest" or full_path.startswith("icons/rukun-app-") else None
            return FileResponse(target, headers=headers)
        return FileResponse(index, headers={"Cache-Control": "no-store, max-age=0"})
    return FileResponse(Path(__file__).parent / "static" / "fallback.html")


if settings.app_public_path:
    @app.get(f"{settings.app_public_path}/{{full_path:path}}")
    def serve_public_frontend(full_path: str) -> FileResponse:
        return frontend_response(full_path)


@app.get("/{full_path:path}")
def serve_frontend(full_path: str) -> FileResponse:
    return frontend_response(full_path)
