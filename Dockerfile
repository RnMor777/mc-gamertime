# --- stage 1: build frontend ---
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- stage 2: runtime ---
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

# requirements-selfhost.txt is requirements.txt (the Lambda set used by
# build.sh) minus boto3/mangum, plus uvicorn — the AWS SDK alone is ~100 MB
# the container never imports. test_requirements_sync.py keeps the two in sync.
COPY api/requirements-selfhost.txt .
RUN pip install --no-cache-dir -r requirements-selfhost.txt

COPY api/ .
COPY --from=web-build /web/dist /app/static

# Self-hosting is the default deployment, so the image is self-hosted out of the
# box: `docker run` with no environment at all serves a working instance backed
# by SQLite and local-filesystem storage. docker-compose.yml still sets these
# explicitly so the compose file documents its own behaviour, and the AWS path
# overrides them in infra/lambda.tf.
ENV STATIC_DIR=/app/static \
    DB_BACKEND=sqlite \
    STORAGE_BACKEND=local \
    SECRETS_PROVIDER=env \
    ORIGIN_GUARD_ENABLED=false \
    PUBLIC_RECOMMENDED_ENABLED=false

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN useradd -m -u 1000 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data

VOLUME /data
USER appuser

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python3 -c "import socket; socket.create_connection(('localhost', 4263), timeout=1)" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
