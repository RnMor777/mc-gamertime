import logging
import os
import time
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from starlette.responses import RedirectResponse

from lib.auth import (
    AuthUser,
    decode_reset_token,
    password_within_bcrypt_limit,
    require_auth,
    sign_reset_token,
    sign_token,
    validate_password_length,
)
from lib.db.libraries import ensure_personal_library
from lib.db.settings import get_settings
from lib.db.users import get_user, record_failed_login, set_user_fields
from lib.mailer import send_email
from lib.oidc import (
    create_authorization_url,
    get_oidc_button_label,
    is_local_auth_disabled,
    is_oidc_enabled,
    process_oidc_callback,
)
from lib.rate_limit import client_ip, limiter
from lib.security_log import log_security_event

_log = logging.getLogger("auth")

router = APIRouter()

TIMING_HASH = "$2b$12$GbFii5cNI8tI3Nk8JKwPtOpAEYYup.F0BX8clhunPI87tXCCL0eIG"

_INLINE_DELAY_CEILING = 4  # seconds — absorb waits this short server-side via sleep
_BACKOFF_CAP = 300  # seconds — max required wait between attempts (5 min)
_RESET_WINDOW = timedelta(hours=1)  # failures older than this no longer count


class LoginBody(BaseModel):
    username: str
    password: str


def _effective_failed_attempts(user: dict, now: datetime) -> int:
    last_raw = user.get("lastFailureAt")
    if not last_raw:
        return 0
    if now - datetime.fromisoformat(last_raw) > _RESET_WINDOW:
        return 0
    # DynamoDB hands back every number as decimal.Decimal, and the arithmetic
    # below flows into timedelta(seconds=...), which rejects Decimal. SQLite
    # returns int, which is why this only ever failed on the cloud deployment.
    return int(user.get("failedAttempts", 0) or 0)


def _seconds_until_next_attempt(user: dict, now: datetime) -> float:
    attempts = _effective_failed_attempts(user, now)
    if attempts == 0:
        return 0.0
    last_failure = datetime.fromisoformat(user["lastFailureAt"])
    backoff = min(2 ** (attempts - 1), _BACKOFF_CAP)
    return max(0.0, (last_failure + timedelta(seconds=backoff) - now).total_seconds())


def _cookie_is_secure(request: Request) -> bool:
    """Whether to mark the session cookie Secure.

    Browsers refuse to *store* a Secure cookie that arrives over plain HTTP
    from anything other than localhost, so hardcoding it makes the app unusable
    on a LAN address: login returns 200, the cookie is dropped, and the user
    lands back on the sign-in page with no error.

    The flag protects a cookie by keeping it off plaintext connections — over
    plain HTTP the value has already crossed the wire in the clear, so setting
    it there buys nothing and only breaks the session. Behind TLS, which is the
    documented way to expose this app beyond a trusted network, the request
    arrives as https (uvicorn runs with --proxy-headers, so a reverse proxy's
    X-Forwarded-Proto is honoured) and the flag is set exactly as before.
    """
    return request.url.scheme == "https"


@router.get("/config")
def auth_config():
    return {
        "oidcEnabled": is_oidc_enabled(),
        "disableLocalAuth": is_local_auth_disabled(),
        "oidcButtonLabel": get_oidc_button_label(),
    }


@router.get("/oidc/login")
@limiter.limit("20/minute")
def oidc_login(request: Request, response: Response, redirect: str | None = None):
    if not is_oidc_enabled():
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    auth_url, state_cookie = create_authorization_url(request)
    redirect_resp = RedirectResponse(auth_url, status_code=303)
    redirect_resp.set_cookie(
        key="oidc_state",
        value=state_cookie,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="lax",
        path="/",
        max_age=600,
    )
    return redirect_resp


