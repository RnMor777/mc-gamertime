from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

_log = logging.getLogger("oidc")

_oidc_state_store: dict[str, str] = {}


@dataclass
class OidcConfig:
    enabled: bool
    local_login_allowed: bool
    provider_url: str
    client_id: str
    client_secret: str
    redirect_uri: str
    discovery: dict[str, Any]
    issuer: str
    username_claim: str
    display_name_claim: str
    email_claim: str
    admin_group_claim: str
    admin_group_values: set[str]
    default_role: str


_oidc_config: OidcConfig | None = None


def get_oidc_config() -> OidcConfig | None:
    return _oidc_config


def initialize_oidc(secrets_provider: str, ssm_client=None) -> None:
    global _oidc_config

    if os.environ.get("OIDC_ENABLED", "false").lower() != "true":
        _oidc_config = None
        return

    provider_url = os.environ.get("OIDC_PROVIDER_URL", "").strip()
    client_id = os.environ.get("OIDC_CLIENT_ID", "").strip()
    redirect_uri = os.environ.get("OIDC_REDIRECT_URI", "").strip()

    if not provider_url or not client_id or not redirect_uri:
        raise RuntimeError(
            "OIDC_ENABLED=true requires OIDC_PROVIDER_URL, OIDC_CLIENT_ID, and OIDC_REDIRECT_URI"
        )

    if secrets_provider == "ssm":
        if ssm_client is None:
            raise RuntimeError("SSM client required when SECRETS_PROVIDER=ssm")
        try:
            client_secret = ssm_client.get_parameter(
                Name="/boardsite/oidc-client-secret",
                WithDecryption=True,
            )["Parameter"]["Value"]
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch OIDC client secret from SSM: {exc}") from exc
    else:
        client_secret = os.environ.get("OIDC_CLIENT_SECRET", "").strip()
        if not client_secret:
            raise RuntimeError("OIDC_ENABLED=true requires OIDC_CLIENT_SECRET")

    discovery = _fetch_discovery_document(provider_url)
    issuer = discovery.get("issuer")
    if not issuer:
        raise RuntimeError("OIDC discovery document is missing issuer")

    jwks_uri = discovery.get("jwks_uri")
    if not jwks_uri:
        raise RuntimeError("OIDC discovery document is missing jwks_uri")

    username_claim = os.environ.get("OIDC_USERNAME_CLAIM", "preferred_username").strip() or "preferred_username"
    display_name_claim = os.environ.get("OIDC_DISPLAY_NAME_CLAIM", "name").strip() or "name"
    email_claim = os.environ.get("OIDC_EMAIL_CLAIM", "email").strip() or "email"
    admin_group_claim = os.environ.get("OIDC_ADMIN_GROUP_CLAIM", "groups").strip() or "groups"
    admin_group_values = {
        value.strip()
        for value in os.environ.get("OIDC_ADMIN_GROUP_VALUES", "").split(",")
        if value.strip()
    }

    default_role = os.environ.get("OIDC_DEFAULT_ROLE", "readonly").strip().lower()
    if default_role not in {"readonly", "admin"}:
        default_role = "readonly"

    local_login_allowed = os.environ.get("LOCAL_LOGIN_ENABLED", "true").lower() == "true"

    _oidc_config = OidcConfig(
        enabled=True,
        local_login_allowed=local_login_allowed,
        provider_url=provider_url,
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        discovery=discovery,
        issuer=issuer,
        username_claim=username_claim,
        display_name_claim=display_name_claim,
        email_claim=email_claim,
        admin_group_claim=admin_group_claim,
        admin_group_values=admin_group_values,
        default_role=default_role,
    )

    _log.info(
        "OIDC enabled with provider=%s local_login_allowed=%s default_role=%s",
        provider_url,
        local_login_allowed,
        default_role,
    )


def _fetch_discovery_document(provider_url: str) -> dict[str, Any]:
    url = provider_url.rstrip("/") + "/.well-known/openid-configuration"
    try:
        with httpx.Client() as client:
            res = client.get(url, timeout=10)
            res.raise_for_status()
            return res.json()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch OIDC discovery document from {url}: {exc}") from exc


