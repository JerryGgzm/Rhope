"""One analysis run in its own process: ``python -m tradingagents.web.worker <run_dir>``.

The API process writes ``job.json`` (the frozen request and config, no secrets)
and starts this with the run's credentials in its environment. The lifecycle
mirrors cli/run.py: build the graph, stream it, merge the state, record the
decision, clear the checkpoint, save the reports. Every step is an event.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import time
import traceback
import zipfile
from pathlib import Path

from tradingagents.web import db, events
from tradingagents.web.credentials import CREDENTIALS
from tradingagents.web.errors import classify
from tradingagents.web.paths import atomic_write
from tradingagents.web.redact import redact

STAGES = ("analysts", "research", "trader", "risk", "decision")

# The report sections a run fills, as (section id, path into the state).
SECTIONS = (
    ("market_report", ("market_report",)),
    ("sentiment_report", ("sentiment_report",)),
    ("news_report", ("news_report",)),
    ("fundamentals_report", ("fundamentals_report",)),
    ("bull_history", ("investment_debate_state", "bull_history")),
    ("bear_history", ("investment_debate_state", "bear_history")),
    ("investment_plan", ("investment_plan",)),
    ("trader_investment_plan", ("trader_investment_plan",)),
    ("aggressive_history", ("risk_debate_state", "aggressive_history")),
    ("conservative_history", ("risk_debate_state", "conservative_history")),
    ("neutral_history", ("risk_debate_state", "neutral_history")),
    ("final_trade_decision", ("final_trade_decision",)),
)

MESSAGE_LIMIT = 4000
PREVIEW_LIMIT = 400


class Cancelled(Exception):
    pass


def _dig(state: dict, path: tuple[str, ...]):
    value = state
    for key in path:
        value = (value or {}).get(key) if isinstance(value, dict) else None
    return value


def _text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(
            item.get("text", "") if isinstance(item, dict) else str(item) for item in value
        )
    return "" if value is None else str(value)


def _clip(text: str, limit: int) -> tuple[str, bool]:
    return (text, False) if len(text) <= limit else (text[:limit], True)


class Emitter:
    def __init__(self, conn, run_id: str, secrets: list[str]):
        self.conn = conn
        self.run_id = run_id
        self.secrets = secrets
        self.warnings = 0

    def emit(self, type_: str, *, stage=None, agent=None, severity="info", payload=None):
        if severity in ("warning", "error"):
            self.warnings += 1
        clean = _redact_payload(payload or {}, self.secrets)
        return events.append(self.conn, self.run_id, type_, stage=stage, agent=agent,
                             severity=severity, payload=clean)


def _redact_payload(value, secrets):
    if isinstance(value, str):
        return redact(value, secrets)
    if isinstance(value, dict):
        return {k: _redact_payload(v, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_payload(v, secrets) for v in value]
    return value


class _WarningsToEvents(logging.Handler):
    """Engine warnings (vendor fallbacks, settlement trouble) become visible events."""

    def __init__(self, emitter: Emitter, stage_ref: list):
        super().__init__(level=logging.WARNING)
        self.emitter = emitter
        self.stage_ref = stage_ref

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
            self.emitter.emit("warning", stage=self.stage_ref[0], severity="warning",
                              payload={"source": record.name, "message": message[:1000]})
        except Exception:
            pass


def _set_run(conn, run_id: str, **fields) -> None:
    columns = ", ".join(f"{k} = ?" for k in fields)
    with db.transaction(conn):
        conn.execute(f"UPDATE runs SET {columns} WHERE id = ?", (*fields.values(), run_id))


def _register_artifact(conn, run_id: str, run_dir: Path, kind: str, name: str, path: Path,
                       media_type: str) -> None:
    artifact_id = f"{run_id}-{kind}"
    with db.transaction(conn):
        conn.execute(
            "INSERT OR REPLACE INTO artifacts (id, run_id, kind, name, rel_path, media_type, size, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (artifact_id, run_id, kind, name, str(path.relative_to(run_dir)), media_type,
             path.stat().st_size, events.now_iso()),
        )


def _state_record(final_state: dict, settings: dict) -> dict:
    """The JSON-safe part of the final state, like the engine's own state log."""
    from tradingagents.agents.rating import run_rating

    record = {key: _text(_dig(final_state, path)) for key, path in SECTIONS}
    record.update({
        "company_of_interest": final_state.get("company_of_interest"),
        "trade_date": final_state.get("trade_date"),
        "final_rating": run_rating(final_state) if final_state.get("final_trade_decision") else None,
        "memory_note": final_state.get("memory_note") or "",
        "run_settings": settings,
    })
    return record


