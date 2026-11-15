from __future__ import annotations

from fastapi.testclient import TestClient

from lib.auth import AuthUser, sign_token
from lib.db.libraries import get_library
from main import app
from tests.conftest import ORIGIN


def _client_for(fake_db, username: str, role: str, display_name: str | None = None) -> TestClient:
    fake_db["users"].seed(
        {
            "pk": username,
            "displayName": display_name or username.capitalize(),
            "role": role,
            "createdAt": "2026-01-01T00:00:00Z",
            "passwordHash": "x",
        }
    )
    token = sign_token(
        AuthUser(sub=username, role=role, displayName=display_name or username.capitalize())
    )
    c = TestClient(app, raise_server_exceptions=False)
    c.cookies.set("token", token)
    return c


def test_app_roles_only_allow_admin_and_normal_and_create_unique_personal_library(
    authed_client, fake_db
):
    c = authed_client("admin")

    # App-level readonly role is rejected
    bad_resp = c.post(
        "/api/users",
        json={
            "username": "charlie",
            "displayName": "Charlie",
            "password": "secretpassword123",
            "role": "readonly",
        },
        headers=ORIGIN,
    )
    assert bad_resp.status_code == 422

    # Creating a normal user succeeds and creates a unique personal library with them as owner
    resp = c.post(
        "/api/users",
        json={
            "username": "charlie",
            "displayName": "Charlie",
            "password": "secretpassword123",
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["role"] == "normal"
    lib_id_1 = data["personalLibraryId"]
    assert lib_id_1

    lib_doc = get_library(lib_id_1)
    assert lib_doc is not None
    assert lib_doc["isPersonal"] is True
    assert lib_doc["ownerId"] == "charlie"
    assert lib_doc["members"] == [{"username": "charlie", "role": "owner"}]

    # Updating user role to readonly at app level is rejected; admin/normal succeeds
    assert c.put("/api/users/charlie", json={"role": "readonly"}, headers=ORIGIN).status_code == 422
    resp2 = c.put("/api/users/charlie", json={"role": "admin"}, headers=ORIGIN)
    assert resp2.status_code == 200
    assert resp2.json()["role"] == "admin"

    # Deleting and recreating a user with the same username gets a brand new unique library ID (no conflict)
    assert c.delete("/api/users/charlie", headers=ORIGIN).status_code == 204
    assert get_library(lib_id_1) is None

    resp_recreate = c.post(
        "/api/users",
        json={
            "username": "charlie",
            "displayName": "Charlie Returns",
            "password": "secretpassword123",
            "role": "normal",
        },
        headers=ORIGIN,
    )
    assert resp_recreate.status_code == 201
    lib_id_2 = resp_recreate.json()["personalLibraryId"]
    assert lib_id_2 != lib_id_1
    assert get_library(lib_id_2) is not None


def test_normal_user_cannot_manage_users_or_settings(fake_db):
    c = _client_for(fake_db, "alice", "normal")
    assert c.get("/api/users", headers=ORIGIN).status_code == 403
    assert (
        c.post(
            "/api/users",
            json={
                "username": "bob",
                "displayName": "Bob",
                "password": "secretpassword123",
                "role": "normal",
            },
            headers=ORIGIN,
        ).status_code
        == 403
    )
    assert c.get("/api/settings", headers=ORIGIN).status_code == 403


def test_personal_library_isolation_between_users(fake_db):
    alice = _client_for(fake_db, "alice", "normal")
    bob = _client_for(fake_db, "bob", "normal")

    # Alice and Bob each get a unique personal library ID when they list libraries or add games
    alice_libs = alice.get("/api/libraries", headers=ORIGIN).json()
    bob_libs = bob.get("/api/libraries", headers=ORIGIN).json()
    assert len(alice_libs) == 1
    assert len(bob_libs) == 1
    alice_personal_id = alice_libs[0]["id"]
    bob_personal_id = bob_libs[0]["id"]
    assert alice_personal_id != bob_personal_id
    assert alice_libs[0]["isPersonal"] is True
    assert alice_libs[0]["myRole"] == "owner"

    # Alice adds a game to her personal library
    r1 = alice.post("/api/games", json={"name": "Wingspan", "tags": ["Birds"]}, headers=ORIGIN)
    assert r1.status_code == 201
    wingspan = r1.json()
    assert wingspan["libraryId"] == alice_personal_id
    assert wingspan["ownerId"] == "alice"

    # Alice sees her game
    alice_games = alice.get("/api/games", headers=ORIGIN).json()
    assert [g["name"] for g in alice_games] == ["Wingspan"]

    # Bob does NOT see Alice's personal game
    bob_games = bob.get("/api/games", headers=ORIGIN).json()
    assert bob_games == []

    # Bob cannot query Alice's personal library directly
    assert bob.get(f"/api/games?libraryId={alice_personal_id}", headers=ORIGIN).status_code == 403
    assert bob.get("/api/games?libraryId=personal:alice", headers=ORIGIN).status_code == 403

    # Bob cannot add a game to Alice's personal library
    assert (
        bob.post(
            "/api/games",
            json={"name": "Intruder", "libraryId": alice_personal_id},
            headers=ORIGIN,
        ).status_code
        == 403
    )

    # Bob cannot update or delete Alice's game
    assert (
        bob.put(f"/api/games/{wingspan['pk']}", json={"name": "Hacked"}, headers=ORIGIN).status_code
        == 403
    )
    assert bob.delete(f"/api/games/{wingspan['pk']}", headers=ORIGIN).status_code == 403

    # Alice can update and delete her own game
    r_upd = alice.put(
        f"/api/games/{wingspan['pk']}", json={"name": "Wingspan Oceania"}, headers=ORIGIN
    )
    assert r_upd.status_code == 200
    assert r_upd.json()["name"] == "Wingspan Oceania"

    r_del = alice.delete(f"/api/games/{wingspan['pk']}", headers=ORIGIN)
    assert r_del.status_code == 204


def test_family_library_lifecycle_and_readonly_library_role(fake_db):
    alice = _client_for(fake_db, "alice", "normal", "Alice")
    bob = _client_for(fake_db, "bob", "normal", "Bob")
    carol = _client_for(fake_db, "carol", "normal", "Carol")
    dave = _client_for(fake_db, "dave", "normal", "Dave")

    # Normal user Alice creates a family library and becomes its owner
    create_resp = alice.post("/api/libraries", json={"name": "Smith Family"}, headers=ORIGIN)
    assert create_resp.status_code == 201
    fam_lib = create_resp.json()
    fam_id = fam_lib["id"]
    assert fam_lib["name"] == "Smith Family"
    assert fam_lib["isPersonal"] is False
    assert fam_lib["ownerId"] == "alice"
    assert fam_lib["myRole"] == "owner"

    # Alice adds Bob as editor and Carol as readonly on the library
    r_bob = alice.post(
        f"/api/libraries/{fam_id}/members",
        json={"username": "bob", "role": "editor"},
        headers=ORIGIN,
    )
    assert r_bob.status_code == 200

    r_carol = alice.post(
        f"/api/libraries/{fam_id}/members",
        json={"username": "carol", "role": "readonly"},
        headers=ORIGIN,
    )
    assert r_carol.status_code == 200
    assert len(r_carol.json()["members"]) == 3

    # Non-member Dave only sees his own personal library
    dave_libs = dave.get("/api/libraries", headers=ORIGIN).json()
    assert len(dave_libs) == 1
    assert dave_libs[0]["isPersonal"] is True
    assert dave.get(f"/api/games?libraryId={fam_id}", headers=ORIGIN).status_code == 403

    # Bob (editor) and Carol (readonly) see both their personal library and Smith Family
    bob_libs = bob.get("/api/libraries", headers=ORIGIN).json()
    assert len(bob_libs) == 2
    assert bob_libs[1]["id"] == fam_id
    assert bob_libs[1]["myRole"] == "editor"

    carol_libs = carol.get("/api/libraries", headers=ORIGIN).json()
    assert len(carol_libs) == 2
    assert carol_libs[1]["id"] == fam_id
    assert carol_libs[1]["myRole"] == "readonly"

    # Bob (editor) can add a game to the family library
    g_resp = bob.post(
        "/api/games",
        json={"name": "Ticket to Ride", "libraryId": fam_id},
        headers=ORIGIN,
    )
    assert g_resp.status_code == 201
    ttr = g_resp.json()
    assert ttr["libraryId"] == fam_id

    # Carol (readonly on library) can view the game in the family library, and via libraryId=all
    carol_fam_games = carol.get(f"/api/games?libraryId={fam_id}", headers=ORIGIN).json()
    assert [g["name"] for g in carol_fam_games] == ["Ticket to Ride"]
    carol_all_games = carol.get("/api/games?libraryId=all", headers=ORIGIN).json()
    assert [g["name"] for g in carol_all_games] == ["Ticket to Ride"]

    # Carol (readonly on library) CANNOT add, edit, or delete games in the family library
    assert (
        carol.post(
            "/api/games",
            json={"name": "Unauthorized Game", "libraryId": fam_id},
            headers=ORIGIN,
        ).status_code
        == 403
    )
    assert (
        carol.put(f"/api/games/{ttr['pk']}", json={"name": "Nope"}, headers=ORIGIN).status_code
        == 403
    )
    assert carol.delete(f"/api/games/{ttr['pk']}", headers=ORIGIN).status_code == 403

    # Bob (editor) CAN edit the game in the family library, but CANNOT manage library members or rename library
    assert (
        bob.put(
            f"/api/games/{ttr['pk']}",
            json={"name": "Ticket to Ride: Europe"},
            headers=ORIGIN,
        ).status_code
        == 200
    )
    assert (
        bob.put(
            f"/api/libraries/{fam_id}",
            json={"name": "Bob Family"},
            headers=ORIGIN,
        ).status_code
        == 403
    )
    assert (
        bob.post(
            f"/api/libraries/{fam_id}/members",
            json={"username": "dave", "role": "readonly"},
            headers=ORIGIN,
        ).status_code
        == 403
    )

    # Alice (owner) can rename the library and promote Bob to owner
    rename_resp = alice.put(
        f"/api/libraries/{fam_id}",
        json={"name": "The Smith Family"},
        headers=ORIGIN,
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["name"] == "The Smith Family"

    # Alice cannot demote herself while she is the only owner
    assert (
        alice.put(
            f"/api/libraries/{fam_id}/members/alice",
            json={"role": "editor"},
            headers=ORIGIN,
        ).status_code
        == 400
    )
    assert alice.delete(f"/api/libraries/{fam_id}/members/alice", headers=ORIGIN).status_code == 400

    # Alice promotes Bob to owner, then Alice can step down to editor
    promo_resp = alice.put(
        f"/api/libraries/{fam_id}/members/bob",
        json={"role": "owner"},
        headers=ORIGIN,
    )
    assert promo_resp.status_code == 200

    demote_resp = bob.put(
        f"/api/libraries/{fam_id}/members/alice",
        json={"role": "editor"},
        headers=ORIGIN,
    )
    assert demote_resp.status_code == 200
    assert demote_resp.json()["ownerId"] == "bob"

    # Carol can leave the library herself
    leave_resp = carol.delete(f"/api/libraries/{fam_id}/members/carol", headers=ORIGIN)
    assert leave_resp.status_code == 204
    assert carol.get(f"/api/games?libraryId={fam_id}", headers=ORIGIN).status_code == 403

    # Bob (now owner) can delete the library
    del_lib_resp = bob.delete(f"/api/libraries/{fam_id}", headers=ORIGIN)
    assert del_lib_resp.status_code == 204
    assert bob.get(f"/api/games?libraryId={fam_id}", headers=ORIGIN).status_code == 404


def test_user_in_multiple_family_libraries_and_edge_cases(fake_db):
    alice = _client_for(fake_db, "alice", "normal", "Alice")
    bob = _client_for(fake_db, "bob", "normal", "Bob")
    admin = _client_for(fake_db, "adminuser", "admin", "Admin")

    lib1 = alice.post("/api/libraries", json={"name": "Library One"}, headers=ORIGIN).json()
    lib2 = bob.post("/api/libraries", json={"name": "Library Two"}, headers=ORIGIN).json()

    # Add Alice as readonly in Library Two
    bob.post(
        f"/api/libraries/{lib2['id']}/members",
        json={"username": "alice", "role": "readonly"},
        headers=ORIGIN,
    )

    # Alice belongs to her personal library (owner), Library One (owner), and Library Two (readonly)
    alice_libs = alice.get("/api/libraries", headers=ORIGIN).json()
    roles_by_name = {item["name"]: item["myRole"] for item in alice_libs}
    assert roles_by_name == {
        "Alice's Library": "owner",
        "Library One": "owner",
        "Library Two": "readonly",
    }

    alice_personal_id = alice_libs[0]["id"]

    # Alice can rename her personal library and manage members on it without needing a family library
    rename_personal = alice.put(
        f"/api/libraries/{alice_personal_id}",
        json={"name": "Alice's Vault"},
        headers=ORIGIN,
    )
    assert rename_personal.status_code == 200
    assert rename_personal.json()["name"] == "Alice's Vault"

    share_personal = alice.post(
        f"/api/libraries/{alice_personal_id}/members",
        json={"username": "bob", "role": "readonly"},
        headers=ORIGIN,
    )
    assert share_personal.status_code == 200
    assert len(share_personal.json()["members"]) == 2

    remove_bob = alice.delete(
        f"/api/libraries/{alice_personal_id}/members/bob",
        headers=ORIGIN,
    )
    assert remove_bob.status_code == 204

    # Deleting the base personal library or demoting/removing its owner is still blocked
    for pid in (alice_personal_id, "personal:alice"):
        assert alice.delete(f"/api/libraries/{pid}", headers=ORIGIN).status_code == 400
        assert (
            alice.put(
                f"/api/libraries/{pid}/members/alice",
                json={"role": "readonly"},
                headers=ORIGIN,
            ).status_code
            == 400
        )
        assert (
            alice.delete(f"/api/libraries/{pid}/members/alice", headers=ORIGIN).status_code == 400
        )

    # Unknown library / user / member returns 404
    assert (
        alice.put("/api/libraries/missing", json={"name": "X"}, headers=ORIGIN).status_code == 404
    )
    assert alice.delete("/api/libraries/missing", headers=ORIGIN).status_code == 404
    assert (
        alice.post(
            f"/api/libraries/{lib1['id']}/members",
            json={"username": "ghost", "role": "readonly"},
            headers=ORIGIN,
        ).status_code
        == 404
    )
    assert (
        alice.put(
            f"/api/libraries/{lib1['id']}/members/ghost",
            json={"role": "readonly"},
            headers=ORIGIN,
        ).status_code
        == 404
    )
    assert (
        alice.delete(f"/api/libraries/{lib1['id']}/members/ghost", headers=ORIGIN).status_code
        == 404
    )

    # App admin can view all libraries (including all personal libraries) and delete a library blocked by results (409 check)
    admin_libs = admin.get("/api/libraries", headers=ORIGIN).json()
    assert len(admin_libs) == 5
    personal_owners = {lib["ownerId"] for lib in admin_libs if lib["isPersonal"]}
    assert personal_owners == {"adminuser", "alice", "bob"}
    admin_all_games = admin.get("/api/games?libraryId=all", headers=ORIGIN)
    assert admin_all_games.status_code == 200

    game = alice.post(
        "/api/games", json={"name": "Catan", "libraryId": lib1["id"]}, headers=ORIGIN
    ).json()
    # Normal user can log a result
    res_resp = alice.post(
        "/api/results",
        json={
            "gameId": game["pk"],
            "gameName": "Catan",
            "date": "2026-01-01",
            "players": [{"playerId": "alice", "playerName": "Alice"}],
            "winnerId": "alice",
            "winnerName": "Alice",
        },
        headers=ORIGIN,
    )
    assert res_resp.status_code == 201

    # Deleting library with referenced game returns 409
    assert alice.delete(f"/api/libraries/{lib1['id']}", headers=ORIGIN).status_code == 409
