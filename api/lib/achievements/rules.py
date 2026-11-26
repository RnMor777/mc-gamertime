from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from lib.results_helpers import get_winner_ids

if TYPE_CHECKING:
    from .engine import AchievementContext

Predicate = Callable[["AchievementContext", dict], bool]
Evaluate = Callable[["AchievementContext", list[dict]], "str | None"]


def is_win(ctx: AchievementContext, result: dict) -> bool:
    return ctx.player_id in get_winner_ids(result)


def beat_the_leader(ctx: AchievementContext, result: dict) -> bool:
    """Won a game in which the sole #1 ELO player (going in) played and lost."""
    if not is_win(ctx, result):
        return False
    leader = ctx.leader_before.get(result.get("pk", ""))
    if leader is None or leader == ctx.player_id or leader in get_winner_ids(result):
        return False
    return any(p.get("playerId") == leader for p in result["players"])


def game_weight_at_least(weight: float) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        game_weight = ctx.game(result).get("weight")
        return game_weight is not None and float(game_weight) >= weight

    return pred


def game_play_time_at_least(minutes: int) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        play_time = ctx.game(result).get("playTime")
        return play_time is not None and int(play_time) >= minutes

    return pred


def player_count_at_least(n: int) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        return len(result["players"]) >= n

    return pred


def game_has_tag(tag: str) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        game = ctx.game(result)
        items = list(game.get("categories") or []) + list(game.get("tags") or [])
        target = tag.lower()
        return any(target == t.lower() or target in t.lower() for t in items)

    return pred


def game_name_is(name: str) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        return result.get("gameName", "").lower() == name.lower()

    return pred


def variable_equals(label: str, value: str) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        entry = ctx.my_entry(result)
        if entry is None:
            return False
        var_def = next(
            (
                v
                for v in ctx.game(result).get("playerVariables", [])
                if v["label"].lower() == label.lower()
            ),
            None,
        )
        if var_def is None:
            return False
        return (entry.get("variables") or {}).get(var_def["id"]) == value

    return pred


def all_of(*predicates: Predicate) -> Predicate:
    def pred(ctx: AchievementContext, result: dict) -> bool:
        return all(p(ctx, result) for p in predicates)

    return pred


def counter_threshold(predicate: Predicate, threshold: int) -> Evaluate:
    """Earned when the running count of matching results reaches threshold."""

    def evaluate(ctx: AchievementContext, player_results: list[dict]) -> str | None:
        count = 0
        for r in player_results:
            if predicate(ctx, r):
                count += 1
                if count == threshold:
                    return r["date"]
        return None

    return evaluate


def streak_threshold(predicate: Predicate, length: int) -> Evaluate:
    """Earned when a consecutive run of matching results first reaches length."""

    def evaluate(ctx: AchievementContext, player_results: list[dict]) -> str | None:
        streak = 0
        for r in player_results:
            if predicate(ctx, r):
                streak += 1
                if streak >= length:
                    return r["date"]
            else:
                streak = 0
        return None

    return evaluate


def distinct_count_threshold(
    key_fn: Callable[[AchievementContext, dict], object],
    threshold: int,
    predicate: Predicate | None = None,
) -> Evaluate:
    """Earned when the running set of distinct key_fn(ctx, result) values reaches threshold.
    With `predicate`, only matching results contribute a key."""

    def evaluate(ctx: AchievementContext, player_results: list[dict]) -> str | None:
        seen = set()
        for r in player_results:
            if predicate is not None and not predicate(ctx, r):
                continue
            seen.add(key_fn(ctx, r))
            if len(seen) == threshold:
                return r["date"]
        return None

    return evaluate


def per_key_counter_threshold(
    predicate: Predicate,
    key_fn: Callable[[AchievementContext, dict], object],
    threshold: int,
) -> Evaluate:
    """Earned when matching results sharing one key_fn(ctx, result) value reach threshold."""

    def evaluate(ctx: AchievementContext, player_results: list[dict]) -> str | None:
        counts: dict[object, int] = {}
        for r in player_results:
            if predicate(ctx, r):
                key = key_fn(ctx, r)
                counts[key] = counts.get(key, 0) + 1
                if counts[key] == threshold:
                    return r["date"]
        return None

    return evaluate


def comeback_after(losses: int) -> Evaluate:
    """Earned on a win that ends a run of at least `losses` consecutive losses."""

    def evaluate(ctx: AchievementContext, player_results: list[dict]) -> str | None:
        losing_streak = 0
        for r in player_results:
            if not is_win(ctx, r):
                losing_streak += 1
            elif losing_streak >= losses:
                return r["date"]
            else:
                losing_streak = 0
        return None

    return evaluate