@router.get("/oidc/callback")
@limiter.limit("20/minute")
def oidc_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    if not is_oidc_enabled():
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    if error:
        _log.warning("OIDC provider returned error: %s (%s)", error, error_description)
        redirect_resp = RedirectResponse(
            f"/login?error={urllib.parse.quote(error)}", status_code=303
        )
        redirect_resp.delete_cookie(
            key="oidc_state", path="/", secure=_cookie_is_secure(request), samesite="lax"
        )
        return redirect_resp

    if not code or not state:
        redirect_resp = RedirectResponse("/login?error=invalid_request", status_code=303)
        redirect_resp.delete_cookie(
            key="oidc_state", path="/", secure=_cookie_is_secure(request), samesite="lax"
        )
        return redirect_resp

    try:
        auth_user, target_redirect = process_oidc_callback(request, code, state)
    except HTTPException as exc:
        redirect_resp = RedirectResponse(
            f"/login?error={urllib.parse.quote(str(exc.detail))}", status_code=303
        )
        redirect_resp.delete_cookie(
            key="oidc_state", path="/", secure=_cookie_is_secure(request), samesite="lax"
        )
        return redirect_resp
    except Exception as exc:
        _log.exception("Unexpected error in OIDC callback: %s", exc)
        redirect_resp = RedirectResponse("/login?error=sso_failed", status_code=303)
        redirect_resp.delete_cookie(
            key="oidc_state", path="/", secure=_cookie_is_secure(request), samesite="lax"
        )
        return redirect_resp

    token = sign_token(auth_user)
    redirect_resp = RedirectResponse(url=target_redirect, status_code=303)
    redirect_resp.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="strict",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    redirect_resp.delete_cookie(
        key="oidc_state", path="/", secure=_cookie_is_secure(request), samesite="lax"
    )
    return redirect_resp


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginBody, response: Response):
    if is_local_auth_disabled():
        raise HTTPException(status_code=403, detail="Local authentication is disabled")
    user = get_user(body.username)
    now = datetime.now(UTC)

    if user is not None:
        wait = _seconds_until_next_attempt(user, now)
        if wait > _INLINE_DELAY_CEILING:
            log_security_event(
                "auth.login.throttled", username=body.username, ip=client_ip(request)
            )
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts",
                headers={"Retry-After": str(int(wait) + 1)},
            )
        if wait > 0:
            # Inline sleep burns billed Lambda time (≤4 s). Acceptable at this scale;
            # revisit if login abuse ever shows up in the bill.
            time.sleep(wait)

    # bcrypt raises above 72 bytes instead of truncating. Such a password can
    # never match a stored hash (every write path enforces the same limit), so
    # treat it as a wrong password rather than letting it 500 — and keep it on
    # the same code path so it stays indistinguishable to an attacker.
    password_usable = password_within_bcrypt_limit(body.password)
    if (
        user is None
        or not password_usable
        or not bcrypt.checkpw(body.password.encode(), user["passwordHash"].encode())
    ):
        if user is None:
            # Dummy hash so an unknown username costs the same as a known one.
            # Skipped for an over-long password, which bcrypt refuses outright:
            # that branch never touched a real hash either, so the two remain
            # indistinguishable, and the length is a property of the request
            # rather than of whether the account exists.
            if password_usable:
                bcrypt.checkpw(body.password.encode(), TIMING_HASH.encode())
        else:
            record_failed_login(user["pk"], now.isoformat())
        log_security_event("auth.login.failed", username=body.username, ip=client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("failedAttempts"):
        set_user_fields(user["pk"], {"failedAttempts": 0, "lastFailureAt": None})

    ensure_personal_library(user["pk"], user.get("displayName"))

    auth_user = AuthUser(
        sub=body.username,
        role=user["role"],
        displayName=user["displayName"],
        tokenVersion=int(user.get("tokenVersion", 0)),
    )
    token = sign_token(auth_user)

    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="strict",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    return {"sub": auth_user.sub, "role": auth_user.role, "displayName": auth_user.displayName}


@router.get("/me")
def me(user: Annotated[AuthUser, Depends(require_auth)]):
    return {"sub": user.sub, "role": user.role, "displayName": user.displayName}


# NOTE: bumping tokenVersion invalidates ALL of this user's sessions on every
# device, not just the current one. Intentional: simple revocation > per-session jti.
@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: Annotated[AuthUser, Depends(require_auth)]):
    set_user_fields(user.sub, {}, bump_token_version=True)
    # Attributes must match the ones the cookie was set with, or the browser
    # keeps it (the session is dead either way — tokenVersion was bumped — but
    # a stale cookie left behind is untidy and confusing to debug).
    response.delete_cookie(
        key="token", path="/", secure=_cookie_is_secure(request), samesite="strict"
    )


class ForgotPasswordBody(BaseModel):
    username: str


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str = Field(min_length=12)

    @field_validator("newPassword")
    @classmethod
    def within_bcrypt_limit(cls, v: str) -> str:
        return validate_password_length(v)


@router.post("/forgot-password", status_code=204)
@limiter.limit("5/minute")
def forgot_password(request: Request, response: Response, body: ForgotPasswordBody):
    if is_local_auth_disabled():
        raise HTTPException(status_code=403, detail="Local authentication is disabled")
    user = get_user(body.username)
    if user is not None and user.get("email"):
        token = sign_reset_token(user["pk"], int(user.get("tokenVersion", 0)))
        # request.base_url echoes the client-supplied Host header — never trust it for
        # outbound links (CWE-640 password-reset poisoning). appBaseUrl (DB setting,
        # admin-editable via Settings page) and APP_BASE_URL (env var) are both
        # operator-controlled and equally trusted; DB wins when both are set so an
        # admin can override/correct the env value without a container restart.
        base_url = get_settings().get("appBaseUrl") or os.environ.get("APP_BASE_URL")
        if not base_url:
            # Only fall back to the spoofable Host header on selfhost (LAN threat
            # model trusts it). On cloud, refuse to build a poisonable link — the
            # response stays 204 so this never becomes a username oracle.
            if os.environ.get("SECRETS_PROVIDER", "env") == "env":
                base_url = str(request.base_url).rstrip("/")
            else:
                base_url = None
        if base_url:
            link = f"{base_url.rstrip('/')}/reset-password?token={token}"
            send_email(
                to=user["email"],
                subject="Reset your password",
                body=f"Use this link to reset your password (expires in 15 minutes):\n\n{link}",
            )
    # Always 204, whether or not the username/email exists — a different
    # response here would let an attacker enumerate valid usernames.


@router.post("/reset-password", status_code=204)
@limiter.limit("5/minute")
def reset_password(request: Request, response: Response, body: ResetPasswordBody):
    if is_local_auth_disabled():
        raise HTTPException(status_code=403, detail="Local authentication is disabled")
    import jwt

    try:
        username, token_version = decode_reset_token(body.token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link") from None

    user = get_user(username)
    if user is None or int(user.get("tokenVersion", 0)) != token_version:
        # Stale tokenVersion covers both "already used" (reset bumps it) and
        # "session revoked since this link was issued".
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    password_hash = bcrypt.hashpw(body.newPassword.encode(), bcrypt.gensalt(rounds=12)).decode()
    set_user_fields(username, {"passwordHash": password_hash}, bump_token_version=True)
