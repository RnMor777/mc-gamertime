from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ulid import ULID

import lib.db.base as _db
from lib.db.base import paginated_scan
from lib.db.users import get_user, set_user_fields

_PREFIX = "library#"
PERSONAL_PREFIX = "personal:"


def normalize_library_role(role: str | None) -> str:
    if role == "viewer":
        return "readonly"
    return role or "readonly"


def get_library(library_id: str) -> dict[str, Any] | None:
    if library_id.startswith(PERSONAL_PREFIX):
        owner = library_id.removeprefix(PERSONAL_PREFIX)
        return get_personal_library_for_user(owner)
    pk = f"{_PREFIX}{library_id}"
    return _db.tables["settings"].get_item(Key={"pk": pk}).get("Item")


def list_all_libraries() -> list[dict[str, Any]]:
    items = paginated_scan(_db.tables["settings"])
    return [item for item in items if str(item.get("pk", "")).startswith(_PREFIX)]


def list_family_libraries() -> list[dict[str, Any]]:
    return [lib for lib in list_all_libraries() if not lib.get("isPersonal")]


def put_library(item: dict[str, Any]) -> None:
    lib_id = item["id"]
    record = {**item, "pk": f"{_PREFIX}{lib_id}"}
    _db.tables["settings"].put_item(Item=_db._floats_to_decimal(record))


def delete_library(library_id: str) -> None:
    pk = f"{_PREFIX}{library_id}"
    _db.tables["settings"].delete_item(Key={"pk": pk})


def get_personal_library_for_user(username: str) -> dict[str, Any] | None:
    user = get_user(username)
    if user and user.get("personalLibraryId"):
        lib_id = str(user["personalLibraryId"])
        pk = f"{_PREFIX}{lib_id}"
        existing = _db.tables["settings"].get_item(Key={"pk": pk}).get("Item")
        if existing:
            return existing

    for lib in list_all_libraries():
        if lib.get("isPersonal") and lib.get("ownerId") == username:
            return lib
    return None


def create_personal_library_for_user(
    username: str, display_name: str | None = None
) -> dict[str, Any]:
    """Create a new uniquely-ID'd personal library scoped to `username` as owner."""
    lib_id = str(ULID())
    label = (display_name or username).strip() or username
    lib: dict[str, Any] = {
        "id": lib_id,
        "name": f"{label}'s Library",
        "isPersonal": True,
        "ownerId": username,
        "members": [{"username": username, "role": "owner"}],
        "createdAt": datetime.now(UTC).isoformat(),
    }
    put_library(lib)
    return lib


def ensure_personal_library(username: str, display_name: str | None = None) -> dict[str, Any]:
    """Return the user's personal library, creating a unique one if none exists yet."""
    existing = get_personal_library_for_user(username)
    if existing is not None:
        return existing
    user = get_user(username)
    resolved_name = display_name or (user.get("displayName") if user else None) or username
    created = create_personal_library_for_user(username, str(resolved_name))
    if user is not None:
        set_user_fields(username, {"personalLibraryId": created["id"]})
    return created


def is_personal_library(library_id: str, library: dict[str, Any] | None = None) -> bool:
    if library_id.startswith(PERSONAL_PREFIX):
        return True
    lib = library if library is not None else get_library(library_id)
    return bool(lib and lib.get("isPersonal"))


def resolve_library_id(
    library_id: str | None, username: str, display_name: str | None = None
) -> str:
    """Resolve None or 'personal:<user>' alias to the user's unique personal library ID."""
    if not library_id:
        return ensure_personal_library(username, display_name)["id"]
    if library_id.startswith(PERSONAL_PREFIX):
        target_user = library_id.removeprefix(PERSONAL_PREFIX)
        return ensure_personal_library(target_user)["id"]
    return library_id


def get_user_library_role(
    library_id: str,
    username: str,
    app_role: str,
    library: dict[str, Any] | None = None,
) -> str | None:
    """Return the user's effective role ('owner', 'editor', 'readonly') in a library, or None if no access."""
    if library_id.startswith(PERSONAL_PREFIX):
        owner = library_id.removeprefix(PERSONAL_PREFIX)
        if username == owner or app_role == "admin":
            return "owner"
        return None

    lib = library if library is not None else get_library(library_id)
    if not lib:
        return None

    if lib.get("isPersonal"):
        if lib.get("ownerId") == username or app_role == "admin":
            return "owner"
        return None

    member_role: str | None = None
    for m in lib.get("members", []):
        if m.get("username") == username:
            member_role = normalize_library_role(m.get("role"))
            break

    if member_role is None and lib.get("ownerId") == username:
        member_role = "owner"

    if app_role == "admin":
        return "owner"

    return member_role
