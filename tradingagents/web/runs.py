"""Creating analysis runs and running them, one at a time, in worker processes."""

from __future__ import annotations

import contextlib
import json
import os
import secrets as pysecrets
import signal
import sqlite3
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

import tradingagents
from tradingagents.web import db, events
from tradingagents.web.credentials import CredentialStore
from tradingagents.web.errors import ApiError
from tradingagents.web.i18n import both, tr
from tradingagents.web.paths import atomic_write
from tradingagents.web.redact import redact_url
from tradingagents.web.settings import (
    SettingsError,
    SettingsStore,
    effective_config,
    effective_env,
    validate_config_values,
)

ANALYST_ORDER = ["market", "social", "news", "fundamentals"]


class PortfolioChoice(BaseModel):
    mode: Literal["none", "flat", "snapshot"] = "none"
    id: str | None = None
    version: int | None = None


class ReportOptions(BaseModel):
    save: bool = True
    html: bool = True


class RunCreate(BaseModel):
    ticker: str
    analysis_date: str
    asset_type: Literal["stock", "crypto"] | None = None
    analysts: list[str] = Field(default_factory=lambda: list(ANALYST_ORDER))
    settings_revision: int
    overrides: dict = Field(default_factory=dict)
    portfolio: PortfolioChoice = Field(default_factory=PortfolioChoice)
    checkpoint_enabled: bool | None = None
    report_options: ReportOptions = Field(default_factory=ReportOptions)


def _new_run_id() -> str:
    return f"r{datetime.now().strftime('%Y%m%d%H%M%S')}{pysecrets.token_hex(3)}"


def validate_inputs(req: RunCreate) -> dict:
    """The request's ticker, date, asset type and analysts, checked the way the CLI checks them."""
    from cli.models import AssetType
    from cli.prompts import detect_asset_type, parse_analysis_date, parse_analysts, parse_ticker

    errors = []
    ticker = date = None
    try:
        ticker = parse_ticker(req.ticker)
    except ValueError:
        errors.append({"key": "ticker", "message": tr("无法识别的代码，例如 AAPL、0700.HK、BTC-USD", "Unrecognized symbol, e.g. AAPL, 0700.HK, BTC-USD")})
    try:
        date = parse_analysis_date(req.analysis_date)
    except ValueError as exc:
        message = (tr("分析日期不能晚于今天", "The analysis date cannot be in the future") if "future" in str(exc)
                   else tr("日期格式应为 YYYY-MM-DD", "Use the YYYY-MM-DD format"))
        errors.append({"key": "analysis_date", "message": message})
    asset_type = req.asset_type or (detect_asset_type(ticker).value if ticker else "stock")
    analysts: list[str] = []
    try:
        names = ",".join("sentiment" if a == "social" else a for a in req.analysts)
        analysts = [a.value for a in parse_analysts(names, AssetType(asset_type))]
        analysts = [a for a in ANALYST_ORDER if a in analysts]
    except ValueError as exc:
        text = str(exc)
        if "not available for crypto" in text:
            text = tr("加密资产不提供基本面分析师", "Crypto assets have no fundamentals analyst")
        elif "at least one" in text:
            text = tr("至少选择一位分析师", "Choose at least one analyst")
        errors.append({"key": "analysts", "message": text})
    if errors:
        raise ApiError(422, "INVALID_INPUT", tr("请检查标出的输入。", "Check the highlighted fields."), field_errors=errors)
    return {"ticker": ticker, "analysis_date": date, "asset_type": asset_type, "analysts": analysts}


def check_providers(config: dict, credentials: CredentialStore) -> None:
    """Each provider a model tier uses has its endpoint and credential before the run is queued."""
    from tradingagents.llm_clients.api_key_env import get_api_key_env
    from tradingagents.llm_clients.factory import tier_provider
    from tradingagents.llm_clients.openai_client import (
        OPENAI_COMPATIBLE_PROVIDERS,
        SIGNED_IN_PROVIDERS,
        check_endpoint,
    )

    resolved = credentials.resolved()
    for tier in ("quick", "deep"):
        provider = tier_provider(config, tier)
        on_main = provider == config["llm_provider"].lower()
        url = config.get(f"{tier}_think_backend_url") or (config.get("backend_url") if on_main else None)
        try:
            check_endpoint(provider, url)
        except ValueError as exc:
            raise ApiError(422, "PROVIDER_ENDPOINT_INVALID", str(exc), provider=provider) from None
        spec = OPENAI_COMPATIBLE_PROVIDERS.get(provider)
        if spec is not None and spec.require_base_url and not url:
            raise ApiError(422, "PROVIDER_ENDPOINT_MISSING", tr(f"{provider} 需要设置端点 URL。", f"{provider} needs an endpoint URL."),
                           provider=provider)
        if provider in SIGNED_IN_PROVIDERS:
            from tradingagents.llm_clients import chatgpt_auth

            if not chatgpt_auth.signed_in_as():
                raise ApiError(422, "PROVIDER_SIGN_IN_REQUIRED", tr("需要先登录 ChatGPT。", "Sign in to ChatGPT first."),
                               provider=provider, details=tr("在设置的“模型与认证”中登录。", "Sign in under Settings → Models & auth."))
            continue
        env = get_api_key_env(provider)
        if env and not (spec is not None and spec.key_optional) and not resolved.get(env):
            raise ApiError(422, "CREDENTIAL_MISSING", tr(f"{provider} 的 API Key 尚未设置。", f"The {provider} API key is not set."),
                           details=tr(f"在设置中填写 {env}。", f"Set {env} in Settings."), provider=provider)