class Tracker:
    """Turns streamed chunks into stage, agent and report events, like the CLI's live view."""

    def __init__(self, emitter: Emitter, run_dir: Path, analyst_specs):
        self.emitter = emitter
        self.run_dir = run_dir
        self.specs = analyst_specs
        self.sections: dict[str, str] = {}
        self.stage_state = dict.fromkeys(STAGES, "pending")
        self.agents_done: set[str] = set()
        self.stage_ref = ["analysts"]
        self._seen_messages: set = set()
        self._tool_names: dict[str, str] = {}

    def start_stage(self, stage: str) -> None:
        if self.stage_state[stage] == "pending":
            self.stage_state[stage] = "running"
            self.stage_ref[0] = stage
            self.emitter.emit("stage.started", stage=stage)

    def complete_stage(self, stage: str) -> None:
        if self.stage_state[stage] == "pending":
            self.start_stage(stage)
        if self.stage_state[stage] == "running":
            self.stage_state[stage] = "completed"
            self.emitter.emit("stage.completed", stage=stage)

    def messages(self, messages) -> None:
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

        for message in messages:
            key = getattr(message, "id", None) or (type(message).__name__, hash(_text(message.content)))
            if key in self._seen_messages:
                continue
            self._seen_messages.add(key)
            stage = self.stage_ref[0]
            content = _text(getattr(message, "content", "")).strip()
            if isinstance(message, ToolMessage):
                tool = getattr(message, "name", None) or self._tool_names.get(
                    getattr(message, "tool_call_id", ""), "tool")
                preview, _ = _clip(content, PREVIEW_LIMIT)
                code = None
                for sentinel in ("NO_DATA_AVAILABLE", "DATA_UNAVAILABLE"):
                    if content.startswith(sentinel):
                        code = sentinel
                failed = getattr(message, "status", None) == "error"
                self.emitter.emit(
                    "tool.failed" if failed else "tool.completed", stage=stage,
                    severity="warning" if (code or failed) else "info",
                    payload={"tool": tool, "chars": len(content), "preview": preview, "code": code},
                )
                continue
            if isinstance(message, HumanMessage):
                continue
            if isinstance(message, AIMessage):
                for call in message.tool_calls or []:
                    name = call.get("name") if isinstance(call, dict) else call.name
                    args = call.get("args") if isinstance(call, dict) else call.args
                    call_id = call.get("id") if isinstance(call, dict) else getattr(call, "id", None)
                    if call_id:
                        self._tool_names[call_id] = name
                    args_text, _ = _clip(json.dumps(args, ensure_ascii=False, default=str), 500)
                    self.emitter.emit("tool.started", stage=stage,
                                      payload={"tool": name, "args": args_text})
                if content:
                    text, clipped = _clip(content, MESSAGE_LIMIT)
                    self.emitter.emit("message", stage=stage,
                                      payload={"kind": "agent", "text": text, "truncated": clipped})

    def chunk(self, chunk: dict) -> None:
        changed = []
        for section, path in SECTIONS:
            value = _text(_dig(chunk, path)).strip()
            if value and value != self.sections.get(section):
                self.sections[section] = value
                changed.append(section)
        if changed:
            atomic_write(self.run_dir / "sections.json",
                         json.dumps(self.sections, ensure_ascii=False), mode=0o600)
            for section in changed:
                self.emitter.emit("report.updated", stage=self.stage_ref[0],
                                  payload={"section": section, "chars": len(self.sections[section])})

        for spec in self.specs:
            if spec.key not in self.agents_done and self.sections.get(spec.report_key):
                self.agents_done.add(spec.key)
                self.emitter.emit("agent.completed", stage="analysts", agent=spec.key)
        if all(spec.key in self.agents_done for spec in self.specs):
            self.complete_stage("analysts")
            self.start_stage("research")
        if self.sections.get("bull_history") or self.sections.get("bear_history"):
            self.start_stage("research")
        if self.sections.get("investment_plan"):
            self.complete_stage("research")
            self.start_stage("trader")
        if self.sections.get("trader_investment_plan"):
            self.complete_stage("trader")
            self.start_stage("risk")
        if self.sections.get("final_trade_decision"):
            self.complete_stage("risk")
            self.complete_stage("decision")


