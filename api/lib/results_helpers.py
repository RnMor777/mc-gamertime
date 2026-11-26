from __future__ import annotations


def get_winner_ids(result: dict) -> list[str]:
    """Return the list of winner IDs for a result, supporting both winnerIds and legacy winnerId."""
    winner_ids = result.get("winnerIds")
    if isinstance(winner_ids, list) and winner_ids:
        return [w for w in winner_ids if w]
    winner_id = result.get("winnerId")
    return [winner_id] if winner_id else []


def is_guest_player(player: dict) -> bool:
    """Return True if the result player entry represents an unregistered guest."""
    return bool(player.get("isGuest"))
