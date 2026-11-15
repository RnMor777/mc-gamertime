"""GET /api/games/search when BoardGameGeek misbehaves.

Upstream failures used to escape as unhandled exceptions, i.e. a bare 500 that
looks like a bug in this app rather than "BGG is down, try again".
"""

from __future__ import annotations

import httpx
import pytest

import lib.bgg as bgg
from tests.conftest import ORIGIN

_REQ = httpx.Request("GET", "https://boardgamegeek.com/xmlapi2/search")


def _respond(monkeypatch, *, status=200, text="<items/>", exc=None):
    def fake_get(*args, **kwargs):
        if exc is not None:
            raise exc
        return httpx.Response(status, text=text, request=_REQ)

    monkeypatch.setattr(bgg.httpx, "get", fake_get)


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({"exc": httpx.ReadTimeout("slow", request=_REQ)}, 504),
        ({"exc": httpx.ConnectError("down", request=_REQ)}, 502),
        ({"status": 503, "text": "busy"}, 502),
        ({"status": 200, "text": "<not xml"}, 502),
    ],
)
def test_search_upstream_failure_maps_to_gateway_error(
    authed_client, monkeypatch, kwargs, expected
):
    _respond(monkeypatch, **kwargs)
    resp = authed_client("readonly").get("/api/games/search?q=catan", headers=ORIGIN)
    assert resp.status_code == expected
    assert "BoardGameGeek" in resp.json()["detail"]


def test_detail_unknown_bgg_id_is_404(authed_client, monkeypatch):
    _respond(monkeypatch, text="<items></items>")
    resp = authed_client("readonly").get("/api/games/search?bggId=999999", headers=ORIGIN)
    assert resp.status_code == 404


def test_search_success_still_returns_results(authed_client, monkeypatch):
    _respond(
        monkeypatch,
        text='<items><item id="13"><name value="Catan"/><yearpublished value="1995"/></item></items>',
    )
    resp = authed_client("readonly").get("/api/games/search?q=catan", headers=ORIGIN)
    assert resp.status_code == 200
    assert resp.json() == [{"bggId": 13, "name": "Catan", "yearPublished": 1995}]


def test_search_expansion_type_queries_boardgameexpansion(authed_client, monkeypatch):
    captured = {}

    def fake_get(url, params=None, **kwargs):
        captured["params"] = params
        return httpx.Response(
            200,
            text='<items><item id="926"><name value="Catan: Seafarers"/><yearpublished value="1997"/></item></items>',
            request=_REQ,
        )

    monkeypatch.setattr(bgg.httpx, "get", fake_get)
    resp = authed_client("normal").get(
        "/api/games/search?q=Catan&type=boardgameexpansion", headers=ORIGIN
    )
    assert resp.status_code == 200
    assert captured["params"] == {"query": "Catan", "type": "boardgameexpansion"}
    assert resp.json() == [{"bggId": 926, "name": "Catan: Seafarers", "yearPublished": 1997}]


def test_detail_malformed_number_is_502_not_404(authed_client, monkeypatch):
    _respond(
        monkeypatch,
        text='<items><item id="13"><yearpublished value="nineteen"/></item></items>',
    )
    resp = authed_client("readonly").get("/api/games/search?bggId=13", headers=ORIGIN)
    assert resp.status_code == 502
