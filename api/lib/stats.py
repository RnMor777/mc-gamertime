from __future__ import annotations

from typing import Any

from lib.elo import compute_elo
from lib.results_helpers import get_winner_ids, is_guest_player


def _compute_variable_stats(game: dict, results: list[dict]) -> dict:
    player_vars = game.get("playerVariables") or []
    if not player_vars:
        return {}

    total_plays = len(results)
    stats: dict[str, dict] = {}
    for var in player_vars:
        vid, label, options = var["id"], var["label"], var["options"]
        counts: dict[str, dict[str, Any]] = {
            opt: {"picks": 0, "wins": 0, "scores": []} for opt in options
        }
        for r in results:
            winner_ids = set(get_winner_ids(r))
            for p in r["players"]:
                value = (p.get("variables") or {}).get(vid)
                if value not in counts:
                    continue
                counts[value]["picks"] += 1
                if p.get("playerId") in winner_ids:
                    counts[value]["wins"] += 1
                if p.get("score") is not None:
                    counts[value]["scores"].append(p["score"])

        breakdown = [
            {
                "value": opt,
                "picks": c["picks"],
                "wins": c["wins"],
                "pickRate": c["picks"] / total_plays if total_plays else 0.0,
                "winRate": c["wins"] / c["picks"] if c["picks"] else 0.0,
                "avgScore": (float(sum(c["scores"])) / len(c["scores"])) if c["scores"] else None,
            }
            for opt, c in counts.items()
        ]
        stats[vid] = {"label": label, "breakdown": breakdown}
    return stats


def _compute_seat_stats(game: dict, results: list[dict]) -> list[dict]:
    if not game.get("trackTurnOrder"):
        return []

    seat_counts: dict[int, dict] = {}
    for r in results:
        winner_ids = set(get_winner_ids(r))
        for p in r["players"]:
            seat = p.get("seat")
            if seat is None:
                continue
            if seat not in seat_counts:
                seat_counts[seat] = {"plays": 0, "wins": 0}
            seat_counts[seat]["plays"] += 1
            if p.get("playerId") in winner_ids:
                seat_counts[seat]["wins"] += 1

    return [
        {
            "seat": seat,
            "plays": c["plays"],
            "wins": c["wins"],
            "winRate": c["wins"] / c["plays"] if c["plays"] else 0.0,
        }
        for seat, c in sorted(seat_counts.items())
    ]


