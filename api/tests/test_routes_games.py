from fastapi.testclient import TestClient

from main import app
from tests.conftest import ORIGIN


def test_create_game_missing_name_returns_422(authed_client):
    c = authed_client("admin")
    resp = c.post("/api/games", json={}, headers=ORIGIN)
    assert resp.status_code == 422


def test_create_game_success(authed_client, fake_db):
    c = authed_client("admin")
    resp = c.post("/api/games", json={"name": "Catan", "tags": ["Strategy"]}, headers=ORIGIN)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Catan"
    assert data["tags"] == ["Strategy"]
    assert "pk" in data
    assert "#" not in data["pk"]
    assert len(fake_db["games"].scan()["Items"]) == 1


def test_create_game_readonly_forbidden(authed_client):
    c = authed_client("readonly")
    resp = c.post("/api/games", json={"name": "Catan", "tags": []}, headers=ORIGIN)
    assert resp.status_code == 403


def test_create_game_rejects_unknown_fields(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/games",
        json={
            "name": "Catan",
            "tags": [],
            "pk": "evil-pk",
            "favorites": ["mallory"],
            "type": "haxx",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_list_games_returns_seeded_items(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01TESTGAME",
            "name": "Catan",
            "tags": [],
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("readonly")
    resp = c.get("/api/games", headers=ORIGIN)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Catan"


def test_list_games_unauthenticated():
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.get("/api/games", headers=ORIGIN)
    assert resp.status_code == 401


def test_delete_game_removes_from_db(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01TESTGAME",
            "name": "Catan",
            "tags": [],
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.delete("/api/games/01TESTGAME", headers=ORIGIN)
    assert resp.status_code == 204
    assert fake_db["games"].get_item(Key={"pk": "01TESTGAME"}).get("Item") is None


def test_delete_nonexistent_game_returns_404(authed_client, fake_db):
    c = authed_client("admin")
    resp = c.delete("/api/games/does-not-exist", headers=ORIGIN)
    assert resp.status_code == 404


def test_delete_game_with_results_blocked_409(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    fake_db["results"].seed(
        {
            "pk": "01RESULT",
            "gameId": "01GAME",
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [],
            "winnerId": "a",
            "winnerName": "A",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.delete("/api/games/01GAME", headers=ORIGIN)
    assert resp.status_code == 409
    assert "1 result" in resp.json()["detail"]


def test_delete_game_with_rec_blocked_409(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    fake_db["recs"].seed(
        {
            "pk": "01REC",
            "gamePk": "01GAME",
            "gameName": "Catan",
            "blurb": "x",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.delete("/api/games/01GAME", headers=ORIGIN)
    assert resp.status_code == 409
    assert "1 recommendation" in resp.json()["detail"]


def test_delete_unreferenced_game_succeeds(authed_client, fake_db):
    fake_db["games"].seed({"pk": "01GAME", "name": "Catan", "createdAt": "2026-01-01T00:00:00Z"})
    c = authed_client("admin")
    resp = c.delete("/api/games/01GAME", headers=ORIGIN)
    assert resp.status_code == 204


def test_update_game_sets_player_variables_with_ids(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Chess", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/games/01GAME",
        json={
            "playerVariables": [{"label": "Color", "options": ["White", "Black"]}],
            "trackTurnOrder": True,
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["playerVariables"] == [
        {"id": "color", "label": "Color", "options": ["White", "Black"]}
    ]
    assert data["trackTurnOrder"] is True
    assert data["name"] == "Chess"


def test_update_game_dedupes_variable_ids_for_duplicate_labels(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Game", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/games/01GAME",
        json={
            "playerVariables": [
                {"label": "Color", "options": ["Red", "Blue"]},
                {"label": "Color", "options": ["Green", "Yellow"]},
            ]
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 200
    ids = [v["id"] for v in resp.json()["playerVariables"]]
    assert ids == ["color", "color-2"]


def test_update_game_player_variable_requires_two_options(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Game", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/games/01GAME",
        json={"playerVariables": [{"label": "Color", "options": ["White"]}]},
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_update_game_rejects_id_in_player_variable_input(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Game", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/games/01GAME",
        json={
            "playerVariables": [{"id": "color", "label": "Color", "options": ["White", "Black"]}]
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_update_nonexistent_game_returns_404(authed_client):
    c = authed_client("admin")
    resp = c.put("/api/games/does-not-exist", json={"name": "X"}, headers=ORIGIN)
    assert resp.status_code == 404


def test_update_game_readonly_forbidden(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Game", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("readonly")
    resp = c.put("/api/games/01GAME", json={"name": "X"}, headers=ORIGIN)
    assert resp.status_code == 403


def test_update_game_partial_update_preserves_other_fields(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Chess",
            "tags": ["Strategy"],
            "weight": 2.0,
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.put("/api/games/01GAME", json={"trackTurnOrder": True}, headers=ORIGIN)
    assert resp.status_code == 200
    data = resp.json()
    assert data["tags"] == ["Strategy"]
    assert data["weight"] == 2.0
    assert data["trackTurnOrder"] is True


def test_update_game_explicit_null_clears_field(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Chess",
            "tags": ["Strategy"],
            "weight": 2.0,
            "yearPublished": 1475,
            "imageUrl": "https://example.com/chess.png",
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.put(
        "/api/games/01GAME", json={"yearPublished": None, "imageUrl": None}, headers=ORIGIN
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["yearPublished"] is None
    assert data["imageUrl"] is None
    assert data["weight"] == 2.0
    assert data["tags"] == ["Strategy"]


def test_update_game_strips_favorites_from_response_but_preserves_in_storage(
    authed_client, fake_db
):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Chess",
            "tags": [],
            "createdAt": "2026-01-01T00:00:00Z",
            "favorites": {"alice"},
        }
    )
    c = authed_client("admin")
    resp = c.put("/api/games/01GAME", json={"trackTurnOrder": True}, headers=ORIGIN)
    assert resp.status_code == 200
    assert "favorites" not in resp.json()
    assert fake_db["games"].get_item(Key={"pk": "01GAME"})["Item"]["favorites"] == ["alice"]


def test_update_game_null_player_variables_normalizes_to_empty_list(authed_client, fake_db):
    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Chess",
            "tags": [],
            "playerVariables": [{"id": "color", "label": "Color", "options": ["White", "Black"]}],
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")
    resp = c.put("/api/games/01GAME", json={"playerVariables": None}, headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json()["playerVariables"] == []


def test_create_game_assigns_variable_ids(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/games",
        json={
            "name": "Terraforming Mars",
            "tags": [],
            "playerVariables": [{"label": "Corporation", "options": ["Saturn Systems", "Ecoline"]}],
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    assert resp.json()["playerVariables"] == [
        {"id": "corporation", "label": "Corporation", "options": ["Saturn Systems", "Ecoline"]}
    ]


def test_upload_url_extension_comes_from_content_type(authed_client, monkeypatch):
    import routes.games as games_module

    # Presigned uploads are the S3 path; the default local backend returns a
    # /storage proxy URL instead.
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    captured = {}

    class FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):
            captured["key"] = Params["Key"]
            return "https://example.com/upload"

    # _s3 is built at import time, when the default local backend was still in
    # effect — replace the client itself, not one of its attributes.
    monkeypatch.setattr(games_module, "_s3", FakeS3())
    c = authed_client("admin")
    resp = c.post(
        "/api/games/upload",
        json={"filename": "evil.svg", "contentType": "image/png"},
        headers=ORIGIN,
    )
    assert resp.status_code == 200
    assert captured["key"].startswith("game-images/")
    assert captured["key"].endswith(".png")


def test_upload_url_rejects_unsupported_content_type(authed_client):
    c = authed_client("admin")
    resp = c.post(
        "/api/games/upload",
        json={"filename": "x.svg", "contentType": "image/svg+xml"},
        headers=ORIGIN,
    )
    assert resp.status_code == 422


def test_upload_url_readonly_forbidden(authed_client):
    c = authed_client("readonly")
    resp = c.post(
        "/api/games/upload",
        json={"contentType": "image/png"},
        headers=ORIGIN,
    )
    assert resp.status_code == 403


def test_game_expansions_crud(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Catan", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")

    # Add expansion from BGG metadata
    resp = c.post(
        "/api/games/01GAME/expansions",
        json={
            "name": "Catan: Seafarers",
            "bggId": 926,
            "yearPublished": 1997,
            "description": "Sail across the seas of Catan.",
            "imageUrl": "https://example.com/seafarers.jpg",
            "minPlayers": 3,
            "maxPlayers": 4,
            "playTime": 90,
            "weight": 2.4,
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    game = resp.json()
    assert len(game["expansions"]) == 1
    exp_id = game["expansions"][0]["id"]
    assert exp_id
    assert game["expansions"][0]["name"] == "Catan: Seafarers"
    assert game["expansions"][0]["bggId"] == 926
    assert game["expansions"][0]["description"] == "Sail across the seas of Catan."

    # Duplicate bggId rejected with 409
    dup = c.post(
        "/api/games/01GAME/expansions",
        json={"name": "Catan: Seafarers", "bggId": 926},
        headers=ORIGIN,
    )
    assert dup.status_code == 409

    # Add manual expansion (no bggId)
    manual = c.post(
        "/api/games/01GAME/expansions",
        json={"name": "Custom Fan Expansion", "description": "Home-printed map"},
        headers=ORIGIN,
    )
    assert manual.status_code == 201
    assert len(manual.json()["expansions"]) == 2

    # Update expansion
    upd = c.put(
        f"/api/games/01GAME/expansions/{exp_id}",
        json={"name": "Catan: Seafarers (5-6 Player)", "maxPlayers": 6},
        headers=ORIGIN,
    )
    assert upd.status_code == 200
    updated_exp = next(e for e in upd.json()["expansions"] if e["id"] == exp_id)
    assert updated_exp["name"] == "Catan: Seafarers (5-6 Player)"
    assert updated_exp["maxPlayers"] == 6

    # Delete expansion
    delete_resp = c.delete(f"/api/games/01GAME/expansions/{exp_id}", headers=ORIGIN)
    assert delete_resp.status_code == 204

    games_list = c.get("/api/games", headers=ORIGIN).json()
    assert len(games_list[0]["expansions"]) == 1
    assert games_list[0]["expansions"][0]["name"] == "Custom Fan Expansion"


def test_game_expansions_not_found_and_validation(authed_client, fake_db):
    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Catan", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")

    assert (
        c.post("/api/games/NOPE/expansions", json={"name": "Exp"}, headers=ORIGIN).status_code
        == 404
    )
    assert (
        c.post("/api/games/01GAME/expansions", json={"name": "   "}, headers=ORIGIN).status_code
        == 422
    )
    assert (
        c.put("/api/games/01GAME/expansions/NOPE", json={"name": "X"}, headers=ORIGIN).status_code
        == 404
    )
    assert c.delete("/api/games/01GAME/expansions/NOPE", headers=ORIGIN).status_code == 404


def test_game_rulebooks_upload_stream_and_delete(authed_client, fake_db):
    import os
    from pathlib import Path

    fake_db["games"].seed(
        {"pk": "01GAME", "name": "Catan", "tags": [], "createdAt": "2026-01-01T00:00:00Z"}
    )
    c = authed_client("admin")

    pdf1 = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    resp1 = c.post(
        "/api/games/01GAME/rulebooks?filename=Catan_Base_Rules.pdf",
        content=pdf1,
        headers={**ORIGIN, "Content-Type": "application/pdf"},
    )
    assert resp1.status_code == 201
    game = resp1.json()
    assert len(game["rulebooks"]) == 1
    rb1 = game["rulebooks"][0]
    assert rb1["name"] == "Catan_Base_Rules"
    assert rb1["filename"] == "Catan_Base_Rules.pdf"
    assert rb1["size"] == len(pdf1)
    assert rb1["url"] == f"/api/games/01GAME/rulebooks/{rb1['id']}/file"
    expected_path = Path(os.environ["RULEBOOKS_STORAGE_DIR"]) / "01GAME" / f"{rb1['id']}.pdf"
    assert expected_path.is_file()

    # Upload a second PDF rulebook on the same game with custom display name
    pdf2 = b"%PDF-1.4\nAlmanac and FAQ content\n%%EOF"
    resp2 = c.post(
        "/api/games/01GAME/rulebooks?filename=almanac.pdf&name=Almanac+%26+FAQ",
        content=pdf2,
        headers={**ORIGIN, "Content-Type": "application/pdf"},
    )
    assert resp2.status_code == 201
    game2 = resp2.json()
    assert len(game2["rulebooks"]) == 2
    rb2 = game2["rulebooks"][1]
    assert rb2["name"] == "Almanac & FAQ"
    assert rb2["filename"] == "almanac.pdf"

    # Stream the first PDF file
    file_resp = c.get(rb1["url"], headers=ORIGIN)
    assert file_resp.status_code == 200
    assert file_resp.headers["content-type"].startswith("application/pdf")
    assert 'inline; filename="Catan_Base_Rules.pdf"' in file_resp.headers["content-disposition"]
    assert file_resp.headers["x-frame-options"] == "SAMEORIGIN"
    assert file_resp.content == pdf1

    # Delete first rulebook
    del_resp = c.delete(f"/api/games/01GAME/rulebooks/{rb1['id']}", headers=ORIGIN)
    assert del_resp.status_code == 204

    # Deleted rulebook returns 404 for both file GET and DELETE
    assert c.get(rb1["url"], headers=ORIGIN).status_code == 404
    assert c.delete(f"/api/games/01GAME/rulebooks/{rb1['id']}", headers=ORIGIN).status_code == 404

    # Second rulebook remains intact
    games_list = c.get("/api/games", headers=ORIGIN).json()
    assert len(games_list[0]["rulebooks"]) == 1
    assert games_list[0]["rulebooks"][0]["id"] == rb2["id"]

    # Deleting the game removes its remaining rulebooks cleanly
    assert c.delete("/api/games/01GAME", headers=ORIGIN).status_code == 204


def test_game_rulebooks_validation_and_permissions(authed_client, fake_db, monkeypatch):
    import routes.games as games_module
    from tests.conftest import make_auth_cookie

    fake_db["games"].seed(
        {
            "pk": "01GAME",
            "name": "Catan",
            "ownerId": "alice",
            "libraryId": "personal:alice",
            "tags": [],
            "createdAt": "2026-01-01T00:00:00Z",
        }
    )
    c = authed_client("admin")

    # 404 for unknown game
    assert (
        c.post(
            "/api/games/NOPE/rulebooks?filename=rules.pdf",
            content=b"%PDF-1.4\n",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 404
    )
    assert c.get("/api/games/NOPE/rulebooks/RB1/file", headers=ORIGIN).status_code == 404
    assert c.delete("/api/games/NOPE/rulebooks/RB1", headers=ORIGIN).status_code == 404

    # Reject non-PDF content-type (415)
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=rules.pdf",
            content=b"%PDF-1.4\n",
            headers={**ORIGIN, "Content-Type": "image/png"},
        ).status_code
        == 415
    )

    # Reject non-.pdf filename (422)
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=rules.txt",
            content=b"%PDF-1.4\n",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 422
    )

    # Reject empty body (422)
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=rules.pdf",
            content=b"",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 422
    )

    # Reject non-PDF magic bytes (422)
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=rules.pdf",
            content=b"NOT A PDF FILE",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 422
    )

    # Reject oversized PDF (413)
    monkeypatch.setattr(games_module, "MAX_RULEBOOK_BYTES", 10)
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=rules.pdf",
            content=b"%PDF-1.4\n1234567890",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 413
    )
    monkeypatch.setattr(games_module, "MAX_RULEBOOK_BYTES", 50 * 1024 * 1024)

    # Upload valid rulebook as admin
    up = c.post(
        "/api/games/01GAME/rulebooks?filename=rules.pdf",
        content=b"%PDF-1.4\nvalid",
        headers={**ORIGIN, "Content-Type": "application/pdf"},
    )
    assert up.status_code == 201
    rb_id = up.json()["rulebooks"][0]["id"]

    # Another normal user ('bob') cannot upload, stream, or delete rulebook on alice's personal game
    c.cookies.set("token", make_auth_cookie("normal", sub="bob")["token"])
    assert (
        c.post(
            "/api/games/01GAME/rulebooks?filename=bob.pdf",
            content=b"%PDF-1.4\nbob",
            headers={**ORIGIN, "Content-Type": "application/pdf"},
        ).status_code
        == 403
    )
    assert c.get(f"/api/games/01GAME/rulebooks/{rb_id}/file", headers=ORIGIN).status_code == 403
    assert c.delete(f"/api/games/01GAME/rulebooks/{rb_id}", headers=ORIGIN).status_code == 403

    # Owner ('alice') can stream and upload
    c.cookies.set("token", make_auth_cookie("normal", sub="alice")["token"])
    assert c.get(f"/api/games/01GAME/rulebooks/{rb_id}/file", headers=ORIGIN).status_code == 200
