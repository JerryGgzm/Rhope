"""The workbench API: local-only guards, settings revisions, credentials, run creation."""

from __future__ import annotations

import os
import stat

import pytest
from fastapi.testclient import TestClient

from tradingagents.web import app as web_app, runs


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(runs.RunManager, "_spawn", lambda self, *a: None)
    app = web_app.create_app()
    with TestClient(app, base_url="http://127.0.0.1:8765") as c:
        token = c.get("/api/v1/session").json()["csrf_token"]
        c.headers.update({"Origin": "http://127.0.0.1:8765", "X-CSRF-Token": token})
        yield c


@pytest.mark.unit
def test_writes_need_a_local_origin_and_the_session_token(client):
    body = {"base_revision": 0, "config": {"max_debate_rounds": 2}}
    assert client.patch("/api/v1/settings", json=body, headers={"X-CSRF-Token": "x"}).status_code == 403
    assert client.patch("/api/v1/settings", json=body,
                        headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/v1/health", headers={"Host": "evil.example"}).status_code == 421
    assert client.patch("/api/v1/settings", json=body).status_code == 200


@pytest.mark.unit
def test_settings_save_as_revisions_and_refuse_a_stale_base(client):
    first = client.patch("/api/v1/settings", json={"base_revision": 0, "config": {"max_debate_rounds": 3}})
    assert first.json()["revision"] == 1
    field = next(f for f in first.json()["fields"] if f["key"] == "max_debate_rounds")
    assert field["value"] == 3 and field["source"] == "web"
    stale = client.patch("/api/v1/settings", json={"base_revision": 0, "config": {"max_debate_rounds": 2}})
    assert stale.status_code == 409
    reset = client.patch("/api/v1/settings", json={"base_revision": 1, "reset": ["max_debate_rounds"]})
    field = next(f for f in reset.json()["fields"] if f["key"] == "max_debate_rounds")
    assert field["source"] != "web"
    bad = client.patch("/api/v1/settings", json={"base_revision": 2, "config": {"temperature": "hot"}})
    assert bad.status_code == 422 and bad.json()["error"]["field_errors"][0]["key"] == "temperature"


@pytest.mark.unit
def test_credentials_are_stored_owner_only_and_never_returned(client, tmp_path):
    secret = "sk-test-0123456789abcdef"
    r = client.put("/api/v1/credentials", json={"set": {"OPENAI_API_KEY": secret}})
    assert r.status_code == 200
    assert secret not in r.text
    entry = next(c for c in r.json()["credentials"] if c["name"] == "OPENAI_API_KEY")
    assert entry == {**entry, "configured": True, "source": "web"}
    path = tmp_path / "web" / "credentials.json"
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert secret not in client.get("/api/v1/settings").text
    # An empty value leaves the stored key; clearing is explicit.
    client.put("/api/v1/credentials", json={"set": {"OPENAI_API_KEY": ""}})
    assert secret in path.read_text()
    client.put("/api/v1/credentials", json={"clear": ["OPENAI_API_KEY"]})
    assert secret not in path.read_text()
    assert client.put("/api/v1/credentials", json={"set": {"PATH": "/tmp"}}).status_code == 422


@pytest.mark.unit
def test_a_run_is_validated_queued_once_per_key_and_cancellable(client, monkeypatch):
    bad = client.post("/api/v1/runs", json={"ticker": "../x", "analysis_date": "2999-01-01",
                                            "analysts": [], "settings_revision": 0})
    keys = {e["key"] for e in bad.json()["error"]["field_errors"]}
    assert bad.status_code == 422 and keys == {"ticker", "analysis_date", "analysts"}

    stale = client.post("/api/v1/runs", json={"ticker": "AAPL", "analysis_date": "2026-01-09",
                                              "analysts": ["market"], "settings_revision": 7})
    assert stale.status_code == 409

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    missing = client.post("/api/v1/runs", json={"ticker": "AAPL", "analysis_date": "2026-01-09",
                                                "analysts": ["market"], "settings_revision": 0})
    assert missing.json()["error"]["code"] == "CREDENTIAL_MISSING"

    client.put("/api/v1/credentials", json={"set": {"OPENAI_API_KEY": "sk-test-0123456789abcdef"}})
    body = {"ticker": "aapl", "analysis_date": "2026-01-09", "analysts": ["news", "market"],
            "settings_revision": 0}
    created = client.post("/api/v1/runs", json=body, headers={"Idempotency-Key": "k1"})
    assert created.status_code == 202
    run = created.json()
    assert run["ticker"] == "AAPL" and run["status"] == "queued"
    assert run["request"]["analysts"] == ["market", "news"]
    again = client.post("/api/v1/runs", json=body, headers={"Idempotency-Key": "k1"})
    assert again.status_code == 200 and again.json()["id"] == run["id"]
    assert client.get("/api/v1/runs").json()["total"] == 1

    events = client.get(f"/api/v1/runs/{run['id']}/events/list").json()["items"]
    assert [e["type"] for e in events] == ["queued"]
    assert client.post(f"/api/v1/runs/{run['id']}/cancel", json={}).json()["status"] == "cancelled"
    assert client.get(f"/api/v1/runs/{run['id']}").json()["status"] == "cancelled"
    assert client.post(f"/api/v1/runs/{run['id']}/cancel", json={}).status_code == 409


@pytest.mark.unit
def test_artifacts_are_served_by_id_only(client):
    assert client.get("/api/v1/runs/nope/artifacts/x").status_code == 404
    assert client.get("/api/v1/runs/..%2F..%2Fetc/artifacts/passwd").status_code == 404
