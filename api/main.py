import hmac
import logging
import os
from datetime import UTC, datetime

import bcrypt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from lib import auth as auth_lib
from lib import oidc as oidc_lib
from lib import bgg as bgg_lib
from lib import storage as storage_lib
from lib.db import users as users_lib
from lib.rate_limit import limiter
from routes import (
    auth,
    games,
    notifications,
    oidc,
    players,
    posts,
    reactions,
    recommended,
    results,
    settings,
    stats,
    storage,
    users,
)

# Two deliberate dev flags: ENV=dev exposes /api/docs; DEV_MODE=true (below)
# bypasses the CloudFront origin guard. Keep separate — docs in a deployed dev
# stack must not imply the origin guard is off.
is_dev = os.environ.get("ENV") == "dev"
app = FastAPI(
    redirect_slashes=False,
    docs_url="/api/docs" if is_dev else None,
    redoc_url="/api/redoc" if is_dev else None,
)

# Credentialed CORS peers. No domain is hardcoded here: the cloud path gets this
# from infra/lambda.tf (derived from the deployed FQDN), selfhost from .env.
# Empty means same-origin only, which is the normal deployment shape.
DEV_ORIGINS = ["http://localhost:4263", "http://localhost:5173"]

# Root logger at INFO so operator-facing messages (admin bootstrap, mailer)
# reach `docker compose logs`. No-op where a handler already exists (Lambda).
# httpx logs every outbound request at INFO — keep BGG calls out of the log.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

_log = logging.getLogger("cors")
_boot_log = logging.getLogger("bootstrap")


def parse_allowed_origins(raw: str, *, dev: bool) -> list[str]:
    """Turn the CORS_ALLOWED_ORIGINS env value into a CORS allow-list.

    `raw` is a comma-separated list of origins (scheme included), e.g.
    "https://games.example.com,https://app.example.com". These are credentialed
    peers — session cookies ride along — so the result must never contain "*".

    `dev` is True only in the dev stack (ENV=dev); localhost origins must never
    reach a prod bundle, or a local app on a victim's machine could make
    credentialed cross-origin calls to prod. DEV_ORIGINS holds those two.

    Parsing fails closed: anything not a plain http(s) origin is dropped with a
    warning rather than widening the allow-list, and an empty result means
    same-origin only (never "*").
    """
    origins: list[str] = []
    for candidate in raw.split(","):
        # A browser's Origin header carries no path or trailing slash, so a
        # configured "https://x.example/" would never match anything.
        origin = candidate.strip().rstrip("/")
        if not origin:
            continue
        if not origin.startswith(("http://", "https://")):
            # Covers "*" and "null" too: both are unusable with credentials.
            _log.warning("ignoring invalid CORS origin %r (must be an http(s) origin)", origin)
            continue
        if origin not in origins:
            origins.append(origin)

    if dev:
        origins.extend(o for o in DEV_ORIGINS if o not in origins)
    return origins


ALLOWED_ORIGINS = parse_allowed_origins(os.environ.get("CORS_ALLOWED_ORIGINS", ""), dev=is_dev)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # ty: ignore[invalid-argument-type]
app.add_middleware(SlowAPIMiddleware)

_initialized = False
_origin_token: str | None = None

# Selfhost is the default deployment: secrets come from the environment unless
# the cloud path explicitly asks for SSM (set in infra/lambda.tf).
SECRETS_PROVIDER = os.environ.get("SECRETS_PROVIDER", "env")

_ssm_client = None


def _ssm():
    """Lazily build the SSM client so the selfhost path never constructs one."""
    global _ssm_client
    if _ssm_client is None:
        import boto3  # lazy: the selfhost image ships without the AWS SDK

        _ssm_client = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "eu-west-1"))
    return _ssm_client


def _ssm_param(name: str) -> str:
    """Read one SecureString parameter (cloud path only)."""
    return _ssm().get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]


def _bootstrap_admin_user() -> None:
    admin_username = os.environ.get("ADMIN_USERNAME", "")
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if bool(admin_username) != bool(admin_password):
        raise RuntimeError("ADMIN_USERNAME and ADMIN_PASSWORD must both be set, or neither")
    if not admin_username:
        if not users_lib.list_users():
            raise RuntimeError(
                "No users found. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env to bootstrap the first admin."
            )
        return
    if users_lib.get_user(admin_username):
        return
    users_lib.put_user(
        {
            "pk": admin_username,
            "createdAt": datetime.now(UTC).isoformat(),
            "username": admin_username,
            "displayName": admin_username,
            "role": "admin",
            "passwordHash": bcrypt.hashpw(
                admin_password.encode(), bcrypt.gensalt(rounds=12)
            ).decode(),
        }
    )
    _boot_log.info("Bootstrapped admin user '%s'", admin_username)


def _initialize() -> None:
    global _initialized, _origin_token
    if _initialized:
        return
    if SECRETS_PROVIDER == "env":
        jwt_secret = os.environ.get("JWT_SECRET", "")
        if not jwt_secret or jwt_secret == "CHANGE_ME":  # noqa: S105
            raise RuntimeError("JWT_SECRET not configured")
        origin_token = os.environ.get("ORIGIN_TOKEN", "")
        guard_enabled = (
            os.environ.get("DEV_MODE") != "true"
            and os.environ.get("ORIGIN_GUARD_ENABLED", "false") == "true"
        )
        if guard_enabled and not origin_token:
            raise RuntimeError(
                "ORIGIN_TOKEN not configured (required when ORIGIN_GUARD_ENABLED=true)"
            )
        bgg_token = os.environ.get("BGG_TOKEN", "")
        oidc_client = None
        _bootstrap_admin_user()
    else:
        try:
            jwt_secret = _ssm_param("/boardsite/jwt-secret")
            origin_token = _ssm_param("/boardsite/origin-token")
            bgg_token = _ssm_param("/boardsite/bgg-token")
            oidc_client = _ssm()
        except Exception as exc:
            raise RuntimeError(f"SSM initialization failed: {exc}") from exc
    
    oidc_lib.initialize_oidc(SECRETS_PROVIDER, oidc_client)
    auth_lib.set_jwt_secret(jwt_secret)
    bgg_lib.set_bgg_token_fallback(bgg_token)
    _origin_token = origin_token
    _initialized = True


