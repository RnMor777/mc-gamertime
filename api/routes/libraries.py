from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from ulid import ULID

from lib.auth import AuthUser, require_auth, require_write
from lib.db.games import delete_game, list_games
from lib.db.libraries import (
    PERSONAL_PREFIX,
    delete_library,
    ensure_personal_library,
    get_library,
    get_personal_library_ids_for_user,
    get_user_library_role,
    list_all_libraries,
    normalize_library_role,
    put_library,
)
from lib.db.recs import list_recs
from lib.db.results import list_results
from lib.db.users import get_user, list_users
from lib.storage import avatar_url

router = APIRouter()

LibraryRoleInput = Literal["owner", "editor", "readonly", "viewer"]


class CreateLibraryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 60):
            raise ValueError("Library name must be 1-60 characters")
        return v


class UpdateLibraryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 60):
            raise ValueError("Library name must be 1-60 characters")
        return v


class AddLibraryMemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    role: LibraryRoleInput


class UpdateLibraryMemberBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: LibraryRoleInput


def _format_library(
    lib: dict[str, Any],
    user: AuthUser,
    users_by_username: dict[str, dict[str, Any]],
    game_counts: dict[str, int],
) -> dict[str, Any]:
    lib_id = lib["id"]
    is_personal = bool(lib.get("isPersonal"))
    my_role = get_user_library_role(lib_id, user.sub, user.role, library=lib) or "readonly"
    members_out = []
    for m in lib.get("members", []):
        uname = m["username"]
        u_info = users_by_username.get(uname, {})
        members_out.append(
            {
                "username": uname,
                "displayName": u_info.get("displayName", uname),
                "avatarUrl": avatar_url(
                    uname, bool(u_info.get("hasAvatar")), u_info.get("avatarUpdatedAt")
                ),
                "role": normalize_library_role(m.get("role")),
            }
        )
    return {
        "id": lib_id,
        "name": lib["name"],
        "isPersonal": is_personal,
        "ownerId": lib["ownerId"],
        "myRole": my_role,
        "members": members_out,
        "gameCount": game_counts.get(lib_id, 0),
        "createdAt": lib.get("createdAt", ""),
    }


def _compute_game_counts(
    games: list[dict[str, Any]],
    current_username: str,
    personal_lib_id: str,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    personal_ids = get_personal_library_ids_for_user(current_username)
    for g in games:
        lib_id = g.get("libraryId")
        owner_id = g.get("ownerId")
        if lib_id in personal_ids or (lib_id is None and owner_id in (None, current_username)):
            counts[personal_lib_id] = counts.get(personal_lib_id, 0) + 1
        elif lib_id:
            counts[lib_id] = counts.get(lib_id, 0) + 1
    return counts


@router.get("")
def list_libraries_route(user: Annotated[AuthUser, Depends(require_auth)]):
    personal_lib_doc = ensure_personal_library(user.sub, user.displayName)
    users_by_username = {u["pk"]: u for u in list_users()}
    all_games = list_games()
    game_counts = _compute_game_counts(all_games, user.sub, personal_lib_doc["id"])

    personal_lib = _format_library(personal_lib_doc, user, users_by_username, game_counts)

    other_libs = [
        lib
        for lib in list_all_libraries()
        if lib["id"] != personal_lib_doc["id"]
        and not (lib.get("isPersonal") and lib.get("ownerId") == user.sub)
    ]
    accessible_other: list[dict[str, Any]] = []
    for lib in sorted(other_libs, key=lambda x: x.get("name", "").lower()):
        if lib.get("isPersonal") and user.role == "admin":
            # Don't clutter an admin's library switcher with every user's private unshared personal library
            member_names = {m.get("username") for m in lib.get("members", [])}
            if user.sub not in member_names:
                continue
        role = get_user_library_role(lib["id"], user.sub, user.role, library=lib)
        if role is not None:
            accessible_other.append(_format_library(lib, user, users_by_username, game_counts))

    return [personal_lib, *accessible_other]


@router.post("", status_code=201)
def create_library_route(
    body: CreateLibraryBody,
    user: Annotated[AuthUser, Depends(require_write)],
):
    lib_id = str(ULID())
    lib = {
        "id": lib_id,
        "name": body.name,
        "isPersonal": False,
        "ownerId": user.sub,
        "members": [{"username": user.sub, "role": "owner"}],
        "createdAt": datetime.now(UTC).isoformat(),
    }
    put_library(lib)
    users_by_username = {u["pk"]: u for u in list_users()}
    return _format_library(lib, user, users_by_username, {})


def _resolve_target_library(library_id: str) -> dict[str, Any] | None:
    if library_id.startswith(PERSONAL_PREFIX):
        owner = library_id.removeprefix(PERSONAL_PREFIX)
        return ensure_personal_library(owner) if get_user(owner) else None
    return get_library(library_id)


@router.put("/{library_id}")
def update_library_route(
    library_id: str,
    body: UpdateLibraryBody,
    user: Annotated[AuthUser, Depends(require_write)],
):
    lib = _resolve_target_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")

    role = get_user_library_role(lib["id"], user.sub, user.role, library=lib)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Forbidden")

    lib["name"] = body.name
    put_library(lib)
    personal_lib = ensure_personal_library(user.sub, user.displayName)
    users_by_username = {u["pk"]: u for u in list_users()}
    game_counts = _compute_game_counts(list_games(), user.sub, personal_lib["id"])
    return _format_library(lib, user, users_by_username, game_counts)


@router.delete("/{library_id}", status_code=204)
def delete_library_route(
    library_id: str,
    user: Annotated[AuthUser, Depends(require_write)],
):
    if library_id.startswith(PERSONAL_PREFIX):
        raise HTTPException(status_code=400, detail="Cannot delete personal library")
    lib = get_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")
    if lib.get("isPersonal"):
        raise HTTPException(status_code=400, detail="Cannot delete personal library")

    role = get_user_library_role(library_id, user.sub, user.role, library=lib)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Forbidden")

    lib_games = [g for g in list_games() if g.get("libraryId") == library_id]
    if lib_games:
        lib_game_ids = {g["pk"] for g in lib_games}
        result_refs = sum(1 for r in list_results() if r.get("gameId") in lib_game_ids)
        rec_refs = sum(1 for rec in list_recs() if rec.get("gamePk") in lib_game_ids)
        if result_refs or rec_refs:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot delete library: games are referenced by {result_refs} result(s) "
                    f"and {rec_refs} recommendation(s)."
                ),
            )
        for g in lib_games:
            delete_game(g["pk"])

    delete_library(library_id)


