from lib.elo import compute_elo, iter_elo, leaders_before


def _result(
    winner_id: str,
    players: list[str],
    date: str = "2026-01-01",
    created_at: str = "2026-01-01T00:00:00Z",
) -> dict:
    return {
        "gameId": "game-1",
        "gameName": "Catan",
        "date": date,
        "players": [{"playerId": pid, "playerName": pid.title()} for pid in players],
        "winnerId": winner_id,
        "createdAt": created_at,
    }


def test_empty_results_returns_empty_ratings():
    assert compute_elo([]) == {}


def test_two_player_game_winner_gains_what_loser_loses():
    ratings = compute_elo([_result("p1", ["p1", "p2"])])
    # Both start at 1000, expected = 0.5, delta = 32 * 0.5 = 16
    assert ratings == {"p1": 1016, "p2": 984}


def test_upset_win_gains_more_than_expected_win():
    # p1 beats p2 twice, building a rating lead
    history = [
        _result("p1", ["p1", "p2"], date="2026-01-01"),
        _result("p1", ["p1", "p2"], date="2026-01-02"),
    ]
    before = compute_elo(history)
    after = compute_elo([*history, _result("p2", ["p1", "p2"], date="2026-01-03")])
    upset_gain = after["p2"] - before["p2"]
    # Beating a higher-rated player must pay more than the even-match 16
    assert upset_gain > 16


def test_four_player_game_splits_k_across_opponents():
    ratings = compute_elo([_result("p1", ["p1", "p2", "p3", "p4"])])
    # 3 duels at K/3: winner gains 3 * (32/3) * 0.5 = 16
    assert ratings["p1"] == 1016
    # Each loser drops (32/3) * 0.5 = 5.33 -> 994.67 rounds to 995
    assert ratings["p2"] == ratings["p3"] == ratings["p4"] == 995


def test_replay_order_is_by_date_then_created_at_not_list_order():
    a = _result("p1", ["p1", "p2"], date="2026-01-01", created_at="2026-01-01T10:00:00Z")
    b = _result("p2", ["p1", "p2"], date="2026-01-01", created_at="2026-01-01T11:00:00Z")
    c = _result("p1", ["p1", "p2"], date="2026-01-02", created_at="2026-01-02T09:00:00Z")
    assert compute_elo([a, b, c]) == compute_elo([c, b, a])


def test_single_player_result_skipped():
    ratings = compute_elo([_result("p1", ["p1"])])
    assert ratings == {}


def test_winner_not_in_players_skipped():
    bad = _result("ghost", ["p1", "p2"])
    assert compute_elo([bad]) == {}


def _pk(result: dict, pk: str) -> dict:
    return {**result, "pk": pk}


def test_iter_elo_snapshot_excludes_newcomers():
    r1 = _pk(_result("p1", ["p1", "p2"], date="2026-01-01"), "a")
    r2 = _pk(_result("p3", ["p1", "p3"], date="2026-01-02"), "b")
    snaps = {r["pk"]: snap for r, snap in iter_elo([r1, r2])}
    assert snaps["a"] == {}
    assert set(snaps["b"]) == {"p1", "p2"}  # p3 not yet rated
    assert round(snaps["b"]["p1"]) == 1016


def test_iter_elo_yields_unrated_results_too():
    unrated = _pk(_result("p1", ["p1"]), "u")  # single player -> unrated
    assert [r["pk"] for r, _ in iter_elo([unrated])] == ["u"]


def test_leaders_before_nobody_rated_is_none():
    r1 = _pk(_result("p1", ["p1", "p2"]), "a")
    assert leaders_before([r1]) == {"a": None}


def test_leaders_before_sole_leader():
    r1 = _pk(_result("p1", ["p1", "p2"], date="2026-01-01"), "a")
    r2 = _pk(_result("p2", ["p1", "p2"], date="2026-01-02"), "b")
    assert leaders_before([r1, r2])["b"] == "p1"


def test_leaders_before_tie_is_none():
    r1 = _pk(_result("p1", ["p1", "p2"], date="2026-01-01"), "a")
    r2 = _pk(_result("p3", ["p3", "p4"], date="2026-01-02"), "b")
    r3 = _pk(_result("p4", ["p1", "p4"], date="2026-01-03"), "c")
    assert leaders_before([r1, r2, r3])["c"] is None  # p1 and p3 both 1016


def test_leaders_before_skips_results_without_pk():
    assert leaders_before([_result("p1", ["p1", "p2"])]) == {}


def test_tied_winners_split_elo_and_beat_losers():
    r = {
        "gameId": "game-1",
        "gameName": "Catan",
        "date": "2026-01-01",
        "players": [{"playerId": pid, "playerName": pid.title()} for pid in ["p1", "p2", "p3"]],
        "winnerIds": ["p1", "p2"],
        "winnerId": "p1",
        "createdAt": "2026-01-01T00:00:00Z",
    }
    ratings = compute_elo([r])
    # p1 & p2 tie (0 delta between them) and each beat p3 (+8 each, -16 for p3)
    assert ratings == {"p1": 1008, "p2": 1008, "p3": 984}


def test_guest_players_excluded_from_elo():
    r = {
        "gameId": "game-1",
        "gameName": "Catan",
        "date": "2026-01-01",
        "players": [
            {"playerId": "p1", "playerName": "P1"},
            {"playerId": "guest:g1", "playerName": "Guest", "isGuest": True},
        ],
        "winnerIds": ["guest:g1"],
        "winnerId": "guest:g1",
        "createdAt": "2026-01-01T00:00:00Z",
    }
    assert compute_elo([r]) == {}
