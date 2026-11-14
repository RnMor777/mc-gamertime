from fastapi.testclient import TestClient

from main import app
from tests.conftest import ORIGIN


def test_create_game_stores_description_from_bgg(authed_client, fake_db):
    client = authed_client("admin")
    description = "Trade, build, and settle the island of Catan."

    response = client.post(
        "/api/games",
        json={"name": "Catan", "bggId": 13, "description": description},
        headers=ORIGIN,
    )

    assert response.status_code == 201
    assert response.json()["description"] == description
    assert fake_db["games"].scan()["Items"][0]["description"] == description


def test_update_game_can_change_description(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "description": "Old description",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    client = authed_client("admin")

    response = client.put(
        "/api/games/01GAME",
        json={"description": "Updated description"},
        headers=ORIGIN,
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"
    assert fake_db["games"].get_item(Key={"pk": "01GAME"})["Item"]["description"] == (
        "Updated description"
    )


def test_list_games_includes_saved_description(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "description": "Saved description",
            "tags": [],
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    client = authed_client("readonly")

    response = client.get("/api/games", headers=ORIGIN)

    assert response.status_code == 200
    assert response.json()[0]["description"] == "Saved description"


def test_games_require_authentication_for_saved_descriptions():
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/games", headers=ORIGIN)

    assert response.status_code == 401