@router.post("/{library_id}/members")
def add_or_update_member_route(
    library_id: str,
    body: AddLibraryMemberBody,
    user: Annotated[AuthUser, Depends(require_write)],
):
    lib = _resolve_target_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")

    caller_role = get_user_library_role(lib["id"], user.sub, user.role, library=lib)
    if caller_role != "owner":
        raise HTTPException(status_code=403, detail="Forbidden")

    if not get_user(body.username):
        raise HTTPException(status_code=404, detail="User not found")

    normalized_role = normalize_library_role(body.role)
    members: list[dict[str, str]] = list(lib.get("members", []))
    existing_idx = next(
        (i for i, m in enumerate(members) if m["username"] == body.username),
        None,
    )
    if existing_idx is not None:
        new_members = list(members)
        new_members[existing_idx] = {"username": body.username, "role": normalized_role}
    else:
        new_members = [*members, {"username": body.username, "role": normalized_role}]

    owners = [m["username"] for m in new_members if m["role"] == "owner"]
    if not owners:
        raise HTTPException(status_code=400, detail="Library must have at least one owner")

    lib["members"] = new_members
    if not lib.get("isPersonal") and lib["ownerId"] not in owners:
        lib["ownerId"] = owners[0]
    put_library(lib)

    personal_lib = ensure_personal_library(user.sub, user.displayName)
    users_by_username = {u["pk"]: u for u in list_users()}
    game_counts = _compute_game_counts(list_games(), user.sub, personal_lib["id"])
    return _format_library(lib, user, users_by_username, game_counts)


@router.put("/{library_id}/members/{username}")
def update_member_role_route(
    library_id: str,
    username: str,
    body: UpdateLibraryMemberBody,
    user: Annotated[AuthUser, Depends(require_write)],
):
    lib = _resolve_target_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")

    caller_role = get_user_library_role(lib["id"], user.sub, user.role, library=lib)
    if caller_role != "owner":
        raise HTTPException(status_code=403, detail="Forbidden")

    normalized_role = normalize_library_role(body.role)
    members: list[dict[str, str]] = list(lib.get("members", []))
    idx = next((i for i, m in enumerate(members) if m["username"] == username), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Member not found")

    members[idx] = {"username": username, "role": normalized_role}
    owners = [m["username"] for m in members if m["role"] == "owner"]
    if not owners:
        raise HTTPException(status_code=400, detail="Library must have at least one owner")
    if lib.get("isPersonal") and lib.get("ownerId") not in owners:
        raise HTTPException(status_code=400, detail="Personal library owner must remain an owner")

    lib["members"] = members
    if not lib.get("isPersonal") and lib["ownerId"] not in owners:
        lib["ownerId"] = owners[0]
    put_library(lib)

    personal_lib = ensure_personal_library(user.sub, user.displayName)
    users_by_username = {u["pk"]: u for u in list_users()}
    game_counts = _compute_game_counts(list_games(), user.sub, personal_lib["id"])
    return _format_library(lib, user, users_by_username, game_counts)


@router.delete("/{library_id}/members/{username}", status_code=204)
def remove_member_route(
    library_id: str,
    username: str,
    user: Annotated[AuthUser, Depends(require_auth)],
):
    lib = _resolve_target_library(library_id)
    if not lib:
        raise HTTPException(status_code=404, detail="Library not found")

    caller_role = get_user_library_role(lib["id"], user.sub, user.role, library=lib)
    is_self_leave = user.sub == username
    if caller_role != "owner" and not is_self_leave:
        raise HTTPException(status_code=403, detail="Forbidden")

    members: list[dict[str, str]] = list(lib.get("members", []))
    if not any(m["username"] == username for m in members):
        raise HTTPException(status_code=404, detail="Member not found")

    remaining = [m for m in members if m["username"] != username]
    owners = [m["username"] for m in remaining if m["role"] == "owner"]
    if not owners or (lib.get("isPersonal") and lib.get("ownerId") not in owners):
        raise HTTPException(status_code=400, detail="Cannot remove the last owner of the library")

    lib["members"] = remaining
    if not lib.get("isPersonal") and lib["ownerId"] not in owners:
        lib["ownerId"] = owners[0]
    put_library(lib)
