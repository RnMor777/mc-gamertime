import defusedxml.common
import pytest

import lib.bgg as bgg
from lib.db.settings import put_settings


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        pass


def test_bgg_search_passes_query_through_params_for_encoding(monkeypatch):
    captured = {}

    def fake_get(url, params=None, **kwargs):
        captured["url"] = url
        captured["params"] = params
        return _FakeResponse("<items></items>")

    monkeypatch.setattr(bgg.httpx, "get", fake_get)
    bgg.bgg_search("catan & friends")

    assert captured["url"] == f"{bgg.BGG_API_BASE}/search"
    assert captured["params"] == {"query": "catan & friends", "type": "boardgame"}


def test_bgg_search_expansions_passes_boardgameexpansion_type(monkeypatch):
    captured = {}

    def fake_get(url, params=None, **kwargs):
        captured["url"] = url
        captured["params"] = params
        return _FakeResponse(
            "<items>"
            '<item id="926"><name value="Catan: Seafarers"/><yearpublished value="1997"/></item>'
            '<item id="925"><name value="Catan: Cities &amp; Knights"/><yearpublished value="1998"/></item>'
            "</items>"
        )

    monkeypatch.setattr(bgg.httpx, "get", fake_get)
    results = bgg.bgg_search_expansions("Catan")

    assert captured["url"] == f"{bgg.BGG_API_BASE}/search"
    assert captured["params"] == {"query": "Catan", "type": "boardgameexpansion"}
    assert len(results) == 2
    assert results[0]["name"] == "Catan: Seafarers"
    assert results[0]["bggId"] == 926
    assert results[0]["yearPublished"] == 1997


def test_fetch_xml_rejects_entity_expansion(monkeypatch):
    malicious_xml = (
        '<?xml version="1.0"?>'
        '<!DOCTYPE item [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        "<item>&xxe;</item>"
    )

    def fake_get(url, params=None, **kwargs):
        return _FakeResponse(malicious_xml)

    monkeypatch.setattr(bgg.httpx, "get", fake_get)

    with pytest.raises(defusedxml.common.EntitiesForbidden):
        bgg._fetch_xml(f"{bgg.BGG_API_BASE}/search")


def test_set_bgg_token_fallback_used_when_no_db_override():
    bgg.set_bgg_token_fallback("env-fallback-token")

    assert bgg._bgg_token == "env-fallback-token"


def test_db_override_wins_over_fallback():
    bgg.set_bgg_token_fallback("env-fallback-token")
    put_settings({"pk": "instance", "bggToken": "db-override-token"})
    bgg.refresh_token_from_db()

    assert bgg._bgg_token == "db-override-token"


def test_refresh_reverts_to_fallback_when_db_token_cleared():
    bgg.set_bgg_token_fallback("env-fallback-token")
    put_settings({"pk": "instance", "bggToken": "db-override-token"})
    bgg.refresh_token_from_db()
    put_settings({"pk": "instance"})  # bggToken cleared
    bgg.refresh_token_from_db()

    assert bgg._bgg_token == "env-fallback-token"


def test_bgg_detail_extracts_boardgamecategory_links(monkeypatch):
    xml_payload = (
        "<items>"
        '<item id="13">'
        '<name type="primary" value="Catan"/>'
        '<yearpublished value="1995"/>'
        '<link type="boardgamecategory" id="1021" value="Economic"/>'
        '<link type="boardgamecategory" id="1026" value="Negotiation"/>'
        '<link type="boardgamemechanic" id="2072" value="Dice Rolling"/>'
        "</item>"
        "</items>"
    )

    monkeypatch.setattr(bgg.httpx, "get", lambda *a, **kw: _FakeResponse(xml_payload))
    detail = bgg.bgg_detail(13)

    assert detail["bggId"] == 13
    assert detail["name"] == "Catan"
    assert detail["categories"] == ["Economic", "Negotiation"]
