from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request

from lib.auth import AuthUser, _get_secret
from lib.db.settings import get_settings
from lib.db.users import get_user, list_users, put_user, set_user_fields

_log = logging.getLogger("oidc")

_discovery_cache: dict[str, dict[str, Any]] = {}

_DEFAULT_SCOPES = "openid email profile"
_DEFAULT_BUTTON_LABEL = "Sign in with SSO"
_DEFAULT_ROLE = "readonly"


def is_oidc_enabled() -> bool:
    """Whether OIDC single sign-on is enabled."""
    enabled_val = os.environ.get("OIDC_ENABLED", "").strip().lower()
    if enabled_val in ("true", "1", "yes"):
        return True
    issuer = os.environ.get("OIDC_ISSUER_URL", "").strip()
    client_id = os.environ.get("OIDC_CLIENT_ID", "").strip()
    return bool(issuer and client_id)


def is_local_auth_disabled() -> bool:
    """Whether local username/password authentication is disabled."""
    return (
        os.environ.get("DISABLE_LOCAL_AUTH", "").strip().lower() in ("true", "1", "yes")
        or os.environ.get("LOCAL_AUTH_DISABLED", "").strip().lower() in ("true", "1", "yes")
        or os.environ.get("LOCAL_AUTH_ENABLED", "").strip().lower() in ("false", "0", "no")
    )


def get_oidc_button_label() -> str:
    """The label to display on the SSO login button."""
    return os.environ.get("OIDC_BUTTON_LABEL", "").strip() or _DEFAULT_BUTTON_LABEL


def get_oidc_config() -> dict[str, Any]:
    """Retrieve all OIDC settings from environment variables."""
    issuer_url = os.environ.get("OIDC_ISSUER_URL", "").strip().rstrip("/")
    client_id = os.environ.get("OIDC_CLIENT_ID", "").strip()
    client_secret = os.environ.get("OIDC_CLIENT_SECRET", "").strip()
    scopes = os.environ.get("OIDC_SCOPES", "").strip() or _DEFAULT_SCOPES
    redirect_uri = os.environ.get("OIDC_REDIRECT_URI", "").strip() or None
    button_label = get_oidc_button_label()
    default_role = os.environ.get("OIDC_DEFAULT_ROLE", "").strip().lower() or _DEFAULT_ROLE
    if default_role not in ("admin", "readonly"):
        default_role = _DEFAULT_ROLE

    admin_group = os.environ.get("OIDC_ADMIN_GROUP", "").strip() or None
    admin_emails_raw = os.environ.get("OIDC_ADMIN_EMAILS", "")
    admin_emails = [e.strip().lower() for e in admin_emails_raw.split(",") if e.strip()]

    auth_url = os.environ.get("OIDC_AUTH_URL", "").strip() or None
    token_url = os.environ.get("OIDC_TOKEN_URL", "").strip() or None
    userinfo_url = os.environ.get("OIDC_USERINFO_URL", "").strip() or None
    jwks_url = os.environ.get("OIDC_JWKS_URL", "").strip() or None

    return {
        "issuer_url": issuer_url,
        "client_id": client_id,
        "client_secret": client_secret,
        "scopes": scopes,
        "redirect_uri": redirect_uri,
        "button_label": button_label,
        "default_role": default_role,
        "admin_group": admin_group,
        "admin_emails": admin_emails,
        "auth_url": auth_url,
        "token_url": token_url,
        "userinfo_url": userinfo_url,
        "jwks_url": jwks_url,
    }


def clear_oidc_cache() -> None:
    """Clear in-memory discovery cache (mainly for tests)."""
    _discovery_cache.clear()


def get_discovery_document(issuer_url: str) -> dict[str, Any]:
    """Fetch OIDC discovery document (.well-known/openid-configuration)."""
    issuer_clean = issuer_url.rstrip("/")
    if issuer_clean in _discovery_cache:
        return _discovery_cache[issuer_clean]

    discovery_url = (
        issuer_clean
        if issuer_clean.endswith("/.well-known/openid-configuration")
        else f"{issuer_clean}/.well-known/openid-configuration"
    )
    try:
        resp = httpx.get(discovery_url, timeout=10.0)
        resp.raise_for_status()
        doc = resp.json()
        _discovery_cache[issuer_clean] = doc
        return doc
    except Exception as exc:
        _log.error("Failed to fetch OIDC discovery document from %s: %s", discovery_url, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch OIDC discovery document: {exc}",
        ) from exc


