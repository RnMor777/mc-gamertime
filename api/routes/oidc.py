"""OIDC/SSO login routes.

Endpoints:
  POST /api/auth/oidc/start — Begin the OIDC login flow; returns { authorizeUrl }.
  GET /api/auth/oidc/callback — Handle the OAuth 2.0 callback; sets session cookie.
  GET /api/auth/oidc/config — Check whether OIDC is enabled (public endpoint).
"""

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from lib import auth as auth_lib
from lib.auth import AuthUser
from lib.db.users import get_user, put_user
from lib.oidc import (
    exchange_code_for_token,
    get_authorization_url,
    get_oidc_config,
    state_token_for_session,
    verify_state_token,
)
from lib.rate_limit import limiter
from lib.security_log import log_security_event

router = APIRouter()
_log = logging.getLogger("oidc_routes")


class OidcStartRequest(BaseModel):
    """Request to initiate OIDC login."""

    sessionId: str


class OidcStartResponse(BaseModel):
    """Response with the authorization URL."""

    authorizeUrl: str


@router.post("/oidc/start")
@limiter.limit("10/minute")
def oidc_start(request: Request, body: OidcStartRequest) -> OidcStartResponse:
    """Start the OIDC login flow.

    Returns a URL to redirect the user to the OIDC provider.
    """
    cfg = get_oidc_config()
    if cfg is None:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    state = state_token_for_session(body.sessionId)
    try:
        auth_url = get_authorization_url(state)
    except Exception as exc:
        _log.error("Failed to generate authorization URL: %s", exc)
        raise HTTPException(status_code=500, detail="Authorization URL generation failed") from exc

    return OidcStartResponse(authorizeUrl=auth_url)


def _cookie_is_secure(request: Request) -> bool:
    """Whether to mark the session cookie Secure (copied from auth.py)."""
    return request.url.scheme == "https"


@router.get("/oidc/callback")
@limiter.limit("10/minute")
def oidc_callback(
    request: Request,
    response: Response,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
):
    """Handle the OAuth 2.0 callback from the OIDC provider.

    Exchanges the authorization code for an ID token, creates or updates
    the user, and returns a session cookie.
    """
    cfg = get_oidc_config()
    if cfg is None:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    # Extract session ID from state and verify CSRF token
    if ":" not in state:
        log_security_event("auth.oidc.callback.invalid_state", ip=_client_ip(request))
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    session_id, _ = state.split(":", 1)

    # Note: In a real implementation, you'd verify the state against a session store
    # with expiry. For now, we do basic validation.
    if not verify_state_token(state, session_id):
        log_security_event("auth.oidc.callback.state_mismatch", ip=_client_ip(request))
        raise HTTPException(status_code=400, detail="State mismatch")

    # Exchange authorization code for ID token
    try:
        id_token = exchange_code_for_token(code)
    except Exception as exc:
        _log.error("Token exchange failed: %s", exc)
        log_security_event("auth.oidc.callback.token_exchange_failed", ip=_client_ip(request))
        raise HTTPException(status_code=500, detail="Token exchange failed") from exc

    # Extract user identity from the ID token
    username = id_token.get("sub")
    email = id_token.get("email")
    display_name = id_token.get("name") or username

    if not username:
        _log.error("No 'sub' claim in ID token")
        raise HTTPException(status_code=400, detail="Invalid ID token")

    # Get or create user
    user = get_user(username)
    if user is None:
        # Auto-create user on first login via OIDC
        user = {
            "pk": username,
            "createdAt": datetime.now(UTC).isoformat(),
            "username": username,
            "displayName": display_name,
            "email": email,
            "role": "readonly",  # Default role for OIDC users; adjust as needed
            "passwordHash": None,  # No local password for OIDC users
            "tokenVersion": 0,
        }
        put_user(user)
        _log.info("Auto-created OIDC user %s", username)
    else:
        # Update display name and email if they've changed
        updated = False
        if user.get("displayName") != display_name:
            user["displayName"] = display_name
            updated = True
        if email and user.get("email") != email:
            user["email"] = email
            updated = True
        if updated:
            put_user(user)

    # Create session token
    auth_user = AuthUser(
        sub=username,
        role=user["role"],
        displayName=user["displayName"],
        tokenVersion=int(user.get("tokenVersion", 0)),
    )
    token = auth_lib.sign_token(auth_user)

    # Set session cookie
    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="strict",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )

    log_security_event("auth.oidc.callback.success", username=username, ip=_client_ip(request))

    # Redirect to home; the frontend can extract user data from /api/auth/me
    # In production, you might redirect to a specific page or use a callback parameter.
    return {"sub": auth_user.sub, "role": auth_user.role, "displayName": auth_user.displayName}


class OidcConfigResponse(BaseModel):
    """Response with OIDC configuration status."""

    enabled: bool
    localLoginAllowed: bool


@router.get("/oidc/config")
def oidc_config() -> OidcConfigResponse:
    """Check OIDC configuration status (public endpoint, no auth required)."""
    cfg = get_oidc_config()
    if cfg is None:
        return OidcConfigResponse(enabled=False, localLoginAllowed=True)
    return OidcConfigResponse(enabled=True, localLoginAllowed=cfg.local_login_allowed)


def _client_ip(request: Request) -> str:
    """Extract client IP from request."""
    # Mirrors lib/rate_limit.py::client_ip()
    if forwarded := request.headers.get("x-forwarded-for"):
        return forwarded.split(",")[0].strip()
    if peer := request.client:
        return peer.host
    return "unknown"
