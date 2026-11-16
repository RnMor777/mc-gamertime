---
title: Troubleshooting
description: Common issues and fixes for the self-hosted Docker Compose stack.
sidebar:
  order: 6
---

## App won't start / restarts in a loop

Run `docker compose logs mc-gamertime`. If the last line is

```
/entrypoint.sh: 11: cannot create /data/.jwt_secret: Permission denied
```

the bind-mounted `config/app/` is not writable by the user the container runs as. Check
its owner with `ls -ld config/app` and set `PUID`/`PGID` in `.env` to match (`id -u` /
`id -g`), then `docker compose up -d`.

## Every request returns 503, but the container is "healthy"

```bash
curl -i http://localhost:4263/
# HTTP/1.1 503 Service Unavailable
# {"detail":"Service unavailable"}
```

The database has no users and no `ADMIN_USERNAME`/`ADMIN_PASSWORD` was set, so startup
aborts and every request — the login page included — is refused. Docker still reports the
container `healthy`, because the healthcheck only opens a TCP connection to port 4263; it
never asks for a page.

Confirm it in the logs, then create the first admin:

```bash
docker compose logs mc-gamertime | grep "No users found"
docker compose exec mc-gamertime python3 scripts/create-user.py \
  --username admin --display-name "Admin" --role admin --password <your-password>
```

The next request succeeds; no restart needed. Setting only one of `ADMIN_USERNAME` /
`ADMIN_PASSWORD` produces the same 503 by a different route — it is a hard startup error.

## `port is already allocated` on `docker compose up`

```
Error response from daemon: ... Bind for 127.0.0.1:4263 failed: port is already allocated
```

Something else on the host owns port 4263. Find it with `ss -ltnp | grep 4263` (or
`lsof -i :4263` on macOS), then either stop it or set `APP_PORT=<other-port>` in `.env`.
The container's own port never changes.

## Works on the host, unreachable from another device

By default the port is bound to `127.0.0.1`, so `http://<host-ip>:4263` from a phone or
another machine is refused. Set `APP_BIND=0.0.0.0` in `.env` and `docker compose up -d`.
Read [Configuration → Host port and bind address](/self-hosting/configuration/#host-port-and-bind-address)
first: Docker port bindings bypass `ufw`/`firewalld`.

## `docker-compose: command not found` or `unsupported Compose file version`

The docs use the Compose v2 plugin (`docker compose`, with a space). The old standalone
`docker-compose` v1 binary is not supported. Check with `docker compose version`; install
the plugin from Docker's repositories if it is missing.

## Game search returns nothing

Board Game Geek search needs an API token. Set `BGG_TOKEN` in `.env` and `docker compose up -d`,
or paste it under **Settings → Integrations** in the app (admin only, no restart). See
[Configuration → BGG Token](/self-hosting/configuration/#bgg-token).

## Images / avatars 404 via /storage/...

Only the `avatars/`, `blog-images/`, and `game-images/` prefixes are served by the proxy. Check that `config/app/storage/` exists and is writable inside the container:

```bash
docker compose exec mc-gamertime ls -la /data/storage
```

## Logs

```bash
docker compose logs -f            # all services, follow
docker compose logs mc-gamertime           # app only
docker compose ps                 # health status of all services
```
