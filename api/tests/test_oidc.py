from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from lib.auth import AuthUser, _get_secret
from lib.db.users import get_user
from lib.oidc import (
    _check_is_admin,
    _sanitize_username,
    clear_oidc_cache,
    create_authorization_url,
    get_discovery_document,
    get_oidc_button_label,
    get_oidc_config,
    get_oidc_endpoints,
    is_local_auth_disabled,
    is_oidc_enabled,
    process_oidc_callback,
    resolve_or_provision_user,
    safe_redirect_path,
)
from main import app
from tests.conftest import ORIGIN


@pytest.fixture(autouse=True)
def _reset_oidc():
    clear_oidc_cache()
    yield
    clear_oidc_cache()


def test_is_oidc_enabled(monkeypatch):
    monkeypatch.delenv("OIDC_ENABLED", raising=False)
    monkeypatch.delenv("OIDC_ISSUER_URL", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    assert is_oidc_enabled() is False

    monkeypatch.setenv("OIDC_ENABLED", "true")
    assert is_oidc_enabled() is True

    monkeypatch.setenv("OIDC_ENABLED", "false")
    monkeypatch.setenv("OIDC_ISSUER_URL", "https://auth.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "client-id")
    assert is_oidc_enabled() is True


def test_is_local_auth_disabled(monkeypatch):
    monkeypatch.delenv("DISABLE_LOCAL_AUTH", raising=False)
    monkeypatch.delenv("LOCAL_AUTH_DISABLED", raising=False)
    monkeypatch.delenv("LOCAL_AUTH_ENABLED", raising=False)
    assert is_local_auth_disabled() is False

    monkeypatch.setenv("DISABLE_LOCAL_AUTH", "true")
    assert is_local_auth_disabled() is True

    monkeypatch.delenv("DISABLE_LOCAL_AUTH", raising=False)
    monkeypatch.setenv("LOCAL_AUTH_DISABLED", "1")
    assert is_local_auth_disabled() is True

    monkeypatch.delenv("LOCAL_AUTH_DISABLED", raising=False)
    monkeypatch.setenv("LOCAL_AUTH_ENABLED", "false")
    assert is_local_auth_disabled() is True


def test_get_oidc_button_label(monkeypatch):
    monkeypatch.delenv("OIDC_BUTTON_LABEL", raising=False)
    assert get_oidc_button_label() == "Sign in with SSO"

    monkeypatch.setenv("OIDC_BUTTON_LABEL", "Sign in with Authentik")
    assert get_oidc_button_label() == "Sign in with Authentik"


def test_safe_redirect_path():
    assert safe_redirect_path(None) == "/"
    assert safe_redirect_path("") == "/"
    assert safe_redirect_path("/catalog") == "/catalog"
    assert safe_redirect_path("/log?tab=1") == "/log?tab=1"
    assert safe_redirect_path("https://evil.com") == "/"
    assert safe_redirect_path("//evil.com") == "/"
    assert safe_redirect_path("javascript:alert(1)") == "/"


def test_sanitize_username():
    assert _sanitize_username("alice") == "alice"
    assert _sanitize_username("al") == "user_al"
    assert _sanitize_username("") == "user"
    assert _sanitize_username("jane.doe@example.com") == "jane_doe_example_com"
    long_name = "x" * 50
    sanitized = _sanitize_username(long_name)
    assert len(sanitized) == 32
    assert sanitized == "x" * 32


def test_check_is_admin():
    config = {
        "default_role": "readonly",
        "admin_emails": ["admin@example.com"],
        "admin_group": "boardgame-admins",
    }
    # First user on empty instance -> admin
    assert _check_is_admin({}, config, []) is True

    # Existing users present
    existing = [{"pk": "admin"}]
    assert _check_is_admin({}, config, existing) is False
    assert _check_is_admin({"email": "admin@example.com"}, config, existing) is True
    assert _check_is_admin({"email": "other@example.com"}, config, existing) is False
    assert _check_is_admin({"groups": ["other", "boardgame-admins"]}, config, existing) is True
    assert _check_is_admin({"roles": ["boardgame-admins"]}, config, existing) is True
    assert _check_is_admin({"groups": ["other"]}, config, existing) is False


def test_get_discovery_document_and_endpoints(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "authorization_endpoint": "https://auth.example.com/oauth/authorize",
        "token_endpoint": "https://auth.example.com/oauth/token",
        "userinfo_endpoint": "https://auth.example.com/oauth/userinfo",
        "jwks_uri": "https://auth.example.com/oauth/jwks",
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.get", return_value=mock_resp) as mock_get:
        doc = get_discovery_document("https://auth.example.com")
        assert doc["authorization_endpoint"] == "https://auth.example.com/oauth/authorize"
        mock_get.assert_called_once()

        # Second call hits cache
        doc2 = get_discovery_document("https://auth.example.com")
        assert doc2 == doc
        assert mock_get.call_count == 1

    config = get_oidc_config()
    config["issuer_url"] = "https://auth.example.com"
    endpoints = get_oidc_endpoints(config)
    assert endpoints["authorization_endpoint"] == "https://auth.example.com/oauth/authorize"
    assert endpoints["token_endpoint"] == "https://auth.example.com/oauth/token"
    assert endpoints["userinfo_endpoint"] == "https://auth.example.com/oauth/userinfo"


def test_create_authorization_url(monkeypatch):
    monkeypatch.setenv("OIDC_ENABLED", "true")
    monkeypatch.setenv("OIDC_CLIENT_ID", "test-client")
    monkeypatch.setenv("OIDC_AUTH_URL", "https://auth.example.com/authorize")
    monkeypatch.setenv("OIDC_TOKEN_URL", "https://auth.example.com/token")

    req = MagicMock()
    req.base_url = "http://localhost:8000"
    req.query_params = {"redirect": "/catalog"}

    auth_url, state_cookie = create_authorization_url(req)
    assert "https://auth.example.com/authorize?" in auth_url
    assert "client_id=test-client" in auth_url
    assert "code_challenge=" in auth_url
    assert "response_type=code" in auth_url

    # Verify state cookie
    payload = jwt.decode(state_cookie, _get_secret(), algorithms=["HS256"])
    assert "state" in payload
    assert "cv" in payload
    assert payload["rd"] == "/catalog"


def test_resolve_or_provision_user(fake_db):
    config = {
        "default_role": "readonly",
        "admin_emails": ["lead@example.com"],
        "admin_group": None,
    }

    # 1. First user gets admin
    user1 = resolve_or_provision_user(
        {"sub": "sub-1", "preferred_username": "alice", "name": "Alice M."}, config
    )
    assert isinstance(user1, AuthUser)
    assert user1.sub == "alice"
    assert user1.role == "admin"
    assert user1.displayName == "Alice M."

    # Verify user in database
    db_u = get_user("alice")
    assert db_u is not None
    assert db_u["oidcSub"] == "sub-1"

    # 2. Subsequent user gets readonly unless matching admin
    user2 = resolve_or_provision_user(
        {"sub": "sub-2", "email": "bob@example.com", "name": "Bob B."}, config
    )
    assert user2.sub == "bob"
    assert user2.role == "readonly"

    # 3. Subsequent user matching admin email gets admin
    user3 = resolve_or_provision_user(
        {"sub": "sub-3", "email": "lead@example.com", "name": "Leader"}, config
    )
    assert user3.role == "admin"

    # 4. Username collision suffixes username
    user4 = resolve_or_provision_user(
        {"sub": "sub-4", "preferred_username": "alice", "name": "Alice Two"}, config
    )
    assert user4.sub == "alice_2"

    # 5. Existing user matched by oidcSub
    user1_again = resolve_or_provision_user(
        {"sub": "sub-1", "preferred_username": "different", "name": "Alice M."}, config
    )
    assert user1_again.sub == "alice"


def test_process_oidc_callback(monkeypatch, fake_db):
    monkeypatch.setenv("OIDC_ENABLED", "true")
    monkeypatch.setenv("OIDC_CLIENT_ID", "test-client")
    monkeypatch.setenv("OIDC_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("OIDC_AUTH_URL", "https://auth.example.com/authorize")
    monkeypatch.setenv("OIDC_TOKEN_URL", "https://auth.example.com/token")
    monkeypatch.setenv("OIDC_USERINFO_URL", "https://auth.example.com/userinfo")

    state = "state-12345"
    nonce = "nonce-12345"
    code_verifier = "cv-12345"

    state_cookie = jwt.encode(
        {"state": state, "nonce": nonce, "cv": code_verifier, "rd": "/leaderboard"},
        _get_secret(),
        algorithm="HS256",
    )

    req = MagicMock()
    req.base_url = "http://localhost:8000"
    req.cookies = {"oidc_state": state_cookie}

    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {
        "access_token": "acc-token-123",
        "id_token": jwt.encode(
            {"sub": "user-sub-1", "nonce": nonce, "aud": "test-client"},
            "k" * 32,
            algorithm="HS256",
        ),
    }

    mock_userinfo_resp = MagicMock()
    mock_userinfo_resp.status_code = 200
    mock_userinfo_resp.json.return_value = {
        "sub": "user-sub-1",
        "name": "Jane User",
        "email": "jane@example.com",
    }

    def mock_post(url, **kwargs):
        if url == "https://auth.example.com/token":
            return mock_token_resp
        return MagicMock(status_code=404)

    def mock_get(url, **kwargs):
        if url == "https://auth.example.com/userinfo":
            return mock_userinfo_resp
        return MagicMock(status_code=404)

    with patch("httpx.post", side_effect=mock_post), patch("httpx.get", side_effect=mock_get):
        user, target_rd = process_oidc_callback(req, "auth-code-123", state)
        assert user.sub == "jane"
        assert user.displayName == "Jane User"
        assert target_rd == "/leaderboard"


def test_auth_config_endpoint(monkeypatch):
    client = TestClient(app, raise_server_exceptions=False)

    monkeypatch.delenv("OIDC_ENABLED", raising=False)
    monkeypatch.delenv("DISABLE_LOCAL_AUTH", raising=False)
    resp = client.get("/api/auth/config", headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json() == {
        "oidcEnabled": False,
        "disableLocalAuth": False,
        "oidcButtonLabel": "Sign in with SSO",
    }

    monkeypatch.setenv("OIDC_ENABLED", "true")
    monkeypatch.setenv("DISABLE_LOCAL_AUTH", "true")
    monkeypatch.setenv("OIDC_BUTTON_LABEL", "Login with Keycloak")
    resp = client.get("/api/auth/config", headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json() == {
        "oidcEnabled": True,
        "disableLocalAuth": True,
        "oidcButtonLabel": "Login with Keycloak",
    }


def test_local_auth_disabled_blocks_password_login(monkeypatch, fake_db):
    monkeypatch.setenv("DISABLE_LOCAL_AUTH", "true")
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "supersecretpassword"},
        headers=ORIGIN,
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Local authentication is disabled"

    resp = client.post(
        "/api/auth/forgot-password",
        json={"username": "alice"},
        headers=ORIGIN,
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Local authentication is disabled"

    resp = client.post(
        "/api/auth/reset-password",
        json={"token": "some-token", "newPassword": "supersecretpassword"},
        headers=ORIGIN,
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Local authentication is disabled"


def test_oidc_login_route(monkeypatch):
    client = TestClient(app, raise_server_exceptions=False)

    # When disabled -> 404
    monkeypatch.delenv("OIDC_ENABLED", raising=False)
    resp = client.get("/api/auth/oidc/login", headers=ORIGIN)
    assert resp.status_code == 404

    # When enabled -> 303 Redirect to auth endpoint
    monkeypatch.setenv("OIDC_ENABLED", "true")
    monkeypatch.setenv("OIDC_CLIENT_ID", "test-client")
    monkeypatch.setenv("OIDC_AUTH_URL", "https://auth.example.com/oauth/authorize")
    monkeypatch.setenv("OIDC_TOKEN_URL", "https://auth.example.com/oauth/token")

    resp = client.get(
        "/api/auth/oidc/login?redirect=/catalog", headers=ORIGIN, follow_redirects=False
    )
    assert resp.status_code == 303
    assert "https://auth.example.com/oauth/authorize" in resp.headers["location"]
    assert "client_id=test-client" in resp.headers["location"]
    assert "oidc_state" in resp.cookies


def test_oidc_callback_route(monkeypatch, fake_db):
    client = TestClient(app, raise_server_exceptions=False)

    # When disabled -> 404
    monkeypatch.delenv("OIDC_ENABLED", raising=False)
    resp = client.get("/api/auth/oidc/callback", headers=ORIGIN)
    assert resp.status_code == 404

    monkeypatch.setenv("OIDC_ENABLED", "true")
    monkeypatch.setenv("OIDC_CLIENT_ID", "test-client")
    monkeypatch.setenv("OIDC_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("OIDC_AUTH_URL", "https://auth.example.com/oauth/authorize")
    monkeypatch.setenv("OIDC_TOKEN_URL", "https://auth.example.com/oauth/token")
    monkeypatch.setenv("OIDC_USERINFO_URL", "https://auth.example.com/oauth/userinfo")

    # Error param redirects to /login?error=...
    resp = client.get(
        "/api/auth/oidc/callback?error=access_denied",
        headers=ORIGIN,
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "/login?error=access_denied" in resp.headers["location"]

    # Missing state/code redirects to /login?error=invalid_request
    resp = client.get("/api/auth/oidc/callback", headers=ORIGIN, follow_redirects=False)
    assert resp.status_code == 303
    assert "/login?error=invalid_request" in resp.headers["location"]

    # Successful callback
    state = "test-state-123"
    nonce = "test-nonce-123"
    state_cookie = jwt.encode(
        {"state": state, "nonce": nonce, "cv": "test-cv", "rd": "/catalog"},
        _get_secret(),
        algorithm="HS256",
    )
    client.cookies.set("oidc_state", state_cookie)

    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {
        "access_token": "mock-access-token",
        "id_token": jwt.encode(
            {"sub": "oidc-user-1", "nonce": nonce, "aud": "test-client"},
            "k" * 32,
            algorithm="HS256",
        ),
    }

    mock_userinfo_resp = MagicMock()
    mock_userinfo_resp.status_code = 200
    mock_userinfo_resp.json.return_value = {
        "sub": "oidc-user-1",
        "preferred_username": "sam",
        "name": "Sam S.",
        "email": "sam@example.com",
    }

    with (
        patch("httpx.post", return_value=mock_token_resp),
        patch("httpx.get", return_value=mock_userinfo_resp),
    ):
        resp = client.get(
            f"/api/auth/oidc/callback?code=valid-code&state={state}",
            headers=ORIGIN,
            follow_redirects=False,
        )
        assert resp.status_code == 303
        assert resp.headers["location"] == "/catalog"
        assert "token" in resp.cookies