_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' https: data:; "
        "object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
    ),
}


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    try:
        _initialize()
    except RuntimeError:
        return JSONResponse(status_code=503, content={"detail": "Service unavailable"})

    if (
        os.environ.get("DEV_MODE") == "true"
        or os.environ.get("ORIGIN_GUARD_ENABLED", "false") != "true"
    ):
        return await call_next(request)

    received = request.headers.get("x-origin-token") or ""
    if not hmac.compare_digest(received, _origin_token or ""):
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    # CSRF defense-in-depth behind the SameSite=Strict cookie: on state-changing
    # methods, reject a request whose Origin is present but not allowlisted. Runs
    # only on the cloud path (known origins); a missing Origin is allowed
    # (same-origin/native clients often omit it).
    if request.method in _UNSAFE_METHODS:
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


# Registered last → outermost middleware, so these headers land on EVERY response,
# including the 403/503 early returns from origin_guard and rate-limit 429s.
# CloudFront's free plan can't attach a response-headers policy (see CLAUDE.md),
# so the app sets them instead.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)

    # API responses carry per-user data (profiles, results, notifications) and
    # are cheap to refetch, so nothing between the browser and the app should
    # retain a copy: no-store keeps them out of any shared cache a request
    # might pass through, and out of the browser's own history cache, which is
    # what the back button reads after a logout.
    #
    # Scoped to /api: uploaded media is deliberately reusable by the browser
    # that fetched it (routes/storage.py sets private, max-age), and the static
    # bundle is public and fingerprinted.
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


METRICS_ENABLED = os.environ.get("METRICS_ENABLED", "false") == "true"

if METRICS_ENABLED:
    import time

    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    from lib.metrics import record_request

    @app.middleware("http")
    async def metrics_middleware(request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration = time.monotonic() - start
        route = request.scope.get("route")
        path = route.path if route is not None else request.url.path
        record_request(request.method, path, response.status_code, duration)
        return response

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/health")
def health():
    # No auth: lets the frontend distinguish "backend down" from "bad credentials".
    # Origin guard still applies (CloudFront-only), and _initialize() runs in the
    # middleware — a cold-start crash returns 503 here, which is exactly the signal.
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/auth")
app.include_router(oidc.router, prefix="/api/auth")
app.include_router(games.router, prefix="/api/games")
app.include_router(players.router, prefix="/api/players")
app.include_router(posts.router, prefix="/api/posts")
app.include_router(results.router, prefix="/api/results")
app.include_router(recommended.router, prefix="/api/recommended")
app.include_router(stats.router, prefix="/api/stats")
app.include_router(users.router, prefix="/api/users")
app.include_router(reactions.router, prefix="/api/reactions")
app.include_router(reactions.comments_router, prefix="/api/comments")
app.include_router(notifications.router, prefix="/api/notifications")
app.include_router(settings.router, prefix="/api/settings")

S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL")
if S3_ENDPOINT_URL or storage_lib.is_local_storage():
    app.include_router(storage.router, prefix="/storage")

# Uploaded media is served by the app on every deployment, so that reading an
# avatar or a blog image always requires a session. Registered under the exact
# prefixes the app links to, and before the SPA fallback so those paths resolve
# here rather than returning index.html.
for _media_prefix in ("/avatars", "/blog-images", "/game-images"):
    app.include_router(storage.media_router, prefix=_media_prefix)

STATIC_DIR = os.environ.get("STATIC_DIR")
if STATIC_DIR:
    static_dir: str = STATIC_DIR
    app.mount("/assets", StaticFiles(directory=f"{static_dir}/assets"))

    @app.get("/{path:path}")
    def spa_fallback(path: str):
        # Serve real files at the dist root (favicon, manifest, service
        # worker, PWA icons) as-is; only fall back to index.html for
        # client-side routes that don't correspond to a file on disk.
        #
        # SECURITY: reject ".." segments and any path that os.path.join would
        # treat as absolute (leading "/") — without this, os.path.join(STATIC_DIR, path)
        # can escape STATIC_DIR entirely (os.path.join discards its first argument
        # when the second is absolute), enabling arbitrary file read (e.g. /etc/passwd).
        # Treat any such path as "no matching file" -> fall back to index.html,
        # same as any other unknown client-side route.
        if ".." in path.split("/") or path.startswith("/"):
            return FileResponse(f"{STATIC_DIR}/index.html")

        file_path = os.path.join(static_dir, path)
        if path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(f"{STATIC_DIR}/index.html")


# Lambda entry point (infra/lambda.tf → `main.handler`). Mangum is imported on
# first invocation only: it is a Lambda-only dependency and absent from the
# selfhost image (api/requirements-selfhost.txt).
_mangum = None


def handler(event, context):
    global _mangum
    if _mangum is None:
        from mangum import Mangum

        _mangum = Mangum(app, lifespan="off")
    return _mangum(event, context)
