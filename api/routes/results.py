import math
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from ulid import ULID

from lib.achievements import compute_achievements
from lib.auth import AuthUser, require_auth, require_write
from lib.db.games import get_game, list_games
from lib.db.notifications import put_notification
from lib.db.results import delete_result, get_result, list_results, put_result
from lib.db.users import get_user
from lib.elo import leaders_before
from routes.photos import delete_session_photos

router = APIRouter()


class ResultPlayer(BaseModel):
    playerId: str
    playerName: str
    score: float | None = None
    seat: int | None = None
    variables: dict[str, str] | None = None

    @field_validator("playerId", "playerName")
    @classmethod
    def non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()

    @field_validator("score")
    @classmethod
    def score_finite(cls, v: float | None) -> float | None:
        # No range: game scores vary (Wingspan ~100, some games go negative)
        if v is not None and not math.isfinite(v):
            raise ValueError("score must be a finite number")
        return v


# Top-level fields stored only when set; explicit null on update clears them
OPTIONAL_RESULT_FIELDS = ("mood", "notes")
NOTES_MAX_LENGTH = 1000


def _clean_notes(v: str | None) -> str | None:
    # Blank notes are treated as absent, like an unset mood
    if v is None or not v.strip():
        return None
    v = v.strip()
    if len(v) > NOTES_MAX_LENGTH:
        raise ValueError(f"notes must be at most {NOTES_MAX_LENGTH} characters")
    return v


def _validate_player_config(game: dict, players: list[dict]) -> None:
    player_vars = game.get("playerVariables") or []
    track_turn_order = bool(game.get("trackTurnOrder"))

    if player_vars:
        expected_ids = {v["id"] for v in player_vars}
        options_by_id = {v["id"]: set(v["options"]) for v in player_vars}
        for p in players:
            given = p.get("variables") or {}
            if set(given.keys()) != expected_ids:
                raise HTTPException(
                    status_code=422,
                    detail=f"{p['playerName']}: variables must be set for {sorted(expected_ids)}",
                )
            for vid, value in given.items():
                if value not in options_by_id[vid]:
                    raise HTTPException(
                        status_code=422,
                        detail=f"{p['playerName']}: invalid value '{value}' for '{vid}'",
                    )
    else:
        for p in players:
            if p.get("variables"):
                raise HTTPException(
                    status_code=422,
                    detail=f"{p['playerName']}: variables are not configured for this game",
                )

    if track_turn_order:
        seats = [p["seat"] for p in players if p.get("seat") is not None]
        if len(seats) != len(players) or sorted(seats) != list(range(1, len(players) + 1)):
            raise HTTPException(
                status_code=422,
                detail="seat must be a 1..N permutation of all players",
            )
    else:
        for p in players:
            if p.get("seat") is not None:
                raise HTTPException(
                    status_code=422,
                    detail=f"{p['playerName']}: seat is not tracked for this game",
                )