def config_summary(config: dict) -> dict:
    """What produced a run, safe to show: endpoints redacted, no paths beyond results."""
    from tradingagents.llm_clients.factory import tier_provider

    return {
        "llm_provider": config.get("llm_provider"),
        "quick_think_provider": tier_provider(config, "quick"),
        "deep_think_provider": tier_provider(config, "deep"),
        "quick_think_llm": config.get("quick_think_llm"),
        "deep_think_llm": config.get("deep_think_llm"),
        "backend_url": redact_url(config.get("backend_url")),
        "output_language": config.get("output_language"),
        "max_debate_rounds": config.get("max_debate_rounds"),
        "max_risk_discuss_rounds": config.get("max_risk_discuss_rounds"),
        "checkpoint_enabled": config.get("checkpoint_enabled"),
        "openai_reasoning_effort": config.get("openai_reasoning_effort"),
        "anthropic_effort": config.get("anthropic_effort"),
        "google_thinking_level": config.get("google_thinking_level"),
        "temperature": config.get("temperature"),
        "data_vendors": config.get("data_vendors"),
        "tool_vendors": config.get("tool_vendors"),
        "version": tradingagents.__version__,
    }


def _load_portfolio(conn: sqlite3.Connection, choice: PortfolioChoice) -> dict | None:
    """The PortfolioContext the run sees, plus which saved snapshot it came from."""
    if choice.mode == "none":
        return None
    if choice.mode == "flat":
        return {"context": {"cash": None, "currency": None, "positions": []}, "source": "flat"}
    if not choice.id:
        raise ApiError(422, "INVALID_INPUT", tr("请选择持仓快照。", "Choose a portfolio snapshot."),
                       field_errors=[{"key": "portfolio", "message": tr("未选择快照", "No snapshot chosen")}])
    if choice.version is None:
        row = conn.execute("SELECT * FROM portfolios WHERE id = ? ORDER BY version DESC LIMIT 1",
                           (choice.id,)).fetchone()
    else:
        row = conn.execute("SELECT * FROM portfolios WHERE id = ? AND version = ?",
                           (choice.id, choice.version)).fetchone()
    if row is None:
        raise ApiError(404, "PORTFOLIO_NOT_FOUND", tr("找不到所选持仓快照。", "The chosen portfolio snapshot was not found."))
    data = json.loads(row["data_json"])
    return {"context": data, "source": "snapshot", "id": row["id"], "version": row["version"],
            "name": row["name"], "as_of": row["as_of"]}


