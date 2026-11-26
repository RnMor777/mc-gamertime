from lib.stats import compute_stats


def _result(
    winner_id: str,
    players: list[tuple[str, str]],
    date: str = "2026-01-01",
    game_id: str = "game-1",
    game_name: str = "Catan",
) -> dict:
    return {
        "pk": f"result-{winner_id}",
        "gameId": game_id,
        "gameName": game_name,
        "date": date,
        "players": [{"playerId": pid, "playerName": name} for pid, name in players],
        "winnerId": winner_id,
        "winnerName": dict(players)[winner_id],
        "createdAt": "2026-01-01T00:00:00Z",
    }


def test_empty_results_returns_empty_stats():
    stats = compute_stats([])
    assert stats["leaderboard"] == []
    assert stats["headToHead"] == []
    assert stats["streaks"] == []
    assert stats["mostPlayed"] is None
    assert stats["perMonth"] == []


def test_leaderboard_counts_wins_and_games():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    lb = {e["playerId"]: e for e in stats["leaderboard"]}
    assert lb["p1"]["wins"] == 2
    assert lb["p1"]["played"] == 3
    assert lb["p2"]["wins"] == 1
    assert lb["p2"]["played"] == 3


def test_head_to_head_records():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    assert len(stats["headToHead"]) == 1
    h2h = stats["headToHead"][0]
    assert h2h["p1Wins"] + h2h["p2Wins"] == 2


def test_streak_counts_consecutive_wins():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], "2026-01-01"),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], "2026-01-02"),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], "2026-01-03"),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")], "2026-01-04"),
    ]
    stats = compute_stats(results)
    streaks = {e["playerId"]: e for e in stats["streaks"]}
    assert streaks["p1"]["best"] == 3
    assert streaks["p1"]["current"] == 0


def test_most_played_game():
    results = [_result("p1", [("p1", "Alice")]) for _ in range(3)]
    stats = compute_stats(results)
    assert stats["mostPlayed"]["gameId"] == "game-1"
    assert stats["mostPlayed"]["count"] == 3


def test_per_month_groups_by_month():
    results = [
        _result("p1", [("p1", "Alice")], "2026-01-15"),
        _result("p1", [("p1", "Alice")], "2026-01-20"),
        _result("p1", [("p1", "Alice")], "2026-02-05"),
    ]
    stats = compute_stats(results)
    months = {e["month"]: e["count"] for e in stats["perMonth"]}
    assert months["2026-01"] == 2
    assert months["2026-02"] == 1


def test_empty_results_returns_empty_game_stats():
    stats = compute_stats([])
    assert stats["gameStats"] == []


def test_game_stats_counts_total_plays():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    assert len(stats["gameStats"]) == 1
    assert stats["gameStats"][0]["totalPlays"] == 3


def test_game_stats_player_breakdown():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    gs = stats["gameStats"][0]
    p1 = next(p for p in gs["playerBreakdown"] if p["playerId"] == "p1")
    p2 = next(p for p in gs["playerBreakdown"] if p["playerId"] == "p2")
    assert p1["wins"] == 2
    assert p1["played"] == 3
    assert round(p1["winRate"], 4) == round(2 / 3, 4)
    assert p2["wins"] == 1
    assert p2["played"] == 3


def test_game_stats_dominant_player_is_highest_winrate_with_min_2_plays():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    assert stats["gameStats"][0]["dominantPlayer"]["playerId"] == "p1"


def test_game_stats_sorted_by_total_plays_descending():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], game_id="game-2", game_name="Chess"),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], game_id="game-1", game_name="Catan"),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], game_id="game-1", game_name="Catan"),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")], game_id="game-1", game_name="Catan"),
    ]
    stats = compute_stats(results)
    assert stats["gameStats"][0]["gameId"] == "game-1"
    assert stats["gameStats"][1]["gameId"] == "game-2"


def test_game_stats_player_breakdown_sorted_by_wins_descending():
    results = [
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p1", [("p1", "Alice"), ("p2", "Bob")]),
        _result("p2", [("p1", "Alice"), ("p2", "Bob")]),
    ]
    stats = compute_stats(results)
    breakdown = stats["gameStats"][0]["playerBreakdown"]
    assert breakdown[0]["playerId"] == "p1"


def test_leaderboard_includes_elo_rating():
    results = [_result("p1", [("p1", "Alice"), ("p2", "Bob")])]
    stats = compute_stats(results)
    lb = {e["playerId"]: e for e in stats["leaderboard"]}
    assert lb["p1"]["rating"] == 1016
    assert lb["p2"]["rating"] == 984


def test_leaderboard_sorted_by_rating():
    # p3 wins more games (2) than p2 (1), but p2's single win is an upset
    # over a higher-rated p3, giving p2 a higher rating than p3.
    # Old sort (-wins, -winRate) would rank p3 above p2; rating must invert this.
    results = [
        _result("p3", [("p1", "Alice"), ("p3", "Cara")], date="2026-01-01"),
        _result("p3", [("p1", "Alice"), ("p3", "Cara")], date="2026-01-02"),
        _result("p2", [("p2", "Bob"), ("p3", "Cara")], date="2026-01-03"),
    ]
    stats = compute_stats(results)
    lb = {e["playerId"]: e for e in stats["leaderboard"]}
    assert lb["p2"]["wins"] == 1
    assert lb["p3"]["wins"] == 2
    assert lb["p2"]["rating"] > lb["p3"]["rating"]
    order = [e["playerId"] for e in stats["leaderboard"]]
    assert order.index("p2") < order.index("p3")


