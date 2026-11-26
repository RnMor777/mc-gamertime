from __future__ import annotations

from collections.abc import Iterator

from lib.results_helpers import get_winner_ids, is_guest_player

START_RATING = 1000.0
K = 32.0


def _ordered(results: list[dict]) -> list[dict]:
    return sorted(results, key=lambda r: (r["date"], r.get("createdAt", "")))


def _apply(ratings: dict[str, float], r: dict) -> None:
    """Winners duel each non-winner (1-0) and each co-winner (0.5-0.5) pairwise.

    Guests are excluded from ELO ratings. Unrated results are no-ops.
    """
    player_ids = [
        p["playerId"] for p in r.get("players", []) if p.get("playerId") and not is_guest_player(p)
    ]
    winner_ids = [wid for wid in get_winner_ids(r) if wid in player_ids]
    if not winner_ids or len(player_ids) < 2:
        return

    for pid in player_ids:
        ratings.setdefault(pid, START_RATING)

    winner_set = set(winner_ids)
    losers = [pid for pid in player_ids if pid not in winner_set]
    k_per_duel = K / (len(player_ids) - 1)
    pre = dict(ratings)

    # Winners vs losers (1.0 vs 0.0)
    for w in winner_ids:
        for opp in losers:
            expected = 1 / (1 + 10 ** ((pre[opp] - pre[w]) / 400))
            delta = k_per_duel * (1 - expected)
            ratings[opp] -= delta
            ratings[w] += delta

    # Co-winners vs each other (0.5 vs 0.5)
    for i in range(len(winner_ids)):
        for j in range(i + 1, len(winner_ids)):
            w1, w2 = winner_ids[i], winner_ids[j]
            expected = 1 / (1 + 10 ** ((pre[w2] - pre[w1]) / 400))
            delta = k_per_duel * (0.5 - expected)
            ratings[w1] += delta
            ratings[w2] -= delta


def iter_elo(results: list[dict]) -> Iterator[tuple[dict, dict[str, float]]]:
    """Yield (result, ratings before it) in replay order, for every result.

    The snapshot is taken before this result's participants are seeded, so it
    only holds players with at least one previously rated game."""
    ratings: dict[str, float] = {}
    for r in _ordered(results):
        yield r, dict(ratings)
        _apply(ratings, r)


def compute_elo(results: list[dict]) -> dict[str, int]:
    """Replay results chronologically; winner duels each other participant pairwise."""
    ratings: dict[str, float] = {}
    for r in _ordered(results):
        _apply(ratings, r)
    return {pid: round(rating) for pid, rating in ratings.items()}


def leaders_before(results: list[dict]) -> dict[str, str | None]:
    """Result pk -> the sole #1 (by rounded rating, as the leaderboard shows it)
    going into that result; None when nobody is rated yet or the top is tied."""
    leaders: dict[str, str | None] = {}
    for r, snapshot in iter_elo(results):
        pk = r.get("pk")
        if not pk:
            continue
        rounded = {pid: round(v) for pid, v in snapshot.items()}
        if not rounded:
            leaders[pk] = None
            continue
        top = max(rounded.values())
        at_top = [pid for pid, v in rounded.items() if v == top]
        leaders[pk] = at_top[0] if len(at_top) == 1 else None
    return leaders
