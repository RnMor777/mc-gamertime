# --- stage 1: build frontend ---
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- stage 2: export the selfhost dependency set from uv.lock ---
# uv.lock is the single source of truth (see api/pyproject.toml): core deps +
# the `selfhost` group, without boto3/mangum (~100 MB the container never
# imports). Exported with hashes so stage 3 installs exactly the locked files.
# uv needs an interpreter to validate the lock, so run it on the same Python
# base as the runtime stage rather than in the (Python-less) uv image.
FROM python:3.12-slim@sha256:dddfd7e07f9d15aeeca61529320492139d21cac7f0070c00609243e51e4e0016 AS deps
COPY --from=ghcr.io/astral-sh/uv:0.13.4@sha256:9f130421e930bfbdc563c00740466603f8723158e90297d07957c2294640262b /uv /usr/local/bin/uv
WORKDIR /api
COPY api/pyproject.toml api/uv.lock ./
RUN ["uv", "export", "--locked", "--no-default-groups", "--group", "selfhost", "--format", "requirements-txt", "--quiet", "--output-file", "/requirements.txt"]

# --- stage 3: runtime ---
FROM python:3.12-slim@sha256:dddfd7e07f9d15aeeca61529320492139d21cac7f0070c00609243e51e4e0016 AS app
WORKDIR /app

# sqlite3 CLI is required by the disaster-recovery runbook
# (docs-site/src/content/docs/self-hosting/backups-upgrades.md) for
# PRAGMA integrity_check / .recover — the Python sqlite3 stdlib module
# only exposes the C API, not the CLI's dot-commands.
# Version intentionally unpinned: Debian package versions age out of the
# mirror, and sqlite3 CLI compatibility here is not version-sensitive.
#
# `apt-get upgrade` pulls Debian security updates for packages inherited from
# the base image. Without it the image ships whatever was current when
# python:3.12-slim was last rebuilt upstream, which lags Debian's security
# archive — and the trivy gate in CI (.github/workflows/ci.yml and
# publish.yml) fails the build on any HIGH/CRITICAL that already has a fix.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /requirements.txt .
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.txt \
    && rm requirements.txt

COPY api/ .
COPY --from=web-build /web/dist /app/static

# Self-hosting is the default deployment, so the image is self-hosted out of the
# box: `docker run` with no environment at all serves a working instance backed
# by SQLite and local-filesystem storage. docker-compose.yml still sets these
# explicitly so the compose file documents its own behaviour, and the AWS path
# overrides them in infra/lambda.tf.
# DL3064 flags SECRETS_PROVIDER by name; its value only selects where secrets
# are read from ("env"), it is not a secret itself.
# hadolint ignore=DL3064
ENV STATIC_DIR=/app/static \
    DB_BACKEND=sqlite \
    STORAGE_BACKEND=local \
    SECRETS_PROVIDER=env \
    ORIGIN_GUARD_ENABLED=false \
    PUBLIC_RECOMMENDED_ENABLED=false

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN useradd -m -u 1000 appuser \
    && mkdir -p /data /data/rulebooks \
    && chown -R appuser:appuser /app /data

VOLUME ["/data", "/data/rulebooks"]
USER appuser

# Probe /api/health, not just the socket: a failed _initialize() (fresh DB with
# no ADMIN_* set, missing JWT_SECRET) keeps the port open but 503s every
# request. Any 5xx or a refused connection is unhealthy; a 4xx (e.g. 403 from
# an opted-in origin guard) still proves the app is up.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python3", "-c", "import sys, urllib.error, urllib.request\ntry:\n    urllib.request.urlopen('http://127.0.0.1:4263/api/health', timeout=2)\nexcept urllib.error.HTTPError as e:\n    sys.exit(e.code >= 500)"]

ENTRYPOINT ["/entrypoint.sh"]
