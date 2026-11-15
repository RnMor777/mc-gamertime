import contextlib
import os
import re
from datetime import UTC, datetime
from io import BytesIO
from typing import Annotated, Literal

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image, ImageOps
from pydantic import BaseModel, Field, field_validator

from lib.auth import AuthUser, require_admin, require_auth, validate_password_length
from lib.db.libraries import (
    create_personal_library_for_user,
    delete_library,
    get_personal_library_for_user,
)
from lib.db.results import list_results
from lib.db.users import (
    delete_user,
    get_user,
    list_users,
    put_user,
    set_user_fields,
    update_avatar,
)
from lib.rate_limit import limiter
from lib.storage import avatar_url, get_object_base_url, make_s3_client

_s3 = make_s3_client()
_BUCKET = os.environ.get("S3_BUCKET", "")
_OBJECT_BASE_URL = get_object_base_url()

router = APIRouter()

_MAX_AVATAR_BYTES = 5 * 1024 * 1024


_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,32}$")


class CreateUserBody(BaseModel):
    username: str
    displayName: str
    password: str = Field(min_length=12)
    role: Literal["admin", "normal"]

    @field_validator("password")
    @classmethod
    def password_within_bcrypt_limit(cls, v: str) -> str:
        return validate_password_length(v)

    @field_validator("username")
    @classmethod
    def username_must_be_safe(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError(
                "username must be 3-32 characters, letters/numbers/underscore/hyphen only"
            )
        return v

    @field_validator("displayName")
    @classmethod
    def display_name_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


def _avatar_url(username: str, has_avatar: bool, updated_at: str | None = None) -> str | None:
    return avatar_url(username, has_avatar, updated_at)


@router.get("")
def list_users_route(_: Annotated[AuthUser, Depends(require_admin)]):
    items = list_users()
    return [
        {
            "username": item["pk"],
            "displayName": item["displayName"],
            "role": item["role"],
            "avatarUrl": avatar_url(
                item["pk"], bool(item.get("hasAvatar")), item.get("avatarUpdatedAt")
            ),
        }
        for item in items
    ]


@router.post("", status_code=201)
def create_user(body: CreateUserBody, _: Annotated[AuthUser, Depends(require_admin)]):
    if get_user(body.username):
        raise HTTPException(status_code=409, detail="Username already taken")

    personal_lib = create_personal_library_for_user(body.username, body.displayName)
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=12)).decode()
    user = {
        "pk": body.username,
        "displayName": body.displayName,
        "passwordHash": password_hash,
        "role": body.role,
        "personalLibraryId": personal_lib["id"],
        "createdAt": datetime.now(UTC).isoformat(),
    }
    put_user(user)
    return {
        "username": body.username,
        "displayName": body.displayName,
        "role": body.role,
        "personalLibraryId": personal_lib["id"],
    }


class UpdateUserBody(BaseModel):
    displayName: str | None = None
    role: Literal["admin", "normal"] | None = None
    password: str | None = None

    @field_validator("displayName")
    @classmethod
    def display_name_must_not_be_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("must not be empty")
        return v

    @field_validator("password")
    @classmethod
    def password_must_meet_length(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 12:
            raise ValueError("must be at least 12 characters")
        return validate_password_length(v)


@router.put("/{username}")
def update_user_route(
    username: str,
    body: UpdateUserBody,
    _: Annotated[AuthUser, Depends(require_admin)],
):
    user = get_user(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    fields: dict = {}
    if body.displayName is not None:
        fields["displayName"] = body.displayName
    if body.role is not None:
        fields["role"] = body.role
    if body.password is not None:
        fields["passwordHash"] = bcrypt.hashpw(
            body.password.encode(), bcrypt.gensalt(rounds=12)
        ).decode()

    set_user_fields(
        username, fields, bump_token_version=body.role is not None or body.password is not None
    )
    user.update(fields)
    return {
        "username": user["pk"],
        "displayName": user["displayName"],
        "role": user["role"],
        "avatarUrl": _avatar_url(
            user["pk"], bool(user.get("hasAvatar")), user.get("avatarUpdatedAt")
        ),
    }


@router.post("/{username}/avatar")
@limiter.limit("20/minute")
async def upload_avatar_route(
    username: str,
    request: Request,
    response: Response,
    user: Annotated[AuthUser, Depends(require_auth)],
):
    if user.sub != username and user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if not get_user(username):
        raise HTTPException(status_code=404, detail="User not found")

    # Reject an honest oversized upload before buffering it into Lambda memory;
    # the post-read len() check below is the authoritative (unspoofable) guard.
    declared = int(request.headers.get("content-length") or 0)
    if declared > _MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large (max {_MAX_AVATAR_BYTES // (1024 * 1024)} MB)",
        )

    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="No image provided")

    # Cap upload size before handing bytes to PIL (decompression-bomb defence;
    # PIL's default Image.MAX_IMAGE_PIXELS stays enabled as the second layer)
    if len(image_bytes) > _MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large (max {_MAX_AVATAR_BYTES // (1024 * 1024)} MB)",
        )

    try:
        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.fit(img, (256, 256))
        # Support transparency by using RGBA
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        buf = BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        png_bytes = buf.read()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid image") from None

    _s3.put_object(
        Bucket=_BUCKET,
        Key=f"avatars/{username}.png",
        Body=png_bytes,
        ContentType="image/png",
    )
    update_avatar(username, True)
    refreshed = get_user(username) or {}
    return {"avatarUrl": _avatar_url(username, True, refreshed.get("avatarUpdatedAt"))}


@router.delete("/{username}/avatar", status_code=204)
def delete_avatar_route(
    username: str,
    user: Annotated[AuthUser, Depends(require_auth)],
):
    if user.sub != username and user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if not get_user(username):
        raise HTTPException(status_code=404, detail="User not found")

    _s3.delete_object(Bucket=_BUCKET, Key=f"avatars/{username}.png")
    update_avatar(username, False)


@router.delete("/{username}", status_code=204)
def delete_user_route(
    username: str,
    user: Annotated[AuthUser, Depends(require_admin)],
):
    target = get_user(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if username == user.sub:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    if target["role"] == "admin":
        admin_count = sum(1 for u in list_users() if u["role"] == "admin")
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot delete the last admin")

    result_refs = sum(
        1
        for r in list_results()
        if r.get("winnerId") == username
        or any(p.get("playerId") == username for p in r.get("players", []))
    )
    if result_refs:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: user appears in {result_refs} result(s). Delete those first.",
        )

    personal_lib = get_personal_library_for_user(username)
    if personal_lib:
        delete_library(personal_lib["id"])

    delete_user(username)

    with contextlib.suppress(Exception):
        _s3.delete_object(Bucket=_BUCKET, Key=f"avatars/{username}.png")
