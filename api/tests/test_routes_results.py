import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import app
from routes.results import ResultPlayer
from tests.conftest import ORIGIN


def _seed_user(fake_db, username: str, display_name: str = ""):
    fake_db["users"].seed(
        {
            "pk": username,
            "displayName": display_name or username.capitalize(),
            "role": "readonly",
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
        }
    )


def test_create_result_missing_game_id_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [],
            "winnerId": "u1",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_result_invalid_player_missing_player_id_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerName": "Alice"}],
            "winnerId": "u1",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_result_unknown_player_returns_422(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerId": "ghost", "playerName": "Ghost"}],
            "winnerId": "ghost",
            "winnerName": "Ghost",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "ghost" in resp.json()["detail"]


def test_create_result_winner_not_in_players_returns_422(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    _seed_user(fake_db, "alice", "Alice")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "bob",
            "winnerName": "Bob",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_result_success(authed_client, fake_db):
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-15",
            "players": [
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "bob", "playerName": "Bob"},
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["gameName"] == "Catan"
    assert data["winnerId"] == "alice"
    assert "pk" in data
    assert "#" not in data["pk"]
    assert "milestone" in data


def test_list_results_authenticated(authed_client, fake_db):
    fake_db["results"].seed(
        {
            "pk": "01RESULT",
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("readonly")
    resp = c.get("/api/results", headers=ORIGIN)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_list_results_unauthenticated():
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/results", headers=ORIGIN)
    assert resp.status_code == 401


def test_create_result_readonly_forbidden(authed_client):
    c = authed_client("readonly")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [],
            "winnerId": "u1",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 403


def test_create_result_empty_game_id_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "   ",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_result_invalid_date_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "not-a-date",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_create_result_unknown_game_returns_422(authed_client, fake_db):
    _seed_user(fake_db, "alice", "Alice")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "NONEXISTENT",
            "gameName": "Fake Game",
            "date": "2026-01-01",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "game" in resp.json()["detail"].lower()


def _seed_result(fake_db, **overrides):
    result = {
        "pk": "01RESULT",
        "gameId": "01GAME",
        "gameName": "Catan",
        "date": "2026-01-01",
        "players": [{"playerId": "alice", "playerName": "Alice", "score": 7}],
        "winnerId": "alice",
        "winnerName": "Alice",
        "createdAt": "2026-01-01T00:00:00Z",
        **overrides,
    }
    fake_db["results"].seed(result)
    return result


def test_delete_result_admin(authed_client, fake_db):
    _seed_result(fake_db)
    c = authed_client("admin")
    resp = c.delete("/api/results/01RESULT", headers=ORIGIN)
    assert resp.status_code == 204
    assert fake_db["results"].get_item(Key={"pk": "01RESULT"}).get("Item") is None


def test_delete_result_not_found(authed_client, fake_db):
    c = authed_client("admin")
    resp = c.delete("/api/results/MISSING", headers=ORIGIN)
    assert resp.status_code == 404


def test_delete_result_readonly_forbidden(authed_client, fake_db):
    _seed_result(fake_db)
    c = authed_client("readonly")
    resp = c.delete("/api/results/01RESULT", headers=ORIGIN)
    assert resp.status_code == 403


def _result_payload(**overrides):
    return {
        "gameId": "01GAME",
        "gameName": "Catan",
        "date": "2026-01-01",
        "players": [{"playerId": "alice", "playerName": "Alice"}],
        "winnerId": "alice",
        "winnerName": "Alice",
        **overrides,
    }


def test_create_result_accepts_any_finite_score(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    for ok in (-5, 0, 0.5, 11, 142):
        resp = c.post(
            "/api/results",
            json=_result_payload(
                players=[{"playerId": "alice", "playerName": "Alice", "score": ok}]
            ),
            headers=ORIGIN,
        )
        assert resp.status_code == 201, f"score {ok} should be accepted"
        assert resp.json()["players"][0]["score"] == ok


def test_result_player_rejects_non_finite_score():
    # Tested on the model: over HTTP, FastAPI's 422 body echoes the NaN input and
    # fails to JSON-encode it, so the request is rejected but not with a clean 422.
    for bad in (math.nan, math.inf, -math.inf):
        with pytest.raises(ValidationError):
            ResultPlayer(playerId="alice", playerName="Alice", score=bad)


def test_create_result_with_notes_stored_trimmed(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    resp = c.post(
        "/api/results", json=_result_payload(notes="  Birds 34, eggs 12  "), headers=ORIGIN
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == "Birds 34, eggs 12"


def test_create_result_blank_or_missing_notes_omits_attribute(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    for payload in (_result_payload(), _result_payload(notes="   "), _result_payload(notes=None)):
        resp = c.post("/api/results", json=payload, headers=ORIGIN)
        assert resp.status_code == 201
        assert "notes" not in resp.json()


def test_create_result_notes_too_long_rejected(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    resp = c.post("/api/results", json=_result_payload(notes="x" * 1001), headers=ORIGIN)
    assert resp.status_code == 422
    resp = c.post("/api/results", json=_result_payload(notes="x" * 1000), headers=ORIGIN)
    assert resp.status_code == 201


def test_create_result_with_mood_stored(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    resp = c.post("/api/results", json=_result_payload(mood=4), headers=ORIGIN)
    assert resp.status_code == 201
    assert resp.json()["mood"] == 4


def test_create_result_mood_out_of_range_rejected(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    for bad in (0, 6):
        resp = c.post("/api/results", json=_result_payload(mood=bad), headers=ORIGIN)
        assert resp.status_code == 422


def test_create_result_without_mood_omits_attribute(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")
    resp = c.post("/api/results", json=_result_payload(), headers=ORIGIN)
    assert resp.status_code == 201
    assert "mood" not in resp.json()


def test_milestone_detected_even_if_scan_misses_new_result(authed_client, fake_db, monkeypatch):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")

    import routes.results as results_module

    # Simulate eventual consistency: the scan returns nothing even after put_result
    monkeypatch.setattr(results_module, "list_results", lambda: [])

    c = authed_client("admin")
    resp = c.post("/api/results", json=_result_payload(), headers=ORIGIN)
    assert resp.status_code == 201
    # First win milestone must still fire, computed from the locally-appended result
    assert resp.json()["milestone"] == "🎉 Alice got their first win!"


def test_create_result_future_date_returns_422(authed_client, fake_db):
    _seed_user(fake_db, "alice", "Alice")
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2099-12-31",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    # YOUR CODE:
    # Assert that the response body mentions "date" somewhere.
    # This catches the case where the validator runs but reports the wrong field.
    # Hint: assert "date" in resp.text


def test_create_result_tomorrow_allowed_two_days_rejected(authed_client, fake_db):
    from datetime import date, timedelta

    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    c = authed_client("admin")

    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    resp = c.post("/api/results", json=_result_payload(date=tomorrow), headers=ORIGIN)
    assert resp.status_code == 201

    in_two_days = (date.today() + timedelta(days=2)).isoformat()
    resp = c.post("/api/results", json=_result_payload(date=in_two_days), headers=ORIGIN)
    assert resp.status_code == 422


def test_update_result_changes_winner_preserves_created_at(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    _seed_user(fake_db, "bob")
    _seed_result(
        fake_db,
        players=[
            {"playerId": "alice", "playerName": "Alice"},
            {"playerId": "bob", "playerName": "Bob"},
        ],
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/results/01RESULT", json={"winnerId": "bob", "winnerName": "Bob"}, headers=ORIGIN
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["winnerId"] == "bob"
    assert body["createdAt"] == "2026-01-01T00:00:00Z"
    assert body["pk"] == "01RESULT"


def test_create_result_first_win_achievement_notification(authed_client, fake_db):
    _seed_user(fake_db, "alice", "Alice")
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-15",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["newAchievements"] == [
        {
            "playerId": "alice",
            "playerName": "Alice",
            "id": "first_win",
            "label": "First Blood",
            "icon": "🏆",
            "description": "Won your first game",
        }
    ]

    from lib.db.notifications import list_notifications_for_player

    notifs = list_notifications_for_player("alice")
    assert len(notifs) == 1
    assert notifs[0]["achievementId"] == "first_win"
    assert notifs[0]["resultId"] == data["pk"]
    assert notifs[0]["gameName"] == "Catan"
    assert notifs[0]["createdAt"] == data["createdAt"]


def test_create_result_no_new_achievements_returns_empty_list(authed_client, fake_db):
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_result(
        fake_db,
        pk="01RESULT-0",
        date="2026-01-01",
        players=[
            {"playerId": "alice", "playerName": "Alice"},
            {"playerId": "bob", "playerName": "Bob"},
        ],
        winnerId="alice",
        winnerName="Alice",
    )
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-02",
            "players": [
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "bob", "playerName": "Bob"},
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    assert resp.json()["newAchievements"] == []


def test_create_result_triggers_games_10_achievement_for_non_winner(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    for i in range(9):
        _seed_result(
            fake_db,
            pk=f"01RESULT-{i}",
            date=f"2026-01-{i + 1:02d}",
            players=[
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "bob", "playerName": "Bob"},
            ],
            winnerId="alice" if i == 0 else "bob",
            winnerName="Alice" if i == 0 else "Bob",
        )

    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-15",
            "players": [
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "bob", "playerName": "Bob"},
            ],
            "winnerId": "bob",
            "winnerName": "Bob",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    new_ach = resp.json()["newAchievements"]
    alice_ids = {a["id"] for a in new_ach if a["playerId"] == "alice"}
    assert "games_10" in alice_ids


def test_update_result_game_change_refreshes_game_name(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    fake_db["games"].seed({"pk": "02GAME", "name": "Azul", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    _seed_result(fake_db)
    c = authed_client("admin")
    resp = c.put("/api/results/01RESULT", json={"gameId": "02GAME"}, headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json()["gameName"] == "Azul"


def test_update_result_null_mood_clears_it(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    _seed_result(fake_db, mood=3)
    c = authed_client("admin")
    resp = c.put("/api/results/01RESULT", json={"mood": None}, headers=ORIGIN)
    assert resp.status_code == 200
    assert "mood" not in resp.json()


def test_update_result_sets_and_clears_notes(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    _seed_result(fake_db)
    c = authed_client("admin")
    resp = c.put("/api/results/01RESULT", json={"notes": "Close game"}, headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Close game"
    resp = c.put("/api/results/01RESULT", json={"notes": None}, headers=ORIGIN)
    assert resp.status_code == 200
    assert "notes" not in resp.json()


def test_update_result_winner_must_be_player(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    _seed_user(fake_db, "alice")
    _seed_result(fake_db)
    c = authed_client("admin")
    resp = c.put(
        "/api/results/01RESULT", json={"winnerId": "ghost", "winnerName": "Ghost"}, headers=ORIGIN
    )
    assert resp.status_code == 422


def test_update_result_readonly_forbidden(authed_client, fake_db):
    _seed_result(fake_db)
    c = authed_client("readonly")
    resp = c.put("/api/results/01RESULT", json={"mood": 5}, headers=ORIGIN)
    assert resp.status_code == 403


def test_update_unknown_result_404(authed_client):
    c = authed_client("admin")
    resp = c.put("/api/results/NOPE", json={"mood": 5}, headers=ORIGIN)
    assert resp.status_code == 404


def _seed_configured_game(fake_db, pk="01GAME", **overrides):
    game = {
        "pk": pk,
        "name": "Chess",
        "createdAt": "2026-01-01T00:00:00Z",
        "playerVariables": [{"id": "color", "label": "Color", "options": ["White", "Black"]}],
        "trackTurnOrder": True,
        **overrides,
    }
    fake_db["games"].seed(game)
    return game


def test_create_result_requires_configured_variables(authed_client, fake_db):
    _seed_configured_game(fake_db)
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {"playerId": "alice", "playerName": "Alice", "seat": 1},
                {"playerId": "bob", "playerName": "Bob", "seat": 2},
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "variables" in resp.json()["detail"]


def test_create_result_rejects_invalid_variable_value(authed_client, fake_db):
    _seed_configured_game(fake_db)
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {
                    "playerId": "alice",
                    "playerName": "Alice",
                    "seat": 1,
                    "variables": {"color": "Red"},
                },
                {
                    "playerId": "bob",
                    "playerName": "Bob",
                    "seat": 2,
                    "variables": {"color": "Black"},
                },
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "Red" in resp.json()["detail"]


def test_create_result_requires_seat_permutation(authed_client, fake_db):
    _seed_configured_game(fake_db)
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {
                    "playerId": "alice",
                    "playerName": "Alice",
                    "seat": 1,
                    "variables": {"color": "White"},
                },
                {
                    "playerId": "bob",
                    "playerName": "Bob",
                    "seat": 1,
                    "variables": {"color": "Black"},
                },
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "seat" in resp.json()["detail"]


def test_create_result_with_valid_config_succeeds(authed_client, fake_db):
    _seed_configured_game(fake_db)
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {
                    "playerId": "alice",
                    "playerName": "Alice",
                    "seat": 1,
                    "variables": {"color": "White"},
                },
                {
                    "playerId": "bob",
                    "playerName": "Bob",
                    "seat": 2,
                    "variables": {"color": "Black"},
                },
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["players"][0]["seat"] == 1
    assert data["players"][0]["variables"] == {"color": "White"}


def test_create_result_rejects_seat_when_not_tracked(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Codenames", "createdAt": "2026-01-01T00:00:00Z"}
    )
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    c = authed_client("admin")
    resp = c.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Codenames",
            "date": "2026-01-01",
            "players": [
                {"playerId": "alice", "playerName": "Alice", "seat": 1},
                {"playerId": "bob", "playerName": "Bob", "seat": 2},
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "seat" in resp.json()["detail"]


def test_update_result_revalidates_player_config_on_player_change(authed_client, fake_db):
    _seed_configured_game(fake_db)
    _seed_user(fake_db, "alice", "Alice")
    _seed_user(fake_db, "bob", "Bob")
    fake_db["results"].seed(
        {
            "pk": "01RESULT",
            "gameId": "01GAME",
            "gameName": "Chess",
            "date": "2026-01-01",
            "players": [
                {
                    "playerId": "alice",
                    "playerName": "Alice",
                    "seat": 1,
                    "variables": {"color": "White"},
                    "score": None,
                },
                {
                    "playerId": "bob",
                    "playerName": "Bob",
                    "seat": 2,
                    "variables": {"color": "Black"},
                    "score": None,
                },
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/results/01RESULT",
        json={
            "players": [
                {
                    "playerId": "alice",
                    "playerName": "Alice",
                    "seat": 1,
                    "variables": {"color": "White"},
                },
                {
                    "playerId": "bob",
                    "playerName": "Bob",
                    "seat": 1,
                    "variables": {"color": "Black"},
                },
            ]
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422
    assert "seat" in resp.json()["detail"]


def test_normal_user_can_create_update_and_delete_own_result_only_and_loads_game_image(fake_db):
    from lib.auth import AuthUser, sign_token

    def make_client(username: str, role: str) -> TestClient:
        fake_db["users"].seed(
            {
                "pk": username,
                "displayName": username.capitalize(),
                "role": role,
                "createdAt": "2026-01-01T00:00:00Z",
                "passwordHash": "x",
            }
        )
        token = sign_token(AuthUser(sub=username, role=role, displayName=username.capitalize()))
        c = TestClient(app, raise_server_exceptions=False)
        c.cookies.set("token", token)
        return c

    alice = make_client("alice", "normal")
    bob = make_client("bob", "normal")
    admin = make_client("admin", "admin")

    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "imageUrl": "https://example.com/catan.jpg",
            "libraryId": "personal:alice",
            "ownerId": "alice",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )

    create_resp = alice.post(
        "/api/results",
        json={
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-15",
            "players": [
                {"playerId": "alice", "playerName": "Alice"},
                {"playerId": "bob", "playerName": "Bob"},
            ],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    result_pk = created_data["pk"]
    assert created_data["createdBy"] == "alice"
    assert created_data["gameImageUrl"] == "https://example.com/catan.jpg"

    # Bob does not have Catan in his catalog, but GET /api/results still includes gameImageUrl
    bob_results = bob.get("/api/results", headers=ORIGIN).json()
    assert len(bob_results) == 1
    assert bob_results[0]["gameImageUrl"] == "https://example.com/catan.jpg"

    # Bob (who did not create the session and is not an admin) cannot edit or delete it
    assert (
        bob.put(
            f"/api/results/{result_pk}",
            json={"notes": "Edited by Bob"},
            headers=ORIGIN,
        ).status_code
        == 403
    )
    assert bob.delete(f"/api/results/{result_pk}", headers=ORIGIN).status_code == 403

    # Alice (the creator) can edit her own session
    update_resp = alice.put(
        f"/api/results/{result_pk}",
        json={"notes": "Logged by Alice"},
        headers=ORIGIN,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["notes"] == "Logged by Alice"

    # Admin can also edit any session
    admin_update = admin.put(
        f"/api/results/{result_pk}",
        json={"notes": "Updated by Admin"},
        headers=ORIGIN,
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["notes"] == "Updated by Admin"

    # Alice can delete her own session
    delete_resp = alice.delete(f"/api/results/{result_pk}", headers=ORIGIN)
    assert delete_resp.status_code == 204