def get_oidc_endpoints(config: dict[str, Any]) -> dict[str, str]:
    """Resolve authorization, token, and userinfo endpoints from config or discovery."""
    auth_url = config.get("auth_url")
    token_url = config.get("token_url")
    userinfo_url = config.get("userinfo_url")
    jwks_url = config.get("jwks_url")

    issuer_url = config.get("issuer_url", "")
    if issuer_url and not (auth_url and token_url):
        doc = get_discovery_document(issuer_url)
        if not auth_url and "authorization_endpoint" in doc:
            auth_url = str(doc["authorization_endpoint"])
        if not token_url and "token_endpoint" in doc:
            token_url = str(doc["token_endpoint"])
        if not userinfo_url and "userinfo_endpoint" in doc:
            userinfo_url = str(doc["userinfo_endpoint"])
        if not jwks_url and "jwks_uri" in doc:
            jwks_url = str(doc["jwks_uri"])

    if not auth_url or not token_url:
        raise HTTPException(
            status_code=500,
            detail="OIDC configuration error: missing authorization_endpoint or token_endpoint",
        )

    endpoints: dict[str, str] = {
        "authorization_endpoint": auth_url,
        "token_endpoint": token_url,
    }
    if userinfo_url:
        endpoints["userinfo_endpoint"] = userinfo_url
    if jwks_url:
        endpoints["jwks_uri"] = jwks_url
    return endpoints


def build_redirect_uri(request: Request, config: dict[str, Any]) -> str:
    """Build the callback redirect URI."""
    if config.get("redirect_uri"):
        return str(config["redirect_uri"])
    base_url = get_settings().get("appBaseUrl") or os.environ.get("APP_BASE_URL")
    if not base_url:
        base_url = str(request.base_url).rstrip("/")
    return f"{base_url.rstrip('/')}/api/auth/oidc/callback"


def safe_redirect_path(path: str | None) -> str:
    """Validate that the redirect path is a relative URL to prevent open redirect vulnerabilities."""
    if not path:
        return "/"
    path = path.strip()
    if path.startswith("/") and not path.startswith("//"):
        return path
    return "/"


def create_authorization_url(request: Request) -> tuple[str, str]:
    """Generate authorization endpoint URL and signed state cookie value."""
    if not is_oidc_enabled():
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    config = get_oidc_config()
    endpoints = get_oidc_endpoints(config)

    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)

    raw_redirect = request.query_params.get("redirect")
    redirect_path = safe_redirect_path(raw_redirect)
    redirect_uri = build_redirect_uri(request, config)

    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "scope": config["scopes"],
        "redirect_uri": redirect_uri,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }

    state_payload = {
        "state": state,
        "nonce": nonce,
        "cv": code_verifier,
        "rd": redirect_path,
        "exp": int((datetime.now(UTC) + timedelta(minutes=10)).timestamp()),
    }
    state_cookie = jwt.encode(state_payload, _get_secret(), algorithm="HS256")

    auth_endpoint = endpoints["authorization_endpoint"]
    delimiter = "&" if "?" in auth_endpoint else "?"
    full_auth_url = f"{auth_endpoint}{delimiter}{urllib.parse.urlencode(params)}"
    return full_auth_url, state_cookie