def state_token_for_session(session_id: str) -> str:
    """Create and store a state token for the given session ID.
    
    Returns a state string in the format: session_id:nonce
    """
    nonce = secrets.token_urlsafe(32)
    _oidc_state_store[session_id] = nonce
    return f"{session_id}:{nonce}"


def verify_state_token(state: str, session_id: str) -> bool:
    """Verify a state token matches the expected session ID and nonce."""
    if not state or ":" not in state:
        return False

    stored_session_id, nonce = state.split(":", 1)
    if stored_session_id != session_id:
        return False

    expected = _oidc_state_store.pop(session_id, None)
    if expected is None:
        return False

    return secrets.compare_digest(expected, nonce)


def get_authorization_url(state: str) -> str:
    """Generate the OIDC provider authorization URL."""
    cfg = get_oidc_config()
    if cfg is None:
        raise RuntimeError("OIDC is not enabled")

    auth_endpoint = cfg.discovery.get("authorization_endpoint")
    if not auth_endpoint:
        raise RuntimeError("authorization_endpoint missing from OIDC discovery document")

    nonce = state.split(":", 1)[1] if ":" in state else ""
    params = {
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
    }
    return f"{auth_endpoint}?{httpx.QueryParams(params).render_url()}"


def exchange_code_for_token(code: str) -> dict[str, Any]:
    """Exchange an authorization code for an ID token.
    
    Returns the decoded ID token payload.
    """
    cfg = get_oidc_config()
    if cfg is None:
        raise RuntimeError("OIDC is not enabled")

    token_endpoint = cfg.discovery.get("token_endpoint")
    if not token_endpoint:
        raise RuntimeError("token_endpoint missing from OIDC discovery document")

    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": cfg.redirect_uri,
        "client_id": cfg.client_id,
        "client_secret": cfg.client_secret,
    }

    try:
        with httpx.Client() as client:
            res = client.post(token_endpoint, data=payload, timeout=10)
            res.raise_for_status()
            token_response = res.json()
    except Exception as exc:
        raise RuntimeError(f"Failed to exchange authorization code for token: {exc}") from exc

    id_token_jwt = token_response.get("id_token")
    if not id_token_jwt:
        raise RuntimeError("No id_token in token response from OIDC provider")

    # Decode and validate the ID token
    return decode_and_validate_id_token(id_token_jwt)


def decode_and_validate_id_token(token: str) -> dict[str, Any]:
    """Decode and validate an ID token using the OIDC provider's public keys."""
    cfg = get_oidc_config()
    if cfg is None:
        raise RuntimeError("OIDC is not enabled")

    jwks_uri = cfg.discovery.get("jwks_uri")
    if not jwks_uri:
        raise RuntimeError("jwks_uri missing from OIDC discovery document")

    try:
        signing_key = jwt.PyJWKClient(jwks_uri).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            key=signing_key.key,
            algorithms=[signing_key.algorithm],
            audience=cfg.client_id,
            issuer=cfg.issuer,
            options={
                "require": ["exp", "iss", "aud", "sub"],
            },
        )
    except Exception as exc:
        raise RuntimeError(f"OIDC ID token validation failed: {exc}") from exc

    return payload


def claim_value(payload: dict[str, Any], *keys: str) -> str | None:
    """Extract a claim value from a token payload, trying multiple keys."""
    for key in keys:
        if not key:
            continue
        value = payload.get(key)
        if value is not None and value != "":
            return str(value)
    return None


def extract_user_claims(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract user identity claims from an ID token payload."""
    cfg = get_oidc_config()
    if cfg is None:
        return {}

    username = claim_value(payload, cfg.username_claim, "email", "sub")
    display_name = claim_value(payload, cfg.display_name_claim, "preferred_username", username)
    email = claim_value(payload, cfg.email_claim, "email")
    groups = payload.get(cfg.admin_group_claim, [])
    if isinstance(groups, str):
        groups = [groups]
    if not isinstance(groups, list):
        groups = []

    preferred_role = cfg.default_role
    if cfg.admin_group_values and any(str(g) in cfg.admin_group_values for g in groups):
        preferred_role = "admin"
    elif cfg.admin_group_values and any(str(g) in cfg.admin_group_values for g in [str(groups)]):
        preferred_role = "admin"

    return {
        "username": username,
        "display_name": display_name or username,
        "email": email,
        "role": preferred_role,
    }