class RunService:
    _lock = threading.Lock()   # one creation at a time, so an idempotency key is checked atomically

    def __init__(self, conn: sqlite3.Connection, credentials: CredentialStore, manager: RunManager):
        self.conn = conn
        self.credentials = credentials
        self.manager = manager

    def create(self, req: RunCreate, idempotency_key: str | None) -> tuple[dict, bool]:
        with self._lock:
            if idempotency_key:
                row = self.conn.execute("SELECT id FROM runs WHERE idempotency_key = ?",
                                        (idempotency_key,)).fetchone()
                if row:
                    return {"id": row["id"]}, False

            inputs = validate_inputs(req)
            store = SettingsStore(self.conn)
            current = store.current()
            if req.settings_revision != current.revision:
                raise ApiError(409, "SETTINGS_REVISION_STALE",
                               tr("设置已在其他地方更新，请确认后重新提交。",
                                  "Settings changed elsewhere; review and submit again."),
                               details=tr(f"提交的是第 {req.settings_revision} 版，当前为第 {current.revision} 版。",
                                          f"Submitted revision {req.settings_revision}; "
                                          f"the current one is {current.revision}."))
            try:
                overrides = validate_config_values(req.overrides)
            except SettingsError as exc:
                raise ApiError(422, "INVALID_INPUT", tr("本次覆盖设置无效。", "This run's overrides are invalid."),
                               field_errors=exc.field_errors) from None
            if req.checkpoint_enabled is not None:
                overrides["checkpoint_enabled"] = req.checkpoint_enabled
            config = effective_config(current, overrides)
            check_providers(config, self.credentials)
            portfolio = _load_portfolio(self.conn, req.portfolio)

            run_id = _new_run_id()
            run_dir = Path(config["results_dir"]) / "web_runs" / run_id
            run_dir.mkdir(parents=True, exist_ok=False)
            os.chmod(run_dir, 0o700)
            job = {
                "run_id": run_id,
                "run_dir": str(run_dir),
                "db_path": str(db.db_path()),
                **inputs,
                "config": config,
                "portfolio": portfolio["context"] if portfolio else None,
                "report_options": req.report_options.model_dump(),
            }
            atomic_write(run_dir / "job.json", json.dumps(job, ensure_ascii=False, indent=2))
            request = {**req.model_dump(), **inputs}
            now = events.now_iso()
            with db.transaction(self.conn):
                self.conn.execute(
                    "INSERT INTO runs (id, kind, status, ticker, analysis_date, asset_type, request_json,"
                    " config_json, settings_revision, portfolio_json, run_dir, idempotency_key, created_at)"
                    " VALUES (?, 'analysis', 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (run_id, inputs["ticker"], inputs["analysis_date"], inputs["asset_type"],
                     json.dumps(request, ensure_ascii=False),
                     json.dumps(config_summary(config), ensure_ascii=False),
                     current.revision,
                     json.dumps(portfolio, ensure_ascii=False) if portfolio else None,
                     str(run_dir), idempotency_key, now),
                )
            events.append(self.conn, run_id, "queued",
                          payload={"position": self.manager.queue_position(run_id)})
            self.manager.wake()
            return {"id": run_id}, True

    def cancel(self, run_id: str, force: bool) -> dict:
        row = self.conn.execute("SELECT status, worker_pid FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise ApiError(404, "RUN_NOT_FOUND", tr("找不到这次运行。", "Run not found."))
        status = row["status"]
        if status in events.TERMINAL_STATUSES:
            raise ApiError(409, "RUN_FINISHED", tr("这次运行已经结束。", "This run has already finished."))
        if status == "queued" and not self.manager.is_active(run_id):
            with db.transaction(self.conn):
                self.conn.execute(
                    "UPDATE runs SET status = 'cancelled', cancel_requested = 1, finished_at = ? WHERE id = ?",
                    (events.now_iso(), run_id))
            events.append(self.conn, run_id, "run.cancelled", severity="warning",
                          payload=both("排队中的任务已取消。", "The queued run was cancelled."))
            return {"status": "cancelled"}
        with db.transaction(self.conn):
            self.conn.execute("UPDATE runs SET status = 'cancelling', cancel_requested = 1 WHERE id = ?",
                              (run_id,))
        events.append(self.conn, run_id, "run.cancelling", severity="warning",
                      payload={"force": force, **(both("已请求停止；进行中的模型调用结束后退出。",
                                                   "Stop requested; the run exits after the model call in flight.")
                                              if not force else both("正在强制终止进程。",
                                                                     "Terminating the process."))})
        self.manager.signal(run_id, row["worker_pid"], force)
        return {"status": "cancelling"}


class RunManager:
    """A bounded serial queue: one analysis worker at a time, others wait as queued."""

    def __init__(self, credentials: CredentialStore):
        self.credentials = credentials
        self.conn = db.connect()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._active: dict[str, subprocess.Popen] = {}
        self._adopted: dict[str, int] = {}
        self._thread = threading.Thread(target=self._loop, name="run-manager", daemon=True)

    def start(self) -> None:
        self._reconcile_startup()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def wake(self) -> None:
        self._wake.set()

    def is_active(self, run_id: str) -> bool:
        return run_id in self._active or run_id in self._adopted

    def busy(self) -> bool:
        return bool(self._active or self._adopted)

    def queue_position(self, run_id: str) -> int:
        rows = self.conn.execute("SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at").fetchall()
        ids = [r["id"] for r in rows]
        return ids.index(run_id) + 1 if run_id in ids else 0

    def signal(self, run_id: str, pid: int | None, force: bool) -> None:
        proc = self._active.get(run_id)
        target = proc.pid if proc else (pid if run_id in self._adopted else None)
        if target is None:
            return
        with contextlib.suppress(ProcessLookupError):
            os.kill(target, signal.SIGKILL if force else signal.SIGTERM)

    def _reconcile_startup(self) -> None:
        rows = self.conn.execute(
            "SELECT id, worker_pid FROM runs WHERE status IN ('running', 'cancelling')").fetchall()
        for row in rows:
            if row["worker_pid"] and _alive(row["worker_pid"]):
                self._adopted[row["id"]] = row["worker_pid"]
            else:
                self._interrupt(row["id"], both("服务重启时该任务的进程已不在运行。",
                                                 "The run's process was gone when the service restarted."))

    def _interrupt(self, run_id: str, message: dict) -> None:
        with db.transaction(self.conn):
            self.conn.execute(
                "UPDATE runs SET status = 'interrupted', finished_at = ? WHERE id = ?",
                (events.now_iso(), run_id))
        events.append(self.conn, run_id, "run.interrupted", severity="error",
                      payload={"code": "WORKER_LOST", **message})

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._tick()
            except Exception as exc:   # the queue must keep going; the failure is logged per run
                print(f"run manager: {exc!r}", file=sys.stderr)
            self._wake.wait(0.5)
            self._wake.clear()

    def _tick(self) -> None:
        for run_id, proc in list(self._active.items()):
            code = proc.poll()
            if code is not None:
                del self._active[run_id]
                self._after_exit(run_id, both(f"worker 进程退出（代码 {code}）但没有报告结果。",
                                              f"The worker exited (code {code}) without reporting a result."))
        for run_id, pid in list(self._adopted.items()):
            if not _alive(pid):
                del self._adopted[run_id]
                self._after_exit(run_id, both("worker 进程已退出但没有报告结果。",
                                              "The worker exited without reporting a result."))
        if self.busy():
            return
        row = self.conn.execute(
            "SELECT id, run_dir, settings_revision FROM runs WHERE status = 'queued' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row is not None:
            self._spawn(row["id"], Path(row["run_dir"]), row["settings_revision"])

    def _after_exit(self, run_id: str, message: dict) -> None:
        row = self.conn.execute("SELECT status, cancel_requested FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None or row["status"] in events.TERMINAL_STATUSES:
            return
        if row["cancel_requested"]:
            with db.transaction(self.conn):
                self.conn.execute("UPDATE runs SET status = 'cancelled', finished_at = ? WHERE id = ?",
                                  (events.now_iso(), run_id))
            events.append(self.conn, run_id, "run.cancelled", severity="warning",
                          payload=both("进程已终止；已完成的报告保留。", "The process ended; finished reports are kept."))
        else:
            with db.transaction(self.conn):
                self.conn.execute(
                    "UPDATE runs SET status = 'failed', finished_at = ?, error_json = ? WHERE id = ?",
                    (events.now_iso(), json.dumps({"code": "WORKER_EXITED", **message},
                                                  ensure_ascii=False), run_id))
            events.append(self.conn, run_id, "run.failed", severity="error",
                          payload={"code": "WORKER_EXITED", **message,
                                   **both("查看运行目录中的 worker.log。", "See worker.log in the run directory.",
                                          key="details")})

    def _spawn(self, run_id: str, run_dir: Path, revision_no: int | None) -> None:
        revision = SettingsStore(self.conn).get(revision_no or 0)
        env = dict(os.environ)
        if revision is not None:
            env.update(effective_env(revision))
        env.update(self.credentials.resolved())
        package_root = str(Path(tradingagents.__file__).resolve().parents[1])
        env["PYTHONPATH"] = os.pathsep.join(filter(None, [package_root, env.get("PYTHONPATH")]))
        env["TRADINGAGENTS_NO_UPDATE_CHECK"] = "1"
        log = os.fdopen(os.open(run_dir / "worker.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600), "ab")
        try:
            proc = subprocess.Popen(
                [sys.executable, "-m", "tradingagents.web.worker", str(run_dir)],
                env=env, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                cwd=os.getcwd(), start_new_session=True,
            )
        except OSError as exc:
            log.close()
            with db.transaction(self.conn):
                self.conn.execute("UPDATE runs SET status = 'failed', finished_at = ? WHERE id = ?",
                                  (events.now_iso(), run_id))
            events.append(self.conn, run_id, "run.failed", severity="error",
                          payload={"code": "WORKER_START_FAILED", **both("无法启动分析进程。", "Could not start the analysis process."),
                                   "details": str(exc)})
            return
        log.close()
        self._active[run_id] = proc
        with db.transaction(self.conn):
            self.conn.execute("UPDATE runs SET worker_pid = ? WHERE id = ?", (proc.pid, run_id))


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True
