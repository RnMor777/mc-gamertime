"""Users-table writers must not overwrite fields they did not set.

Each helper used to read the whole record and write it back. A write that
landed between that read and that write (an admin's role change, a logout's
tokenVersion bump) was silently undone. These tests reproduce that
interleaving: the stored record already carries the concurrent change, while
any read the helper makes still sees the stale snapshot from before it.
"""

from __future__ import annotations

import pytest

from lib.db import users
from lib.db.sqlite_backend import SqliteTable
from tests.conftest import ORIGIN, make_auth_cookie


@pytest.fixture
def concurrent_role_change(fake_db, monkeypatch):
    table = fake_db["users"]
    stale = {"pk": "alice", "role": "admin", "tokenVersion": 0, "createdAt": "x"}
    table.seed({**stale, "role": "readonly", "tokenVersion": 1})
    monkeypatch.setattr(table, "get_item", lambda *, Key: {"Item": dict(stale)})
    return table


def _stored(table) -> dict:
    return SqliteTable.get_item(table, Key={"pk": "alice"})["Item"]


def test_set_last_read_at_keeps_a_concurrent_role_change(concurrent_role_change):
    users.set_last_read_at("alice", "2026-01-01T00:00:00Z")
    item = _stored(concurrent_role_change)
    assert item["lastReadAt"] == "2026-01-01T00:00:00Z"
    assert item["role"] == "readonly"
    assert item["tokenVersion"] == 1


def test_update_avatar_keeps_a_concurrent_role_change(concurrent_role_change):
    users.update_avatar("alice", True)
    item = _stored(concurrent_role_change)
    assert item["hasAvatar"] is True
    assert item["role"] == "readonly"
    assert item["tokenVersion"] == 1


def test_helpers_ignore_a_missing_user(fake_db):
    users.set_last_read_at("ghost", "2026-01-01T00:00:00Z")
    users.update_avatar("ghost", True)
    assert "Item" not in fake_db["users"].get_item(Key={"pk": "ghost"})


# --- routes --------------------------------------------------------------


@pytest.fixture
def stale_reads_for(fake_db, monkeypatch):
    """Store `fresh` for a user while every read of that user returns `stale`."""

    def _install(stale: dict, fresh: dict):
        table = fake_db["users"]
        table.seed(fresh)
        real_get = table.get_item

        def get_item(*, Key):
            if Key["pk"] == stale["pk"]:
                return {"Item": dict(stale)}
            return real_get(Key=Key)

        monkeypatch.setattr(table, "get_item", get_item)
        return table

    return _install


def test_logout_keeps_a_concurrent_field_change(stale_reads_for):
    from fastapi.testclient import TestClient

    from main import app

    cookie = make_auth_cookie("readonly", sub="alice", token_version=0)
    stale = {"pk": "alice", "role": "readonly", "displayName": "A", "tokenVersion": 0}
    table = stale_reads_for(stale, {**stale, "lastReadAt": "2026-05-01T00:00:00Z"})

    c = TestClient(app)
    c.cookies.set("token", cookie["token"])
    assert c.post("/api/auth/logout", headers=ORIGIN).status_code == 204

    item = SqliteTable.get_item(table, Key={"pk": "alice"})["Item"]
    assert item["tokenVersion"] == 1
    assert item["lastReadAt"] == "2026-05-01T00:00:00Z"


def test_update_user_keeps_a_concurrent_field_change(authed_client, stale_reads_for):
    c = authed_client("admin")
    stale = {"pk": "alice", "role": "readonly", "displayName": "A", "tokenVersion": 0}
    table = stale_reads_for(stale, {**stale, "lastReadAt": "2026-05-01T00:00:00Z"})

    resp = c.put("/api/users/alice", json={"role": "admin"}, headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

    item = SqliteTable.get_item(table, Key={"pk": "alice"})["Item"]
    assert item["role"] == "admin"
    assert item["tokenVersion"] == 1
    assert item["lastReadAt"] == "2026-05-01T00:00:00Z"


def test_successful_login_reset_keeps_a_concurrent_field_change(stale_reads_for):
    import bcrypt
    from fastapi.testclient import TestClient

    from main import app

    pw_hash = bcrypt.hashpw(b"correct-horse-battery", bcrypt.gensalt(rounds=4)).decode()
    stale = {
        "pk": "alice",
        "role": "readonly",
        "displayName": "A",
        "passwordHash": pw_hash,
        "failedAttempts": 1,
        "lastFailureAt": "2000-01-01T00:00:00+00:00",
    }
    table = stale_reads_for(stale, {**stale, "tokenVersion": 3})

    resp = TestClient(app).post(
        "/api/auth/login",
        json={"username": "alice", "password": "correct-horse-battery"},
        headers=ORIGIN,
    )
    assert resp.status_code == 200

    item = SqliteTable.get_item(table, Key={"pk": "alice"})["Item"]
    assert item["failedAttempts"] == 0
    assert item["tokenVersion"] == 3


# --- stale role claim ----------------------------------------------------


def test_demoted_admin_token_cannot_act_on_other_users(fake_db, monkeypatch):
    """The JWT still says admin; the users record says readonly. Non-admin
    routes that branch on role must follow the record, not the claim."""
    from fastapi.testclient import TestClient

    import routes.users as users_route
    from main import app

    monkeypatch.setattr(
        users_route, "_s3", type("S3", (), {"delete_object": lambda *a, **k: None})()
    )
    fake_db["users"].seed({"pk": "alice", "role": "readonly", "displayName": "A"})
    cookie = make_auth_cookie("admin", sub="testuser")
    fake_db["users"].seed(
        {"pk": "testuser", "role": "readonly", "displayName": "T", "tokenVersion": 0}
    )

    c = TestClient(app)
    c.cookies.set("token", cookie["token"])
    assert c.delete("/api/users/alice/avatar", headers=ORIGIN).status_code == 403


def test_update_user_script_revokes_sessions_on_role_change(fake_db, monkeypatch, capsys):
    import runpy
    import sys
    from pathlib import Path

    fake_db["users"].seed({"pk": "alice", "role": "admin", "displayName": "A", "tokenVersion": 0})
    script = Path(__file__).resolve().parent.parent / "scripts" / "update-user.py"
    monkeypatch.setattr(sys, "argv", [str(script), "--username", "alice", "--role", "normal"])
    runpy.run_path(str(script), run_name="__main__")

    item = fake_db["users"].get_item(Key={"pk": "alice"})["Item"]
    assert item["role"] == "normal"
    assert item["tokenVersion"] == 1
    assert "sessions revoked" in capsys.readouterr().out
