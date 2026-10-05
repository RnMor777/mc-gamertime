import os
import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from ulid import ULID

from lib.auth import AuthUser, require_admin, require_auth
from lib.bgg import bgg_detail, bgg_search
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


class UploadRulebookBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = "rules.pdf"
    contentType: str = "application/pdf"


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
    description: str | None = None
    bggId: int | None = None
    imageUrl: str | None = None
    minPlayers: int | None = None
    maxPlayers: int | None = None
    playTime: int | None = None
    weight: float | None = None
    yearPublished: int | None = None
    tags: list[str] = []
    playerVariables: list[PlayerVariableDefInput] = []
    trackTurnOrder: bool = False
    rulebooks: list[dict] = []


class UpdateGameBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    description: str | None = None
    bggId: int | None = None
    imageUrl: str | None = None
    minPlayers: int | None = None
    maxPlayers: int | None = None
    playTime: int | None = None
    weight: float | None = None
    yearPublished: int | None = None
    tags: list[str] | None = None
    playerVariables: list[PlayerVariableDefInput] | None = None
    trackTurnOrder: bool | None = None
    rulebooks: list[dict] | None = None


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
        return bgg_detail(bggId)
    if not q:
        raise HTTPException(status_code=400, detail="q or bggId required")
    return bgg_search(q)


@router.get("/{game_id}")
def get_game_route(game_id: str, user: Annotated[AuthUser, Depends(require_auth)]):
    game = get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    favorites = game.pop("favorites", set())
    game["isFavorited"] = user.sub in favorites
    return game


@router.post("/upload")
def upload_game_image(body: UploadImageBody, _: Annotated[AuthUser, Depends(require_admin)]):
    # Declared before /{game_id} routes to prevent path-param shadowing.
    if body.contentType not in EXT_BY_CONTENT_TYPE:
        raise HTTPException(status_code=422, detail="Unsupported content type")
    upload_url, image_url = build_upload_url(
        _s3, _BUCKET, _OBJECT_BASE_URL, "game-images", body.contentType
    )
    return {"uploadUrl": upload_url, "imageUrl": image_url}


@router.post("/{game_id}/rulebooks/upload")
def upload_game_rulebook(
    game_id: str,
    body: UploadRulebookBody,
    _: Annotated[AuthUser, Depends(require_admin)],
):
    if not get_game(game_id):
        raise HTTPException(status_code=404, detail="Game not found")
    if body.contentType not in {"application/pdf"}:
        raise HTTPException(status_code=422, detail="Only PDF rule books are supported")
    upload_url, rulebook_url = build_upload_url(
        _s3, _BUCKET, _OBJECT_BASE_URL, "game-rulebooks", body.contentType
    )
    return {"uploadUrl": upload_url, "rulebookUrl": rulebook_url}


@router.post("", status_code=201)
def create_game(body: AddGameBody, _: Annotated[AuthUser, Depends(require_admin)]):
    data = body.model_dump()
    if data.get("description") is not None:
        description = data["description"].strip()
        data["description"] = description or None
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
    if "description" in updates and updates["description"] is not None:
        updates["description"] = updates["description"].strip() or None
    if "playerVariables" in updates and updates["playerVariables"] is None:
        updates["playerVariables"] = []
    if body.playerVariables is not None:
        updates["playerVariables"] = _assign_variable_ids(updates["playerVariables"])
    if "rulebooks" in updates and updates["rulebooks"] is None:
        updates["rulebooks"] = []

    updated = {**existing, **updates}
    put_game(updated)
    return {k: v for k, v in updated.items() if k != "favorites"}


@router.delete("/{game_id}", status_code=204)
def delete_game_route(game_id: str, _: Annotated[AuthUser, Depends(require_admin)]):
    if not get_game(game_id):
        raise HTTPException(status_code=404, detail="Game not found")

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