def run(job: dict, conn, emitter: Emitter, cancel: list[bool]) -> None:
    from cli.stats_handler import StatsCallbackHandler
    from tradingagents.agents.rating import is_review, run_rating
    from tradingagents.graph.analyst_execution import build_analyst_execution_plan
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.portfolio import PortfolioContext

    run_id = job["run_id"]
    run_dir = Path(job["run_dir"])
    ticker, trade_date, asset_type = job["ticker"], job["analysis_date"], job["asset_type"]
    config = job["config"]
    portfolio = PortfolioContext.model_validate(job["portfolio"]) if job.get("portfolio") is not None else None

    stats = StatsCallbackHandler()
    plan = build_analyst_execution_plan(job["analysts"])
    tracker = Tracker(emitter, run_dir, plan.specs)
    handler = _WarningsToEvents(emitter, tracker.stage_ref)
    logging.getLogger("tradingagents").addHandler(handler)
    logging.getLogger("tradingagents").setLevel(logging.WARNING)

    with db.transaction(conn):
        conn.execute("UPDATE runs SET status = 'running', started_at = ?, worker_pid = ?"
                     " WHERE id = ? AND status = 'queued'", (events.now_iso(), os.getpid(), run_id))
    if cancel[0] or conn.execute("SELECT cancel_requested FROM runs WHERE id = ?",
                                 (run_id,)).fetchone()[0]:
        raise Cancelled()
    emitter.emit("run.started", payload={"pid": os.getpid(), "ticker": ticker,
                                         "analysis_date": trade_date, "asset_type": asset_type})

    graph = TradingAgentsGraph(job["analysts"], config=config, debug=False, callbacks=[stats])
    init_state = graph.create_run_state(ticker, trade_date, asset_type, portfolio)
    args = graph.propagator.get_graph_args(callbacks=[stats])
    tid = graph.begin_checkpoint(ticker, trade_date, asset_type, portfolio)
    if tid is not None:
        args.setdefault("config", {}).setdefault("configurable", {})["thread_id"] = tid
        resuming = bool(getattr(graph, "_resuming", False))
        emitter.emit("checkpoint", payload={"resuming": resuming})

    tracker.start_stage("analysts")
    for spec in plan.specs:
        emitter.emit("agent.started", stage="analysts", agent=spec.key)

    last_stats, last_stats_at = None, 0.0
    trace: list[dict] = []
    try:
        for messages, chunk in graph.stream_run(graph.checkpoint_input(init_state), **args):
            if cancel[0]:
                raise Cancelled()
            tracker.messages(messages)
            if chunk is not None:
                tracker.chunk(chunk)
                trace.append(chunk)
            now = time.monotonic()
            current = stats.get_stats()
            if current != last_stats and now - last_stats_at >= 2:
                last_stats, last_stats_at = current, now
                emitter.emit("stats.updated", payload=current)
                _set_run(conn, run_id, stats_json=json.dumps(current))
        if cancel[0]:
            raise Cancelled()

        final_state: dict = {}
        for chunk in trace:
            final_state.update(chunk)

        emitter.emit("run.finalizing", stage="decision",
                     payload={"message": "写入决策日志、清理断点并保存报告"})
        graph.record_decision(ticker, trade_date, final_state)
        graph.clear_checkpoint_on_success(ticker, trade_date, asset_type, portfolio)
    finally:
        graph.end_checkpoint()

    settings = graph.run_settings()
    record = _state_record(final_state, settings)
    atomic_write(run_dir / "final_state.json", json.dumps(record, ensure_ascii=False, indent=2))
    _register_artifact(conn, run_id, run_dir, "state", f"{ticker}_{trade_date}_state.json",
                       run_dir / "final_state.json", "application/json")

    if record["memory_note"]:
        emitter.emit("warning", stage="decision", severity="warning",
                     payload={"source": "memory", "message": record["memory_note"]})

    rating = run_rating(final_state) if final_state.get("final_trade_decision") else None
    options = job.get("report_options") or {}
    if options.get("save", True):
        report_dir = run_dir / "report"
        try:
            graph.save_reports(final_state, ticker, report_dir, html=options.get("html", True))
            _register_artifact(conn, run_id, run_dir, "report_md", f"{ticker}_{trade_date}.md",
                               report_dir / "complete_report.md", "text/markdown; charset=utf-8")
            if options.get("html", True):
                _register_artifact(conn, run_id, run_dir, "report_html", f"{ticker}_{trade_date}.html",
                                   report_dir / "complete_report.html", "text/html; charset=utf-8")
            archive = run_dir / "report.zip"
            with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
                for path in sorted(report_dir.rglob("*")):
                    if path.is_file():
                        zf.write(path, path.relative_to(report_dir))
            _register_artifact(conn, run_id, run_dir, "report_zip", f"{ticker}_{trade_date}_reports.zip",
                               archive, "application/zip")
            emitter.emit("artifact.saved", stage="decision", payload={"kinds": ["report_md", "report_html", "report_zip"]})
        except Exception as exc:
            emitter.emit("artifact.failed", stage="decision", severity="warning",
                         payload=classify(exc, emitter.secrets))

    review = bool(rating and is_review(rating))
    if review:
        emitter.emit("warning", stage="decision", severity="warning",
                     payload={"source": "rating", "code": "REVIEW",
                              "message": "无法从最终决策中读出评级，本次记录为“需复核”，不是交易建议。"})
    if not rating:
        emitter.emit("warning", stage="decision", severity="warning",
                     payload={"source": "decision", "message": "本次没有产生最终决策。"})
    final_stats = stats.get_stats()
    status = "completed_with_warnings" if emitter.warnings else "completed"
    emitter.emit("run.completed", payload={"status": status, "rating": rating, "review": review,
                                           "stats": final_stats})
    _set_run(conn, run_id, status=status, finished_at=events.now_iso(), rating=rating,
             stats_json=json.dumps(final_stats), warnings=emitter.warnings)


