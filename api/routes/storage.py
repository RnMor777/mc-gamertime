import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from lib.auth import AuthUser, require_auth
from lib.storage import EXT_BY_CONTENT_TYPE, make_s3_client

router = APIRouter()

_BUCKET = os.environ.get("S3_BUCKET", "")

# botocore is absent from the selfhost image (api/requirements-selfhost.txt);
# LocalFsClient raises FileNotFoundError for a missing key instead.
try:
    from botocore.exceptions import ClientError

    _NOT_FOUND_ERRORS: tuple[type[Exception], ...] = (ClientError, FileNotFoundError)
except ImportError:  # pragma: no cover - only true inside the selfhost image
    _NOT_FOUND_ERRORS = (FileNotFoundError,)

# GET/PUT are scoped to "content all logged-in users may read/write here". This
# must NOT include "exports/" - scripts/export-tables.py writes full table dumps
# (incl. boardsite-users: usernames, roles, bcrypt hashes) to the same bucket,
# and this route only requires require_auth (not require_admin). Matches the
# only keys the app ever writes here: "avatars/{username}.png" (routes/users.py),
# "blog-images/{ulid}.{ext}" (routes/posts.py), and "game-images/{ulid}.{ext}"
# (routes/games.py).
_ALLOWED_PREFIXES = ("avatars/", "blog-images/", "game-images/", "game-rulebooks/")

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _reject_path_traversal(path: str) -> None:
    if ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")


def _authorize_write(path: str, user: AuthUser) -> None:
    if path.startswith("avatars/"):
        owner = path.removeprefix("avatars/").removesuffix(".png")
        if user.sub != owner and user.role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    # blog-images/* and game-images/* are admin-authored (posts, games)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")


def _stream_object(path: str) -> StreamingResponse:
    _reject_path_traversal(path)
    if not path.startswith(_ALLOWED_PREFIXES):
        raise HTTPException(status_code=404, detail="Not found")

    s3 = make_s3_client()
    try:
        obj = s3.get_object(Bucket=_BUCKET, Key=path)
    except _NOT_FOUND_ERRORS:
        raise HTTPException(status_code=404, detail="Not found") from None

    return StreamingResponse(
        obj["Body"].iter_chunks(),
        media_type=obj.get("ContentType", "application/octet-stream"),
        # "private" keeps this out of CloudFront and any other shared cache —
        # an authenticated response must never be reusable for a different
        # viewer. The max-age applies only to the requesting user's own browser,
        # which is what stops a page full of avatars re-invoking Lambda on every
        # navigation. Avatar URLs carry a ?v= stamp (lib/storage.avatar_url) so
        # a replaced picture is fetched immediately rather than after expiry.
        headers={"Cache-Control": "private, max-age=1200"},
    )


@router.get("/{path:path}")
def get_object(path: str, _: Annotated[AuthUser, Depends(require_auth)]):
    return _stream_object(path)


# Same objects, addressed the way the app links to them: /avatars/alice.png
# rather than /storage/avatars/alice.png. On the cloud deployment CloudFront
# routes exactly these three prefixes to the API instead of reading them
# straight out of S3, so uploaded media requires a session there too.
media_router = APIRouter()


@media_router.get("/{filename}")
def get_media(request: Request, filename: str, _: Annotated[AuthUser, Depends(require_auth)]):
    prefix = request.url.path.lstrip("/").split("/", 1)[0]
    return _stream_object(f"{prefix}/{filename}")


@router.put("/{path:path}")
async def put_object(path: str, request: Request, user: Annotated[AuthUser, Depends(require_auth)]):
    _reject_path_traversal(path)
    if not path.startswith(_ALLOWED_PREFIXES):
        raise HTTPException(status_code=403, detail="Forbidden")
    _authorize_write(path, user)

    content_type = request.headers.get("content-type", "")
    if content_type not in EXT_BY_CONTENT_TYPE:
        raise HTTPException(status_code=415, detail="Unsupported content type")

    # Reject an honest oversized upload before buffering it into Lambda memory.
    # Content-Length is spoofable, so the post-read len() check below stays as the
    # authoritative guard.
    declared = int(request.headers.get("content-length") or 0)
    if declared > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )

    body = await request.body()
    if len(body) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )

    s3 = make_s3_client()
    s3.put_object(Bucket=_BUCKET, Key=path, Body=body, ContentType=content_type)
    return {"key": path}