def _sanitize_username(candidate: str) -> str:
    """Sanitize a candidate string into a valid username (3-32 chars, a-zA-Z0-9_-)."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", candidate).strip("_")
    if len(cleaned) < 3:
        cleaned = f"user_{cleaned}" if cleaned else "user"
        if len(cleaned) < 3:
            cleaned = "user_1"
    return cleaned[:32]


def _check_is_admin(
    claims: dict[str, Any], config: dict[str, Any], all_users: list[dict[str, Any]]
) -> bool:
    """Determine whether the OIDC user should have the admin role."""
    # The first user registered on an empty instance receives admin
    if not all_users:
        return True
    if config.get("default_role") == "admin":
        return True
    email = claims.get("email")
    if email and isinstance(email, str):
        admin_emails = config.get("admin_emails", [])
        if email.strip().lower() in admin_emails:
            return True
    admin_group = config.get("admin_group")
    if admin_group:
        for key in ("groups", "roles", "cognito:groups"):
            val = claims.get(key)
            if isinstance(val, list) and admin_group in val:
                return True
            if isinstance(val, str) and admin_group == val:
                return True
    return False


def resolve_or_provision_user(claims: dict[str, Any], config: dict[str, Any]) -> AuthUser:
    """Match existing user by OIDC sub, email, or username; or auto-provision new user."""
    sub = str(claims["sub"])
    raw_email = claims.get("email")
    email = raw_email.strip() if isinstance(raw_email, str) else None

    preferred_username = claims.get("preferred_username")
    all_users = list_users()
    matched_user: dict[str, Any] | None = None

    # 1. Match by stored oidcSub
    for u in all_users:
        if u.get("oidcSub") == sub:
            matched_user = u
            break

    # 2. Match by email
    if matched_user is None and email:
        for u in all_users:
            u_email = u.get("email")
            if isinstance(u_email, str) and u_email.strip().lower() == email.lower():
                matched_user = u
                break

    # 3. Match by preferred_username if present
    if matched_user is None and preferred_username and isinstance(preferred_username, str):
        clean_pref = _sanitize_username(preferred_username)
        u = get_user(clean_pref)
        if u is not None:
            user_sub = u.get("oidcSub")
            user_email = u.get("email")
            matches_email = (
                isinstance(user_email, str) and user_email.strip().lower() == email.lower()
                if email
                else False
            )
            if not user_sub or matches_email:
                matched_user = u

    should_be_admin = _check_is_admin(claims, config, all_users)

    if matched_user is not None:
        updates: dict[str, Any] = {}
        if not matched_user.get("oidcSub"):
            updates["oidcSub"] = sub
        if email and not matched_user.get("email"):
            updates["email"] = email
        if should_be_admin and matched_user.get("role") != "admin":
            updates["role"] = "admin"
            matched_user["role"] = "admin"
        if updates:
            set_user_fields(matched_user["pk"], updates)
    else:
        # Auto-provision new user
        candidate = (
            preferred_username
            if (preferred_username and isinstance(preferred_username, str))
            else (email.split("@")[0] if email else f"user_{sub}")
        )
        cleaned_username = _sanitize_username(candidate)

        final_username = cleaned_username
        counter = 2
        while get_user(final_username) is not None:
            suffix = f"_{counter}"
            prefix = cleaned_username[: 32 - len(suffix)]
            final_username = f"{prefix}{suffix}"
            counter += 1

        display_name = (
            claims.get("name")
            or claims.get("displayName")
            or preferred_username
            or (email.split("@")[0] if email else None)
            or final_username
        )
        if isinstance(display_name, str):
            display_name = display_name.strip()[:60]
        if not display_name:
            display_name = final_username

        role = "admin" if should_be_admin else config.get("default_role", "readonly")

        new_user = {
            "pk": final_username,
            "displayName": display_name,
            "role": role,
            "passwordHash": "$disabled$oidc",
            "createdAt": datetime.now(UTC).isoformat(),
            "oidcSub": sub,
        }
        if email:
            new_user["email"] = email
        put_user(new_user)
        matched_user = new_user

    return AuthUser(
        sub=matched_user["pk"],
        role=matched_user["role"],
        displayName=matched_user["displayName"],
        tokenVersion=int(matched_user.get("tokenVersion", 0)),
    )


def process_oidc_callback(request: Request, code: str, state: str) -> tuple[AuthUser, str]:
    """Validate OIDC callback parameters, exchange code for token, and return authenticated user."""
    if not is_oidc_enabled():
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    config = get_oidc_config()
    endpoints = get_oidc_endpoints(config)

    cookie_token = request.cookies.get("oidc_state")
    if not cookie_token:
        raise HTTPException(status_code=400, detail="Missing OIDC state cookie")

    try:
        state_payload = jwt.decode(cookie_token, _get_secret(), algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired OIDC state") from exc

    expected_state = state_payload.get("state", "")
    if not hmac.compare_digest(expected_state, state):
        raise HTTPException(status_code=400, detail="OIDC state parameter mismatch")

    redirect_uri = build_redirect_uri(request, config)
    code_verifier = state_payload.get("cv", "")

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "code_verifier": code_verifier,
    }
    try:
        resp = httpx.post(
            endpoints["token_endpoint"],
            data=token_data,
            headers={"Accept": "application/json"},
            timeout=15.0,
        )
        if resp.status_code != 200:
            _log.error("OIDC token exchange failed (%s): %s", resp.status_code, resp.text)
            raise HTTPException(
                status_code=400, detail=f"Token exchange failed from identity provider: {resp.text}"
            )
        tokens = resp.json()
    except httpx.HTTPError as exc:
        _log.error("OIDC token request HTTP error: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"Failed to connect to identity provider: {exc}"
        ) from exc

    access_token = tokens.get("access_token")
    id_token = tokens.get("id_token")

    claims: dict[str, Any] = {}
    if id_token:
        try:
            jwks_uri = endpoints.get("jwks_uri")
            if jwks_uri:
                try:
                    jwks_client = jwt.PyJWKClient(jwks_uri)
                    signing_key = jwks_client.get_signing_key_from_jwt(id_token)
                    decoded_id = jwt.decode(
                        id_token,
                        signing_key.key,
                        algorithms=["RS256", "ES256", "HS256"],
                        audience=config["client_id"],
                        options={"verify_exp": True},
                    )
                except Exception:
                    decoded_id = jwt.decode(id_token, options={"verify_signature": False})
            else:
                decoded_id = jwt.decode(id_token, options={"verify_signature": False})
            claims.update(decoded_id)
        except Exception as exc:
            _log.warning("Failed to parse id_token: %s", exc)

    expected_nonce = state_payload.get("nonce", "")
    if (
        "nonce" in claims
        and expected_nonce
        and not hmac.compare_digest(str(claims["nonce"]), str(expected_nonce))
    ):
        raise HTTPException(status_code=400, detail="OIDC nonce mismatch")

    if endpoints.get("userinfo_endpoint") and access_token:
        try:
            ui_resp = httpx.get(
                endpoints["userinfo_endpoint"],
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                timeout=10.0,
            )
            if ui_resp.status_code == 200:
                claims.update(ui_resp.json())
            else:
                _log.warning(
                    "OIDC userinfo responded with %s: %s", ui_resp.status_code, ui_resp.text
                )
        except Exception as exc:
            _log.warning("OIDC userinfo fetch failed: %s", exc)

    if not claims.get("sub"):
        raise HTTPException(
            status_code=400, detail="Identity provider did not return a user identifier (sub)"
        )

    auth_user = resolve_or_provision_user(claims, config)
    target_redirect = state_payload.get("rd") or "/"
    return auth_user, target_redirect