def main(argv: list[str]) -> int:
    run_dir = Path(argv[1])
    job = json.loads((run_dir / "job.json").read_text(encoding="utf-8"))
    run_id = job["run_id"]
    conn = db.connect(Path(job["db_path"]))
    secrets = [os.environ[name] for name in CREDENTIALS if len(os.environ.get(name, "")) >= 6]
    emitter = Emitter(conn, run_id, secrets)

    cancel = [False]

    def request_stop(signum, frame):
        cancel[0] = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    try:
        run(job, conn, emitter, cancel)
        return 0
    except Cancelled:
        emitter.emit("run.cancelled", severity="warning",
                     payload={"message": "已按请求停止；已完成的报告保留。"})
        _set_run(conn, run_id, status="cancelled", finished_at=events.now_iso())
        return 0
    except BaseException as exc:
        error = classify(exc, secrets)
        error["traceback"] = redact(traceback.format_exc(limit=12), secrets)
        stage = None
        try:
            row = conn.execute(
                "SELECT event_json FROM events WHERE run_id = ? AND json_extract(event_json, '$.type') = 'stage.started'"
                " ORDER BY sequence DESC LIMIT 1", (run_id,)).fetchone()
            stage = json.loads(row["event_json"])["stage"] if row else None
        except Exception:
            pass
        emitter.emit("run.failed", stage=stage, severity="error", payload=error)
        _set_run(conn, run_id, status="failed", finished_at=events.now_iso(),
                 error_json=json.dumps({**error, "stage": stage}, ensure_ascii=False))
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
