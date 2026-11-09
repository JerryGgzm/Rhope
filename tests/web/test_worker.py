"""A web run's worker, end to end with scripted models: the CLI's lifecycle, as events."""

from __future__ import annotations

import copy
import json
import zipfile

import pytest

from tests.test_graph_end_to_end import TRADE_DATE, ScriptedModel, _Client, offline  # noqa: F401
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph import trading_graph
from tradingagents.web import db, events, worker


def _job(tmp_path, **config):
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    cfg.update(results_dir=str(tmp_path / "results"), data_cache_dir=str(tmp_path / "cache"),
               memory_log_path=str(tmp_path / "log.md"), **config)
    run_dir = tmp_path / "results" / "web_runs" / "r1"
    run_dir.mkdir(parents=True)
    return {"run_id": "r1", "run_dir": str(run_dir), "db_path": str(db.db_path()),
            "ticker": "NVDA", "analysis_date": TRADE_DATE, "asset_type": "stock",
            "analysts": ["market", "social", "news", "fundamentals"], "config": cfg,
            "portfolio": None, "report_options": {"save": True, "html": True}}


def _insert(conn, job):
    db.init()
    conn.execute(
        "INSERT INTO runs (id, status, ticker, analysis_date, asset_type, request_json, config_json,"
        " run_dir, created_at) VALUES (?, 'queued', ?, ?, ?, '{}', '{}', ?, ?)",
        (job["run_id"], job["ticker"], job["analysis_date"], job["asset_type"], job["run_dir"],
         events.now_iso()))


@pytest.fixture
def scripted(monkeypatch):
    model = ScriptedModel(structured=True)
    monkeypatch.setattr(trading_graph, "create_tier_client", lambda config, tier, **k: _Client(model))
    return model


def _types(conn):
    return [e["type"] for e in events.since(conn, "r1", 0, 10_000)]


@pytest.mark.unit
def test_a_run_streams_its_stages_and_saves_its_reports(tmp_path, offline, scripted):  # noqa: F811
    db.init()
    conn = db.connect()
    job = _job(tmp_path)
    _insert(conn, job)
    emitter = worker.Emitter(conn, "r1", ["placeholder-secret"])

    worker.run(job, conn, emitter, [False])

    row = conn.execute("SELECT * FROM runs WHERE id = 'r1'").fetchone()
    assert row["status"] in ("completed", "completed_with_warnings")
    assert row["rating"] == "Overweight"
    types = _types(conn)
    assert types[0] == "run.started" and types[-1] == "run.completed"
    started = [e["stage"] for e in events.since(conn, "r1", 0, 10_000) if e["type"] == "stage.started"]
    completed = [e["stage"] for e in events.since(conn, "r1", 0, 10_000) if e["type"] == "stage.completed"]
    assert started == list(worker.STAGES)
    assert completed == list(worker.STAGES)
    assert {"tool.started", "tool.completed", "report.updated", "agent.completed"} <= set(types)
    sequences = [e["sequence"] for e in events.since(conn, "r1", 0, 10_000)]
    assert sequences == list(range(1, len(sequences) + 1))

    kinds = {r["kind"] for r in conn.execute("SELECT kind FROM artifacts WHERE run_id = 'r1'")}
    assert kinds == {"state", "report_md", "report_html", "report_zip"}
    run_dir = tmp_path / "results" / "web_runs" / "r1"
    assert "Overweight" in (run_dir / "report" / "complete_report.md").read_text()
    with zipfile.ZipFile(run_dir / "report.zip") as zf:
        assert "complete_report.html" in zf.namelist()
    state = json.loads((run_dir / "final_state.json").read_text())
    assert state["final_rating"] == "Overweight" and state["market_report"]
    sections = json.loads((run_dir / "sections.json").read_text())
    assert sections["final_trade_decision"]
    # The decision is logged for reflection, as a CLI run logs it.
    assert (tmp_path / "log.md").read_text().count("Overweight") >= 1


@pytest.mark.unit
def test_a_stop_request_ends_the_run_as_cancelled_keeping_what_was_written(tmp_path, offline, scripted):  # noqa: F811
    db.init()
    conn = db.connect()
    job = _job(tmp_path)
    _insert(conn, job)
    emitter = worker.Emitter(conn, "r1", [])
    cancel = [False]
    original = worker.Tracker.chunk

    def stop_after_first_report(self, chunk):
        original(self, chunk)
        if self.sections:
            cancel[0] = True

    import unittest.mock as mock

    with mock.patch.object(worker.Tracker, "chunk", stop_after_first_report), \
            pytest.raises(worker.Cancelled):
        worker.run(job, conn, emitter, cancel)
    assert "run.completed" not in _types(conn)
    assert json.loads((tmp_path / "results" / "web_runs" / "r1" / "sections.json").read_text())


@pytest.mark.unit
def test_a_vendor_fallback_is_logged_but_not_counted_as_a_warning(tmp_path):
    import logging

    db.init()
    conn = db.connect()
    _insert(conn, _job(tmp_path))
    emitter = worker.Emitter(conn, "r1", [])
    handler = worker._WarningsToEvents(emitter, ["market"])
    log = logging.getLogger("tradingagents.dataflows.router")

    log.addHandler(handler)
    try:
        log.warning("Vendor %r unavailable for %s: %s; trying next vendor.", "yfinance", "get_indicators", "x")
        log.warning("Optional %s unavailable for %s: %s", "macro", "get_macro_indicators", "y")
    finally:
        log.removeHandler(handler)

    logged = [e for e in events.since(conn, "r1", 0, 100) if e["type"] == "warning"]
    assert [e["severity"] for e in logged] == ["info", "warning"]
    assert logged[0]["payload"]["fallback"] is True
    assert emitter.warnings == 1


@pytest.mark.unit
def test_a_provider_failure_is_classified_without_leaking_the_key():
    from tradingagents.web.errors import classify

    class AuthenticationError(Exception):
        status_code = 401

    info = classify(AuthenticationError("Incorrect API key provided: sk-abcdefghijklmnop1234"),
                    ["sk-abcdefghijklmnop1234"])
    assert info["code"] == "PROVIDER_AUTH_FAILED"
    assert "sk-abcdefghijklmnop1234" not in info["details"]


@pytest.mark.unit
def test_redaction_covers_urls_headers_and_known_key_shapes():
    from tradingagents.web.redact import redact

    text = ("GET https://user:pass@relay.example/v1?api_key=abc123&x=1 "
            "Authorization: Bearer abcdefghijklmnop sk-proj-ABCDEFGHIJKLMNOPQRST mine-secret-value")
    out = redact(text, ["mine-secret-value"])
    for leaked in ("user:pass", "abc123", "abcdefghijklmnop", "sk-proj-ABCDEFGHIJKLMNOPQRST",
                   "mine-secret-value"):
        assert leaked not in out
    assert "relay.example" in out
