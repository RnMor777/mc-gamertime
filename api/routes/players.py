from typing import Annotated, Any

from fastapi import APIRouter, Depends

import lib.seasons as seasons_lib
from lib.achievements import compute_achievements
from lib.auth import AuthUser, require_auth
from lib.db.games import list_games
from lib.db.results import list_results
from lib.db.users import list_users
from lib.results_helpers import get_winner_ids
from lib.storage import avatar_url, get_object_base_url

router = APIRouter()

_OBJECT_BASE_URL = get_object_base_url()


@router.get("")
def list_players(_: Annotated[AuthUser, Depends(require_auth)]):
    items = list_users()
    return [
        {
            "pk": item["pk"],
            "displayName": item["displayName"],
            "avatarUrl": avatar_url(
                item["pk"], bool(item.get("hasAvatar")), item.get("avatarUpdatedAt")
            ),
        }
        for item in items
    ]


@router.get("/{player_id}/stats")
def get_player_stats(player_id: str, _: Annotated[AuthUser, Depends(require_auth)]):
    results = list_results()

    player_results = sorted(
        [r for r in results if any(p.get("playerId") == player_id for p in r["players"])],
        key=lambda r: r["date"],
    )

    game_map: dict[str, dict] = {}
    for r in player_results:
        gid = r["gameId"]
        if gid not in game_map:
            game_map[gid] = {"gameName": r["gameName"], "wins": 0, "played": 0}
        game_map[gid]["played"] += 1
        if player_id in get_winner_ids(r):
            game_map[gid]["wins"] += 1

    per_game_rows: list[dict[str, Any]] = [
        {
            "gameId": gid,
            "gameName": d["gameName"],
            "wins": d["wins"],
            "played": d["played"],
            "winRate": d["wins"] / d["played"] if d["played"] > 0 else 0.0,
        }
        for gid, d in game_map.items()
    ]
    per_game_stats = sorted(per_game_rows, key=lambda g: -g["played"])

    month_map: dict[str, dict] = {}
    for r in player_results:
        month = r["date"][:7]
        if month not in month_map:
            month_map[month] = {"wins": 0, "played": 0}
        month_map[month]["played"] += 1
        if player_id in get_winner_ids(r):
            month_map[month]["wins"] += 1

    win_rate_trend = sorted(
        [
            {
                "month": month,
                "wins": d["wins"],
                "played": d["played"],
                "winRate": d["wins"] / d["played"] if d["played"] > 0 else 0.0,
            }
            for month, d in month_map.items()
        ],
        key=lambda x: x["month"],
    )

    games_by_id = {g["pk"]: g for g in list_games()}

    return {
        "achievements": compute_achievements(player_id, results, games_by_id),
        "perGameStats": per_game_stats,
        "winRateTrend": win_rate_trend,
        "seasonTitles": seasons_lib.player_season_titles(
            results, player_id, seasons_lib.today_utc()
        ),
    }