def _game(pk="game-1", **overrides):
    return {"pk": pk, "name": "Chess", "createdAt": "2026-01-01T00:00:00Z", **overrides}


def test_variable_stats_pick_and_win_rates():
    game = _game(playerVariables=[{"id": "color", "label": "Color", "options": ["White", "Black"]}])
    results = [
        {
            "pk": "r1",
            "gameId": "game-1",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {
                    "playerId": "p1",
                    "playerName": "Alice",
                    "variables": {"color": "White"},
                    "score": 1,
                },
                {
                    "playerId": "p2",
                    "playerName": "Bob",
                    "variables": {"color": "Black"},
                    "score": 0,
                },
            ],
            "winnerId": "p1",
            "winnerName": "Alice",
            "createdAt": "2026-01-01T00:00:00Z",
        },
        {
            "pk": "r2",
            "gameId": "game-1",
            "gameName": "Chess",
            "date": "2026-01-02",
            "players": [
                {
                    "playerId": "p1",
                    "playerName": "Alice",
                    "variables": {"color": "Black"},
                    "score": 0,
                },
                {
                    "playerId": "p2",
                    "playerName": "Bob",
                    "variables": {"color": "White"},
                    "score": 1,
                },
            ],
            "winnerId": "p2",
            "winnerName": "Bob",
            "createdAt": "2026-01-02T00:00:00Z",
        },
    ]
    stats = compute_stats(results, [game])
    gs = stats["gameStats"][0]
    color = gs["variableStats"]["color"]
    assert color["label"] == "Color"
    breakdown = {b["value"]: b for b in color["breakdown"]}
    assert breakdown["White"]["picks"] == 2
    assert breakdown["White"]["wins"] == 2
    assert breakdown["White"]["pickRate"] == 1.0
    assert breakdown["White"]["winRate"] == 1.0
    assert breakdown["White"]["avgScore"] == 1.0
    assert breakdown["Black"]["wins"] == 0


def test_seat_stats_win_rate_by_seat():
    game = _game(trackTurnOrder=True)
    results = [
        {
            "pk": "r1",
            "gameId": "game-1",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {"playerId": "p1", "playerName": "Alice", "seat": 1},
                {"playerId": "p2", "playerName": "Bob", "seat": 2},
            ],
            "winnerId": "p1",
            "winnerName": "Alice",
            "createdAt": "2026-01-01T00:00:00Z",
        },
        {
            "pk": "r2",
            "gameId": "game-1",
            "gameName": "Chess",
            "date": "2026-01-02",
            "players": [
                {"playerId": "p1", "playerName": "Alice", "seat": 2},
                {"playerId": "p2", "playerName": "Bob", "seat": 1},
            ],
            "winnerId": "p1",
            "winnerName": "Alice",
            "createdAt": "2026-01-02T00:00:00Z",
        },
    ]
    stats = compute_stats(results, [game])
    seat_stats = {s["seat"]: s for s in stats["gameStats"][0]["seatStats"]}
    assert seat_stats[1]["plays"] == 2
    assert seat_stats[1]["wins"] == 1
    assert seat_stats[1]["winRate"] == 0.5
    assert seat_stats[2]["wins"] == 1


def test_variable_stats_and_seat_stats_empty_when_unconfigured():
    results = [_result("p1", [("p1", "Alice"), ("p2", "Bob")])]
    stats = compute_stats(results, [_game()])
    gs = stats["gameStats"][0]
    assert gs["variableStats"] == {}
    assert gs["seatStats"] == []


def test_compute_stats_without_games_arg_still_works():
    results = [_result("p1", [("p1", "Alice"), ("p2", "Bob")])]
    stats = compute_stats(results)
    assert stats["gameStats"][0]["variableStats"] == {}
    assert stats["gameStats"][0]["seatStats"] == []


def test_compute_stats_ties_and_guests():
    results = [
        {
            "pk": "r1",
            "gameId": "game-1",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [
                {"playerId": "p1", "playerName": "Alice"},
                {"playerId": "p2", "playerName": "Bob"},
                {"playerId": "guest:g1", "playerName": "Charlie", "isGuest": True},
            ],
            "winnerIds": ["p1", "p2"],
            "winnerId": "p1",
            "winnerName": "Alice & Bob",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    ]
    stats = compute_stats(results)
    lb = {e["playerId"]: e for e in stats["leaderboard"]}
    assert set(lb.keys()) == {"p1", "p2"}
    assert lb["p1"]["wins"] == 1
    assert lb["p2"]["wins"] == 1
    # Tied co-winners do not count as beating each other in head-to-head
    assert stats["headToHead"] == [
        {"p1Id": "p1", "p1Name": "Alice", "p2Id": "p2", "p2Name": "Bob", "p1Wins": 0, "p2Wins": 0}
    ]