class AddResultBody(BaseModel):
    gameId: str
    gameName: str
    date: str
    players: list[ResultPlayer]
    winnerId: str
    winnerName: str
    mood: int | None = None
    notes: str | None = None

    @field_validator("gameId", "gameName", "winnerId", "winnerName")
    @classmethod
    def non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()

    @field_validator("mood")
    @classmethod
    def mood_in_range(cls, v: int | None) -> int | None:
        if v is not None and not (1 <= v <= 5):
            raise ValueError("mood must be between 1 and 5")
        return v

    @field_validator("notes")
    @classmethod
    def notes_length(cls, v: str | None) -> str | None:
        return _clean_notes(v)

    @field_validator("date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        from datetime import date, timedelta

        try:
            parsed = date.fromisoformat(v)
        except ValueError:
            raise ValueError("must be YYYY-MM-DD format") from None
        # Server clock is UTC; users ahead of UTC (CET evenings) submit "their today"
        # which is UTC tomorrow — allow one day of slack.
        if parsed > date.today() + timedelta(days=1):
            raise ValueError("Cannot select a future date")
        return v


class UpdateResultBody(BaseModel):
    gameId: str | None = None
    date: str | None = None
    players: list[ResultPlayer] | None = None
    winnerId: str | None = None
    winnerName: str | None = None
    mood: int | None = None
    notes: str | None = None

    @field_validator("gameId", "winnerId", "winnerName")
    @classmethod
    def non_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("must not be empty")
        return v.strip() if v is not None else v

    @field_validator("date")
    @classmethod
    def valid_date(cls, v: str | None) -> str | None:
        from datetime import date, timedelta

        if v is None:
            return v
        try:
            parsed = date.fromisoformat(v)
        except ValueError:
            raise ValueError("must be YYYY-MM-DD format") from None
        if parsed > date.today() + timedelta(days=1):
            raise ValueError("Cannot select a future date")
        return v

    @field_validator("mood")
    @classmethod
    def mood_in_range(cls, v: int | None) -> int | None:
        if v is not None and not (1 <= v <= 5):
            raise ValueError("mood must be between 1 and 5")
        return v

    @field_validator("notes")
    @classmethod
    def notes_length(cls, v: str | None) -> str | None:
        return _clean_notes(v)


def detect_milestone(winner_id: str, winner_name: str, all_results: list) -> str | None:
    if not winner_id or not winner_name:
        return None

    player_results = sorted(
        [r for r in all_results if any(p["playerId"] == winner_id for p in r.get("players", []))],
        key=lambda r: r.get("date", ""),
    )

    streak = 0
    for r in reversed(player_results):
        if r.get("winnerId") == winner_id:
            streak += 1
        else:
            break

    prev_results = player_results[:-streak] if streak > 0 else player_results
    best_prev, current = 0, 0
    for r in prev_results:
        if r.get("winnerId") == winner_id:
            current += 1
            if current > best_prev:
                best_prev = current
        else:
            current = 0

    total_wins = sum(1 for r in player_results if r.get("winnerId") == winner_id)

    if total_wins == 1:
        return f"🎉 {winner_name} got their first win!"
    if streak == 3:
        return f"🔥 {winner_name} is on a 3-game win streak!"
    if streak == 5:
        return f"🔥 {winner_name} is on fire — 5 in a row!"
    if streak == 10:
        return f"👑 {winner_name} is unstoppable — 10-game win streak!"
    if streak > best_prev and streak > 2:
        return f"⚡ {winner_name} just broke their personal best streak!"

    return None


def _detect_new_achievements(
    players: list[ResultPlayer],
    before_results: list[dict],
    after_results: list[dict],
    result: dict,
) -> list[dict]:
    games_by_id = {g["pk"]: g for g in list_games()}
    before_leaders = leaders_before(before_results)
    after_leaders = leaders_before(after_results)
    new_achievements = []
    for player in players:
        before_ids = {
            a["id"]
            for a in compute_achievements(
                player.playerId, before_results, games_by_id, before_leaders
            )
            if a["earnedAt"] is not None
        }
        for a in compute_achievements(player.playerId, after_results, games_by_id, after_leaders):
            if a["earnedAt"] is None or a["id"] in before_ids:
                continue
            put_notification(
                {
                    "pk": str(ULID()),
                    "playerId": player.playerId,
                    "achievementId": a["id"],
                    "label": a["label"],
                    "icon": a["icon"],
                    "description": a["description"],
                    "gameId": result["gameId"],
                    "gameName": result["gameName"],
                    "resultId": result["pk"],
                    "createdAt": result["createdAt"],
                }
            )
            new_achievements.append(
                {
                    "playerId": player.playerId,
                    "playerName": player.playerName,
                    "id": a["id"],
                    "label": a["label"],
                    "icon": a["icon"],
                    "description": a["description"],
                }
            )
    return new_achievements


@router.get("")
def list_results_route(_: Annotated[AuthUser, Depends(require_auth)]):
    results = list_results()
    games_by_id = {g["pk"]: g for g in list_games()}
    enriched = []
    for r in results:
        game = games_by_id.get(r.get("gameId", ""))
        image_url = (game.get("imageUrl") if game else None) or r.get("gameImageUrl")
        if image_url:
            enriched.append({**r, "gameImageUrl": image_url})
        else:
            enriched.append(r)
    return enriched


@router.post("", status_code=201)
def create_result(body: AddResultBody, user: Annotated[AuthUser, Depends(require_write)]):
    player_ids = {p.playerId for p in body.players}
    if body.winnerId not in player_ids:
        raise HTTPException(status_code=422, detail="winnerId must be one of the submitted players")

    game = get_game(body.gameId)
    if not game:
        raise HTTPException(status_code=422, detail=f"Unknown game: {body.gameId}")

    for player in body.players:
        if not get_user(player.playerId):
            raise HTTPException(status_code=422, detail=f"Unknown player: {player.playerId}")

    body_dump = body.model_dump()
    _validate_player_config(game, body_dump["players"])
    for key in OPTIONAL_RESULT_FIELDS:
        if body_dump.get(key) is None:
            body_dump.pop(key, None)
    result = {
        "pk": str(ULID()),
        "createdAt": datetime.now(UTC).isoformat(),
        "createdBy": user.sub,
        **({"gameImageUrl": game["imageUrl"]} if game.get("imageUrl") else {}),
        **body_dump,
    }
    put_result(result)

    # list_results() is a full-table scan: accepted at current scale; revisit with a
    # player GSI if history grows. The scan is also eventually consistent, so the
    # result we just wrote may or may not already be included — exclude it by pk
    # (we know it) so before_results always reflects pre-write state, then append
    # it locally so milestone/achievement math sees the new result exactly once.
    before_results = [r for r in list_results() if r.get("pk") != result["pk"]]
    all_results = [*before_results, result]
    milestone = detect_milestone(body.winnerId, body.winnerName, all_results)
    new_achievements = _detect_new_achievements(body.players, before_results, all_results, result)
    return {**result, "milestone": milestone, "newAchievements": new_achievements}


@router.put("/{result_id}")
def update_result(
    result_id: str, body: UpdateResultBody, user: Annotated[AuthUser, Depends(require_write)]
):
    existing = get_result(result_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Result not found")
    if user.role != "admin" and existing.get("createdBy") != user.sub:
        raise HTTPException(status_code=403, detail="Forbidden")

    updated: dict[str, Any] = {**existing}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            if key not in OPTIONAL_RESULT_FIELDS:
                raise HTTPException(status_code=422, detail=f"{key} cannot be null")
            updated.pop(key, None)
        else:
            updated[key] = value

    player_ids = {p["playerId"] for p in updated["players"]}
    if updated["winnerId"] not in player_ids:
        raise HTTPException(status_code=422, detail="winnerId must be one of the submitted players")

    game: dict | None = None
    if body.gameId is not None:
        game = get_game(updated["gameId"])
        if not game:
            raise HTTPException(status_code=422, detail=f"Unknown game: {updated['gameId']}")
        updated["gameName"] = game.get("name", updated.get("gameName", ""))
        if game.get("imageUrl"):
            updated["gameImageUrl"] = game["imageUrl"]
        else:
            updated.pop("gameImageUrl", None)

    if body.players is not None:
        for player in updated["players"]:
            if not get_user(player["playerId"]):
                raise HTTPException(status_code=422, detail=f"Unknown player: {player['playerId']}")

    if body.players is not None or body.gameId is not None:
        if game is None:
            game = get_game(updated["gameId"])
        if not game:
            raise HTTPException(status_code=422, detail=f"Unknown game: {updated['gameId']}")
        _validate_player_config(game, updated["players"])

    # pk/createdAt come from `existing` and are never in the body — preserved.
    # NOTE: milestones are not recomputed on edit; they reflect logging-time state.
    put_result(updated)
    return updated


@router.delete("/{result_id}", status_code=204)
def delete_result_route(result_id: str, user: Annotated[AuthUser, Depends(require_write)]):
    existing = get_result(result_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Result not found")
    if user.role != "admin" and existing.get("createdBy") != user.sub:
        raise HTTPException(status_code=403, detail="Forbidden")
    # Photos first: if the cascade fails the result is still there and the
    # delete can be retried, rather than leaving orphaned photo rows behind.
    delete_session_photos(result_id)
    delete_result(result_id)
