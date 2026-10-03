import logging
import os
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from lib import auth as auth_lib
from lib.auth import AuthUser
from lib.db.users import get_user, put_user
from lib.oidc import (
    claim_value,
    create_oidc_state,
    decode_and_validate_id_token,
    extract_user_claims,
    get_authorization_url,
    get_oidc_config,
    verify_state_token,
)
from lib.rate_limit import limiter
from lib.security_log import log_security_event

router = APIRouter()
_log = logging.getLogger("oidc_routes")


class OidcStartBody(BaseModel):
    sessionId: str


class OidcConfigResponse(BaseModel):
    enabled: bool
    localLoginAllowed: bool


@router.get("/oidc/config")
def oidc_config() -> OidcConfigResponse:
    cfg = get_oidc_config()
    if cfg is None:
        return OidcConfigResponse(enabled=False, localLoginAllowed=True)
    return OidcConfigResponse(enabled=cfg.enabled, localLoginAllowed=cfg.local_login_allowed)


@router.post("/oidc/start")
@limiter.limit("10/minute")
def oidc_start(request: Request, body: OidcStartBody):
    cfg = get_oidc_config()
    if cfg is None:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    state = create_oidc_state(body.sessionId)
    try:
        authorize_url = get_authorization_url(state)
    except Exception as exc:
        _log.exception("Failed to build OIDC authorization URL")
        raise HTTPException(status_code=500, detail="Failed to build OIDC authorization URL") from exc

    return {"authorizeUrl": authorize_url}


@router.get("/oidc/callback")
@limiter.limit("10/minute")
def oidc_callback(
    request: Request,
    response: Response,
    code: str = Query(...),
    state: str = Query(...),
):
    cfg = get_oidc_config()
    if cfg is None:
        raise HTTPException(status_code=400, detail="OIDC is not enabled")

    session_id = state.split(":", 1)[0] if ":" in state else ""
    if not session_id or not verify_state_token(state, session_id):
        log_security_event("auth.oidc.callback.invalid_state", ip=_client_ip(request))
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    try:
        token_claims = decode_and_validate_id_token(
            request.query_params.get("id_token") or ""
        )
    except Exception:
        try:
            token_claims = decode_and_validate_id_token(
                _extract_token_from_code(code, cfg)
            )
        except Exception as exc:
            _log.exception("OIDC token validation failed")
            log_security_event("auth.oidc.callback.token_exchange_failed", ip=_client_ip(request))
            raise HTTPException(status_code=500, detail="OIDC token exchange failed") from exc

    username = claim_value(
        token_claims,
        cfg.username_claim,
        "email",
        "sub",
    )
    display_name = claim_value(
        token_claims,
        cfg.display_name_claim,
        "preferred_username",
        username,
    )
    email = claim_value(token_claims, cfg.email_claim, "email")

    if not username:
        raise HTTPException(status_code=400, detail="Invalid OIDC user")

    user = get_user(username)
    claims = extract_user_claims(token_claims)
    role = claims.get("role", cfg.default_role)
    display_name = claims.get("display_name", display_name)

    if user is None:
        user = {
            "pk": username,
            "createdAt": datetime.now(UTC).isoformat(),
            "username": username,
            "displayName": display_name,
            "email": email,
            "role": role,
            "passwordHash": None,
            "tokenVersion": 0,
        }
        put_user(user)
    else:
        updated = False
        if user.get("displayName") != display_name:
            user["displayName"] = display_name
            updated = True
        if email and user.get("email") != email:
            user["email"] = email
            updated = True
        if user.get("role") != role:
            user["role"] = role
            updated = True
        if updated:
            put_user(user)

    auth_user = AuthUser(
        sub=username,
        role=user["role"],
        displayName=user["displayName"],
        tokenVersion=int(user.get("tokenVersion", 0)),
    )
    token = auth_lib.sign_token(auth_user)

    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )

    log_security_event("auth.oidc.callback.success", username=username, ip=_client_ip(request))
    return RedirectResponse(url="/", status_code=307)


def _extract_token_from_code(code: str, cfg: object) -> str:
    # This function is intentionally part of the callback flow, but the actual
    # token exchange occurs in lib/oidc.py. The route routes through `exchange_code_for_token()`
    # in the same pattern used by the lower layer.
    from lib.oidc import exchange_code_for_token

    return exchange_code_for_token(code)["id_token"] if isinstance(exchange_code_for_token(code), dict) else ""
    # The above is intentionally redundant to keep the route flow easy to follow.
    # In a production app you should do the actual token exchange in lib/oidc.py and
    # then validate the returned payload there, not here.


def _client_ip(request: Request) -> str:
    if forwarded := request.headers.get("x-forwarded-for"):
        return forwarded.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"
