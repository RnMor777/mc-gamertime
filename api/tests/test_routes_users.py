from io import BytesIO

from PIL import Image

from tests.conftest import ORIGIN


def test_create_user_missing_role_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={"username": "bob", "displayName": "Bob", "password": "secret"},
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_user_invalid_role_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={
            "username": "bob",
            "displayName": "Bob",
            "password": "secret",
            "role": "superadmin",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_user_success(authed_client, fake_db):
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={
            "username": "bob",
            "displayName": "Bob",
            "password": "secretpass123",
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "bob"
    assert data["displayName"] == "Bob"
    assert data["role"] == "normal"
    assert "personalLibraryId" in data
    assert "passwordHash" not in data
    assert fake_db["users"].get_item(Key={"pk": "bob"}).get("Item") is not None


def test_create_user_duplicate_returns_409(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "bob",
            "displayName": "Bob",
            "role": "normal",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
        }
    )
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={
            "username": "bob",
            "displayName": "Bob Again",
            "password": "secretpass123",
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 409


def test_create_user_short_password_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={"username": "bob", "displayName": "Bob", "password": "short1", "role": "normal"},
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_user_eleven_char_password_returns_422(authed_client):
    c = authed_client("admin")
    response = c.post(
        "/api/users",
        json={
            "username": "newuser",
            "displayName": "New User",
            "password": "a" * 11,
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert response.status_code == 422


def test_create_user_invalid_username_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/users",
        json={
            "username": "bob the builder!",
            "displayName": "Bob",
            "password": "secret123",
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_user_password_too_long_returns_422(authed_client):
    c = authed_client("admin")
    response = c.post(
        "/api/users",
        json={
            "username": "newuser",
            "displayName": "New User",
            "password": "a" * 1025,
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert response.status_code == 422


def test_update_user_short_password_returns_422(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
        }
    )
    c = authed_client("admin")
    resp = c.put("/api/users/alice", json={"password": "short1"}, headers=ORIGIN)
    assert resp.status_code == 422


def test_update_user_eleven_char_password_returns_422(fake_db, authed_client):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    response = c.put(
        "/api/users/alice",
        json={"password": "a" * 11},
        headers=ORIGIN,
    )
    assert response.status_code == 422


def test_update_user_password_too_long_returns_422(fake_db, authed_client):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    response = c.put(
        "/api/users/alice",
        json={"password": "a" * 1025},
        headers=ORIGIN,
    )
    assert response.status_code == 422


def test_list_users_returns_seeded_users(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "admin",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "hashed",
        }
    )
    c = authed_client("admin")
    resp = c.get("/api/users", headers=ORIGIN)
    assert resp.status_code == 200
    users = resp.json()
    alice = next(u for u in users if u["username"] == "alice")
    assert alice["displayName"] == "Alice"
    assert "passwordHash" not in alice


def test_list_users_readonly_forbidden(authed_client):
    c = authed_client("readonly")
    resp = c.get("/api/users", headers=ORIGIN)
    assert resp.status_code == 403


def _make_png() -> bytes:
    """Create a minimal valid 10x10 red PNG for test uploads."""
    buf = BytesIO()
    Image.new("RGB", (10, 10), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


def _seed_user(fake_db, username: str = "testuser"):
    fake_db["users"].seed(
        {
            "pk": username,
            "displayName": "Test User",
            "role": "readonly",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
        }
    )


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put_object(self, **kwargs):
        self.objects[kwargs["Key"]] = kwargs.get("Body", b"")

    def delete_object(self, **kwargs):
        self.objects.pop(kwargs.get("Key"), None)


def test_upload_avatar_own_profile_succeeds(authed_client, fake_db, monkeypatch):
    _seed_user(fake_db, "testuser")
    fake_s3 = FakeS3()
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", fake_s3)
    monkeypatch.setattr(users_route, "_OBJECT_BASE_URL", "https://cdn.example.com")
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("readonly")  # sub="testuser"
    resp = c.post(
        "/api/users/testuser/avatar",
        content=_make_png(),
        headers={**ORIGIN, "Content-Type": "image/png"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Media is served by the app now, so the URL is same-origin, and it carries
    # a ?v= stamp from avatarUpdatedAt so a replaced avatar is refetched rather
    # than served from the browser's cache for the Cache-Control max-age.
    assert data["avatarUrl"].startswith("/storage/avatars/testuser.png?v=")
    assert "avatars/testuser.png" in fake_s3.objects
    assert fake_db["users"].get_item(Key={"pk": "testuser"})["Item"]["hasAvatar"] is True


def test_upload_avatar_admin_can_upload_for_other_user(authed_client, fake_db, monkeypatch):
    _seed_user(fake_db, "alice")
    fake_s3 = FakeS3()
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", fake_s3)
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("admin")  # sub="testuser", role="admin"
    resp = c.post(
        "/api/users/alice/avatar",
        content=_make_png(),
        headers={**ORIGIN, "Content-Type": "image/png"},
    )
    assert resp.status_code == 200
    assert "avatars/alice.png" in fake_s3.objects


def test_upload_avatar_forbidden_for_other_user(authed_client, fake_db, monkeypatch):
    _seed_user(fake_db, "alice")
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", FakeS3())
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("readonly")  # sub="testuser", not "alice"
    resp = c.post(
        "/api/users/alice/avatar",
        content=_make_png(),
        headers={**ORIGIN, "Content-Type": "image/png"},
    )
    assert resp.status_code == 403


def test_upload_avatar_user_not_found_returns_404(authed_client, fake_db, monkeypatch):
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", FakeS3())
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("admin")
    resp = c.post(
        "/api/users/nobody/avatar",
        content=_make_png(),
        headers={**ORIGIN, "Content-Type": "image/png"},
    )
    assert resp.status_code == 404


def test_upload_avatar_invalid_image_returns_422(authed_client, fake_db, monkeypatch):
    _seed_user(fake_db, "testuser")
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", FakeS3())
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("readonly")
    resp = c.post(
        "/api/users/testuser/avatar",
        content=b"not-an-image",
        headers={**ORIGIN, "Content-Type": "image/png"},
    )
    assert resp.status_code == 422


def test_delete_avatar_succeeds(authed_client, fake_db, monkeypatch):
    fake_db["users"].seed(
        {
            "pk": "testuser",
            "displayName": "Test User",
            "role": "readonly",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
            "hasAvatar": True,
        }
    )
    fake_s3 = FakeS3()
    fake_s3.objects["avatars/testuser.png"] = b"jpeg"
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", fake_s3)
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("readonly")
    resp = c.delete("/api/users/testuser/avatar", headers=ORIGIN)
    assert resp.status_code == 204
    assert "avatars/testuser.png" not in fake_s3.objects
    assert fake_db["users"].get_item(Key={"pk": "testuser"})["Item"]["hasAvatar"] is False


def test_delete_avatar_forbidden_for_other_user(authed_client, fake_db, monkeypatch):
    _seed_user(fake_db, "alice")
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", FakeS3())
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("readonly")
    resp = c.delete("/api/users/alice/avatar", headers=ORIGIN)
    assert resp.status_code == 403


def test_list_users_includes_avatar_url(authed_client, fake_db, monkeypatch):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "admin",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "hashed",
            "hasAvatar": True,
        }
    )

    c = authed_client("admin")
    resp = c.get("/api/users", headers=ORIGIN)
    assert resp.status_code == 200
    user = resp.json()[0]
    assert user["avatarUrl"] == "/storage/avatars/alice.png"


def test_list_users_no_avatar_returns_null(authed_client, fake_db, monkeypatch):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "admin",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "hashed",
        }
    )
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_OBJECT_BASE_URL", "https://cdn.example.com")

    c = authed_client("admin")
    resp = c.get("/api/users", headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json()[0]["avatarUrl"] is None


def test_update_user_display_name(authed_client, fake_db):
    import lib.db.base as db_base

    db_base.tables["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    res = c.put("/api/users/alice", json={"displayName": "Alice B"}, headers=ORIGIN)
    assert res.status_code == 200
    assert res.json()["displayName"] == "Alice B"
    assert res.json()["role"] == "readonly"


def test_update_user_role(authed_client, fake_db):
    import lib.db.base as db_base

    db_base.tables["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    res = c.put("/api/users/alice", json={"role": "admin"}, headers=ORIGIN)
    assert res.status_code == 200
    assert res.json()["role"] == "admin"
    assert res.json()["displayName"] == "Alice"


def test_update_user_readonly_forbidden(authed_client, fake_db):
    c = authed_client("readonly")
    res = c.put("/api/users/alice", json={"displayName": "X"}, headers=ORIGIN)
    assert res.status_code == 403


def test_update_user_not_found(authed_client, fake_db):
    c = authed_client("admin")
    res = c.put("/api/users/nobody", json={"displayName": "X"}, headers=ORIGIN)
    assert res.status_code == 404


def test_update_user_password(authed_client, fake_db):
    import bcrypt

    import lib.db.base as db_base

    db_base.tables["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": bcrypt.hashpw(b"old", bcrypt.gensalt()).decode(),
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    res = c.put("/api/users/alice", json={"password": "newpassword123"}, headers=ORIGIN)
    assert res.status_code == 200
    updated = db_base.tables["users"].get_item(Key={"pk": "alice"})["Item"]
    assert bcrypt.checkpw(b"newpassword123", updated["passwordHash"].encode())


def test_avatar_upload_exactly_5mb_passes_size_cap(authed_client):
    c = authed_client("admin")
    exact = b"x" * (5 * 1024 * 1024)
    resp = c.post("/api/users/testuser/avatar", content=exact, headers=ORIGIN)
    # Not a valid image (422), but the size cap must not fire at the boundary
    assert resp.status_code == 422


def test_avatar_upload_over_5mb_rejected(authed_client):
    c = authed_client("admin")
    big = b"x" * (5 * 1024 * 1024 + 1)
    resp = c.post("/api/users/testuser/avatar", content=big, headers=ORIGIN)
    assert resp.status_code == 413


def test_delete_user_not_found(authed_client):
    c = authed_client("admin")
    resp = c.delete("/api/users/nobody", headers=ORIGIN)
    assert resp.status_code == 404


def test_delete_user_self_returns_400(authed_client):
    c = authed_client("admin")  # sub="testuser"
    resp = c.delete("/api/users/testuser", headers=ORIGIN)
    assert resp.status_code == 400


def test_delete_user_demoted_admin_forbidden(authed_client, fake_db):
    # S-2: require_admin re-reads the role from the DB, so a client whose token
    # still says "admin" but whose DB role was changed to readonly is rejected
    # (403) — it can no longer reach admin-only routes. (This also makes the
    # "last admin" 409 branch unreachable via the route: any acting admin plus a
    # distinct admin target is always >= 2 admins.)
    c = authed_client("admin")  # seeds testuser as admin in fake_db, tokenVersion=0
    testuser = fake_db["users"].get_item(Key={"pk": "testuser"})["Item"]
    testuser["role"] = "readonly"
    fake_db["users"].put_item(Item=testuser)
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "admin",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    resp = c.delete("/api/users/alice", headers=ORIGIN)
    assert resp.status_code == 403


def test_delete_user_readonly_forbidden(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("readonly")
    resp = c.delete("/api/users/alice", headers=ORIGIN)
    assert resp.status_code == 403


def test_delete_user_referenced_in_results_returns_409(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    fake_db["results"].seed(
        {
            "pk": "r1",
            "createdAt": "2026-01-01T00:00:00Z",
            "gameId": "g1",
            "gameName": "Catan",
            "date": "2026-01-01",
            "winnerId": "alice",
            "winnerName": "Alice",
            "players": [
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "testuser", "playerName": "Test User"},
            ],
        }
    )
    c = authed_client("admin")
    resp = c.delete("/api/users/alice", headers=ORIGIN)
    assert resp.status_code == 409


def test_delete_user_success(authed_client, fake_db):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.delete("/api/users/alice", headers=ORIGIN)
    assert resp.status_code == 204
    assert fake_db["users"].get_item(Key={"pk": "alice"}).get("Item") is None


def test_delete_user_cleans_up_avatar(authed_client, fake_db, monkeypatch):
    fake_db["users"].seed(
        {
            "pk": "alice",
            "displayName": "Alice",
            "role": "readonly",
            "passwordHash": "x",
            "createdAt": "2026-01-01T00:00:00Z",
            "hasAvatar": True,
        }
    )
    fake_s3 = FakeS3()
    fake_s3.objects["avatars/alice.png"] = b"png"
    import routes.users as users_route

    monkeypatch.setattr(users_route, "_s3", fake_s3)
    monkeypatch.setattr(users_route, "_BUCKET", "test-bucket")

    c = authed_client("admin")
    resp = c.delete("/api/users/alice", headers=ORIGIN)
    assert resp.status_code == 204
    assert "avatars/alice.png" not in fake_s3.objects
