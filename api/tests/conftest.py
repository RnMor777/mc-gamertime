import os

import pytest
from fastapi.testclient import TestClient

# lib/db/base.py builds its tables at import time; the SQLite default would open
# a file under /data before any fixture runs. Pin the DynamoDB branch, which only
# builds boto3 resource handles and does no I/O — the fixtures below then swap in
# real SqliteTable instances pointed at a per-test tmp file.
os.environ.setdefault("DB_BACKEND", "dynamodb")

from lib.db.sqlite_backend import _TABLE_NAMES, SqliteTable

TEST_ORIGIN_TOKEN = "test-origin-token"
TEST_JWT_SECRET = "test-jwt-secret-that-is-long-enough"


class SeedableTable(SqliteTable):
    """The real SQLite backend, plus the one affordance tests need.

    Route tests used to run against a third in-memory implementation, which
    meant neither backend that ships was ever exercised end to end. They run
    against this now: production code paths, production serialisation, a real
    file on disk. `seed` is just `put_item` under a name that reads as setup.
    """

    def seed(self, item: dict) -> None:
        # Sets are how DynamoDB models a string set, and some fixtures seed one
        # directly. add_to_set stores them as sorted lists here, so seeding has
        # to land on the same representation or setup and behaviour disagree.
        self.put_item(Item={k: sorted(v) if isinstance(v, set) else v for k, v in item.items()})


def route_paths(app) -> list[str]:
    """Every registered path, including those inside routers added with
    ``include_router``. FastAPI >= 0.14x stores those lazily as an
    ``_IncludedRouter`` entry in ``app.routes`` that has no ``path`` of its own."""
    paths: list[str] = []
    for route in app.routes:
        if hasattr(route, "path"):
            paths.append(route.path)
        else:
            paths.extend(ctx.path for ctx in route.effective_route_contexts())
    return paths


@pytest.fixture(autouse=True)
def init_app(monkeypatch):
    import main

    monkeypatch.setattr(main, "_origin_token", TEST_ORIGIN_TOKEN)
    monkeypatch.setattr(main, "_initialized", True)
    try:
        import lib.auth as auth_lib

        auth_lib.set_jwt_secret(TEST_JWT_SECRET)
    except ImportError:
        pass


@pytest.fixture(autouse=True)
def fake_db(monkeypatch, tmp_path):
    # Distinct filename: tests get the same tmp_path and some build their
    # own SQLite file in it (tests/test_migrations.py).
    db_path = str(tmp_path / "conftest-tables.db")
    monkeypatch.setenv("RULEBOOKS_STORAGE_DIR", str(tmp_path / "rulebooks"))
    new_tables: dict = {name: SeedableTable(db_path, name) for name in _TABLE_NAMES}
    import lib.db.base as db_base

    monkeypatch.setattr(db_base, "tables", new_tables)

    class TestDB:
        def __getitem__(self, table_name: str) -> SeedableTable:
            return new_tables[table_name]

    yield TestDB()
    for table in new_tables.values():
        table.close()


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from lib.rate_limit import limiter

    limiter._limiter.storage.reset()
    return


@pytest.fixture
def authed_client():
    def _make(role: str = "admin") -> TestClient:
        from main import app

        c = TestClient(app, raise_server_exceptions=False)
        c.cookies.set("token", make_auth_cookie(role)["token"])
        return c

    return _make


def make_auth_cookie(role: str = "admin", sub: str = "testuser", token_version: int = 0) -> dict:
    """Sign a token AND seed/overwrite a matching `users` record at pk=sub,
    so require_auth's tokenVersion lookup succeeds for the synthetic cookie."""
    import lib.db.base as db_base
    from lib.auth import AuthUser, sign_token

    db_base.tables["users"].seed(
        {
            "pk": sub,
            "displayName": "Test User",
            "role": role,
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
            "tokenVersion": token_version,
        }
    )
    token = sign_token(
        AuthUser(sub=sub, role=role, displayName="Test User", tokenVersion=token_version)
    )
    return {"token": token}


ORIGIN = {"x-origin-token": TEST_ORIGIN_TOKEN}