def compute_stats(results: list[dict], games: list[dict] | None = None) -> dict:
    games = games or []
    games_by_id = {g["pk"]: g for g in games}
    # ── leaderboard ────────────────────────────────────────────────────────────
    player_map: dict[str, dict] = {}
    for r in results:
        for p in r["players"]:
            if is_guest_player(p):
                continue
            pid = p.get("playerId")
            if not pid:
                continue
            if pid not in player_map:
                player_map[pid] = {"name": p["playerName"], "wins": 0, "played": 0}
            player_map[pid]["played"] += 1
        for wid in get_winner_ids(r):
            if wid in player_map:
                player_map[wid]["wins"] += 1

    elo = compute_elo(results)

    leaderboard: list[dict[str, Any]] = [
        {
            "playerId": pid,
            "name": data["name"],
            "wins": data["wins"],
            "played": data["played"],
            "winRate": data["wins"] / data["played"] if data["played"] > 0 else 0,
            "rating": elo.get(pid, 1000),
        }
        for pid, data in player_map.items()
    ]
    leaderboard.sort(key=lambda e: (-e["rating"], -e["wins"], -e["winRate"]))

    # ── head-to-head ───────────────────────────────────────────────────────────
    h2h_map: dict[str, dict] = {}
    for r in results:
        players = r["players"]
        winner_ids = set(get_winner_ids(r))
        for i in range(len(players)):
            for j in range(i + 1, len(players)):
                a, b = players[i], players[j]
                if is_guest_player(a) or is_guest_player(b):
                    continue
                if not a.get("playerId") or not b.get("playerId"):
                    continue
                p1, p2 = (a, b) if a["playerId"] < b["playerId"] else (b, a)
                key = f"{p1['playerId']}|{p2['playerId']}"
                if key not in h2h_map:
                    h2h_map[key] = {
                        "p1Id": p1["playerId"],
                        "p1Name": p1["playerName"],
                        "p2Id": p2["playerId"],
                        "p2Name": p2["playerName"],
                        "p1Wins": 0,
                        "p2Wins": 0,
                    }
                p1_won = p1["playerId"] in winner_ids
                p2_won = p2["playerId"] in winner_ids
                if p1_won and not p2_won:
                    h2h_map[key]["p1Wins"] += 1
                elif p2_won and not p1_won:
                    h2h_map[key]["p2Wins"] += 1

    head_to_head = list(h2h_map.values())

    # ── streaks ────────────────────────────────────────────────────────────────
    sorted_results = sorted(results, key=lambda r: r["date"])
    streak_map: dict[str, dict] = {}
    for r in sorted_results:
        for p in r["players"]:
            if is_guest_player(p):
                continue
            pid = p.get("playerId")
            if not pid:
                continue
            if pid not in streak_map:
                streak_map[pid] = {"name": p["playerName"], "current": 0, "best": 0}

    for r in sorted_results:
        participant_ids = {
            p["playerId"] for p in r["players"] if p.get("playerId") and not is_guest_player(p)
        }
        winner_ids = set(get_winner_ids(r))
        for pid, entry in streak_map.items():
            if pid not in participant_ids:
                continue
            if pid in winner_ids:
                entry["current"] += 1
                if entry["current"] > entry["best"]:
                    entry["best"] = entry["current"]
            else:
                entry["current"] = 0

    streaks = [
        {"playerId": pid, "name": data["name"], "current": data["current"], "best": data["best"]}
        for pid, data in streak_map.items()
    ]

    # ── mostPlayed ─────────────────────────────────────────────────────────────
    game_count: dict[str, dict] = {}
    for r in results:
        gid = r["gameId"]
        if gid not in game_count:
            game_count[gid] = {"gameName": r["gameName"], "count": 0}
        game_count[gid]["count"] += 1

    most_played = None
    for gid, data in game_count.items():
        if most_played is None or data["count"] > most_played["count"]:
            most_played = {"gameId": gid, "gameName": data["gameName"], "count": data["count"]}

    # ── perMonth ───────────────────────────────────────────────────────────────
    month_map: dict[str, int] = {}
    for r in results:
        month = r["date"][:7]
        month_map[month] = month_map.get(month, 0) + 1

    per_month = sorted(
        [{"month": m, "count": c} for m, c in month_map.items()],
        key=lambda x: x["month"],
    )

    # ── gameStats ─────────────────────────────────────────────────────────────
    game_stats_map: dict[str, dict] = {}
    for r in results:
        gid = r["gameId"]
        if gid not in game_stats_map:
            game_stats_map[gid] = {
                "gameName": r["gameName"],
                "totalPlays": 0,
                "playerMap": {},
                "results": [],
            }
        game_stats_map[gid]["totalPlays"] += 1
        game_stats_map[gid]["results"].append(r)
        for p in r["players"]:
            if is_guest_player(p):
                continue
            pid = p.get("playerId")
            if not pid:
                continue
            pm = game_stats_map[gid]["playerMap"]
            if pid not in pm:
                pm[pid] = {"name": p["playerName"], "wins": 0, "played": 0}
            pm[pid]["played"] += 1
        for wid in get_winner_ids(r):
            if wid in game_stats_map[gid]["playerMap"]:
                game_stats_map[gid]["playerMap"][wid]["wins"] += 1

    game_stats: list[dict[str, Any]] = []
    for gid, gs in game_stats_map.items():
        breakdown = [
            {
                "playerId": pid,
                "name": data["name"],
                "wins": data["wins"],
                "played": data["played"],
                "winRate": data["wins"] / data["played"] if data["played"] > 0 else 0.0,
            }
            for pid, data in gs["playerMap"].items()
        ]
        breakdown.sort(key=lambda e: (-e["wins"], -e["winRate"]))
        eligible = [p for p in breakdown if p["played"] >= 2]
        dominant = (
            max(eligible, key=lambda p: p["winRate"])
            if eligible
            else (breakdown[0] if breakdown else None)
        )
        if not dominant:
            continue
        game = games_by_id.get(gid, {})
        game_stats.append(
            {
                "gameId": gid,
                "gameName": gs["gameName"],
                "totalPlays": gs["totalPlays"],
                "dominantPlayer": {
                    "playerId": dominant["playerId"],
                    "name": dominant["name"],
                    "wins": dominant["wins"],
                    "winRate": dominant["winRate"],
                },
                "playerBreakdown": breakdown,
                "variableStats": _compute_variable_stats(game, gs["results"]),
                "seatStats": _compute_seat_stats(game, gs["results"]),
            }
        )
    game_stats.sort(key=lambda g: -g["totalPlays"])

    return {
        "leaderboard": leaderboard,
        "headToHead": head_to_head,
        "streaks": streaks,
        "mostPlayed": most_played,
        "perMonth": per_month,
        "gameStats": game_stats,
    }
