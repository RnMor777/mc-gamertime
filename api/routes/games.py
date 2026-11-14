import os
import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any
from xml.etree.ElementTree import ParseError

import httpx
from defusedxml import DefusedXmlException
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from ulid import ULID

from lib.auth import AuthUser, require_admin, require_auth
from lib.bgg import BggNotFoundError, bgg_detail, bgg_search
from lib.db.games import (
    GameNotFoundError,
    add_favourite,
    delete_game,
    get_game,
    list_games,
    put_game,
    remove_favourite,
)
from lib.db.recs import list_recs
from lib.db.results import list_results
from lib.storage import EXT_BY_CONTENT_TYPE, build_upload_url, get_object_base_url, make_s3_client

router = APIRouter()

_s3 = make_s3_client()
_BUCKET = os.environ.get("S3_BUCKET", "")
_OBJECT_BASE_URL = get_object_base_url()


class UploadImageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = "image.bin"
    contentType: str = "application/octet-stream"


class PlayerVariableDefInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str
    options: list[str]

    @field_validator("label")
    @classmethod
    def label_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("label must not be empty")
        return v.strip()

    @field_validator("options")
    @classmethod
    def options_valid(cls, v: list[str]) -> list[str]:
        cleaned = [o.strip() for o in v]
        if len(cleaned) < 2:
            raise ValueError("must have at least 2 options")
        if any(not o for o in cleaned):
            raise ValueError("options must not be empty")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("options must be unique")
        return cleaned


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-+", "-", slug) or "var"


def _assign_variable_ids(variables: list[dict]) -> list[dict]:
    seen: dict[str, int] = {}
    result = []
    for v in variables:
        base = _slugify(v["label"])
        count = seen.get(base, 0)
        vid = base if count == 0 else f"{base}-{count + 1}"
        seen[base] = count + 1
        result.append({"id": vid, "label": v["label"], "options": v["options"]})
    return result


class AddGameBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    bggId: int | None = None
    description: str | None = None
    imageUrl: str | None = None
    minPlayers: int | None = None
    maxPlayers: int | None = None
    playTime: int | None = None
    weight: float | None = None
    yearPublished: int | None = None
    tags: list[str] = []
    playerVariables: list[PlayerVariableDefInput] = []
    trackTurnOrder: bool = False


class UpdateGameBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    bggId: int | None = None
    description: str | None = None
    imageUrl: str | None = None
    minPlayers: int | None = None
    maxPlayers: int | None = None
    playTime: int | None = None
    weight: float | None = None
    yearPublished: int | None = None
    tags: list[str] | None = None
    playerVariables: list[PlayerVariableDefInput] | None = None
    trackTurnOrder: bool | None = None


@router.get("")
def list_games_route(user: Annotated[AuthUser, Depends(require_auth)]):
    games = list_games()
    for game in games:
        favorites = game.pop("favorites", set())
        game["isFavorited"] = user.sub in favorites
    return games


@router.get("/search")
def search_games(
    _: Annotated[AuthUser, Depends(require_auth)],
    q: str | None = None,
    bggId: int | None = None,
):
    if bggId is not None:
        return _call_bgg(bgg_detail, bggId)
    if not q:
        raise HTTPException(status_code=400, detail="q or bggId required")
    return _call_bgg(bgg_search, q)


def _call_bgg(fn: Callable[[Any], Any], arg: Any) -> Any:
    # An upstream failure is a gateway error, not a bug in this app: say so
    # instead of letting it escape as a bare 500.
    try:
        return fn(arg)
    except BggNotFoundError:
        raise HTTPException(status_code=404, detail="Game not found on BoardGameGeek") from None
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="BoardGameGeek timed out") from None
    except (httpx.HTTPError, ParseError, DefusedXmlException, ValueError):
        # ValueError: a malformed number in an otherwise valid response.
        raise HTTPException(status_code=502, detail="BoardGameGeek is unavailable") from None


@router.post("/upload")
def upload_game_image(body: UploadImageBody, _: Annotated[AuthUser, Depends(require_admin)]):
    # Declared before /{game_id} routes to prevent path-param shadowing.
    if body.contentType not in EXT_BY_CONTENT_TYPE:
        raise HTTPException(status_code=422, detail="Unsupported content type")
    upload_url, image_url = build_upload_url(
        _s3, _BUCKET, _OBJECT_BASE_URL, "game-images", body.contentType
    )
    return {"uploadUrl": upload_url, "imageUrl": image_url}


@router.post("", status_code=201)
def create_game(body: AddGameBody, _: Annotated[AuthUser, Depends(require_admin)]):
    data = body.model_dump()
    data["playerVariables"] = _assign_variable_ids(data["playerVariables"])
    game = {
        "pk": str(ULID()),
        "createdAt": datetime.now(UTC).isoformat(),
        **data,
    }
    put_game(game)
    return game


@router.put("/{game_id}")
def update_game_route(
    game_id: str, body: UpdateGameBody, _: Annotated[AuthUser, Depends(require_admin)]
):
    existing = get_game(game_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Game not found")

    updates = body.model_dump(exclude_unset=True)
    if "playerVariables" in updates and updates["playerVariables"] is None:
        updates["playerVariables"] = []
    if body.playerVariables is not None:
        updates["playerVariables"] = _assign_variable_ids(updates["playerVariables"])

    updated = {**existing, **updates}
    put_game(updated)
    return {k: v for k, v in updated.items() if k != "favorites"}


@router.delete("/{game_id}", status_code=204)
def delete_game_route(game_id: str, _: Annotated[AuthUser, Depends(require_admin)]):
    if not get_game(game_id):
        raise HTTPException(status_code=404, detail="Game not found")

    # Block deletes that would orphan results (gameId) or recommendations (gamePk)
    result_refs = sum(1 for r in list_results() if r.get("gameId") == game_id)
    rec_refs = sum(1 for r in list_recs() if r.get("gamePk") == game_id)
    if result_refs or rec_refs:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: game is referenced by {result_refs} result(s) "
                f"and {rec_refs} recommendation(s). Delete those first."
            ),
        )
    delete_game(game_id)


@router.post("/{game_id}/favorite", status_code=204)
def add_game_favorite(game_id: str, user: Annotated[AuthUser, Depends(require_auth)]):
    try:
        add_favourite(game_id, user.sub)
    except GameNotFoundError:
        raise HTTPException(status_code=404, detail="Game not found") from None


@router.delete("/{game_id}/favorite", status_code=204)
def remove_game_favorite(game_id: str, user: Annotated[AuthUser, Depends(require_auth)]):
    try:
        remove_favourite(game_id, user.sub)
    except GameNotFoundError:
        raise HTTPException(status_code=404, detail="Game not found") from None
