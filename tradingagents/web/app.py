"""The workbench HTTP API (``/api/v1``) and the built browser app."""

from __future__ import annotations

import asyncio
import hmac
import json
import secrets as pysecrets
import sqlite3
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

import tradingagents
from tradingagents.web import db, events
from tradingagents.web.credentials import CREDENTIALS, CredentialStore
from tradingagents.web.errors import ApiError
from tradingagents.web.i18n import lang_from_header, set_lang, tr
from tradingagents.web.runs import RunCreate, RunManager, RunService
from tradingagents.web.settings import RevisionConflict, SettingsError, SettingsStore, describe

STATIC_DIR = Path(__file__).parent / "static"
DEV_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

LANGUAGES = [
    ("English", "English"), ("Chinese", "中文"), ("Japanese", "日本語"), ("Korean", "한국어"),
    ("Hindi", "हिन्दी"), ("Spanish", "Español"), ("Portuguese", "Português"),
    ("French", "Français"), ("German", "Deutsch"), ("Arabic", "العربية"), ("Russian", "Русский"),
]


def _conn() -> Iterator[sqlite3.Connection]:
    c = db.connect()
    try:
        yield c
    finally:
        c.close()


Conn = Annotated[sqlite3.Connection, Depends(_conn)]


class SettingsPatch(BaseModel):
    base_revision: int
    config: dict = Field(default_factory=dict)
    reset: list[str] = Field(default_factory=list)
    env: dict = Field(default_factory=dict)
    env_reset: list[str] = Field(default_factory=list)


class CredentialsPatch(BaseModel):
    set: dict[str, str] = Field(default_factory=dict)
    clear: list[str] = Field(default_factory=list)


class CancelBody(BaseModel):
    force: bool = False


def create_app(port: int = 8765, dev: bool = False) -> FastAPI:
    db.init()
    credentials = CredentialStore()
    manager = RunManager(credentials)
    csrf_token = pysecrets.token_urlsafe(32)
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}", "127.0.0.1:5173", "localhost:5173",
                     "testserver"}
    allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}", *DEV_ORIGINS}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager.start()
        yield
        manager.stop()

    app = FastAPI(title="TradingAgents Workbench", version=tradingagents.__version__,
                  lifespan=lifespan, docs_url="/api/docs" if dev else None, redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.manager = manager
    app.state.csrf_token = csrf_token

    @app.middleware("http")
    async def guard(request: Request, call_next):
        request_id = "req_" + pysecrets.token_hex(6)
        request.state.request_id = request_id
        set_lang(lang_from_header(request.headers.get("accept-language")))
        host = request.headers.get("host", "")
        if host not in allowed_hosts:
            return JSONResponse(ApiError(421, "HOST_NOT_ALLOWED", tr("只接受本机地址访问。", "Only local addresses are accepted.")).body(request_id),
                                status_code=421)
        if request.url.path.startswith("/api/") and request.method not in SAFE_METHODS:
            origin = request.headers.get("origin")
            if origin not in allowed_origins:
                return JSONResponse(ApiError(403, "ORIGIN_NOT_ALLOWED", tr("请求来源不被允许。", "The request origin is not allowed.")).body(request_id),
                                    status_code=403)
            token = request.headers.get("x-csrf-token", "")
            if not hmac.compare_digest(token, csrf_token):
                return JSONResponse(ApiError(403, "CSRF_INVALID", tr("会话已过期，请刷新页面。", "The session expired; reload the page."),
                                             retryable=True).body(request_id), status_code=403)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return JSONResponse(exc.body(getattr(request.state, "request_id", None)), status_code=exc.status)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        from tradingagents.web.errors import classify

        info = classify(exc, credentials.secret_values())
        err = ApiError(500, "INTERNAL_ERROR", tr("服务内部错误。", "Internal service error."), details=info["details"])
        return JSONResponse(err.body(getattr(request.state, "request_id", None)), status_code=500)

    from fastapi.exceptions import RequestValidationError

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        fields = [{"key": ".".join(str(p) for p in e["loc"][1:]) or "body", "message": e["msg"]}
                  for e in exc.errors()]
        err = ApiError(422, "INVALID_INPUT", tr("请求格式不正确。", "The request is malformed."), field_errors=fields)
        return JSONResponse(err.body(getattr(request.state, "request_id", None)), status_code=422)

    # ---- session, health, capabilities -------------------------------------------------

    @app.get("/api/v1/session")
    def session():
        return {"csrf_token": csrf_token}

    @app.get("/api/v1/health")
    def health(c: Conn):
        try:
            c.execute("SELECT 1").fetchone()
            storage = "ok"
        except sqlite3.Error:
            storage = "unavailable"
        queued = c.execute("SELECT COUNT(*) FROM runs WHERE status = 'queued'").fetchone()[0]
        return {"status": "ok", "version": tradingagents.__version__, "storage": storage,
                "worker": {"busy": manager.busy(), "queued": queued}}

    @app.get("/api/v1/capabilities")
    def capabilities():
        from cli.prompts import _llm_provider_table
        from tradingagents.llm_clients.api_key_env import get_api_key_env
        from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS
        from tradingagents.llm_clients.openai_client import (
            OPENAI_COMPATIBLE_PROVIDERS,
            SIGNED_IN_PROVIDERS,
        )

        providers = []
        seen = set()
        regional = {"qwen": ("qwen-cn", tr("Qwen（中国区）", "Qwen (China)"), "https://dashscope.aliyuncs.com/compatible-mode/v1"),
                    "glm": ("glm-cn", tr("GLM（中国区）", "GLM (China)"), "https://open.bigmodel.cn/api/paas/v4/"),
                    "minimax": ("minimax-cn", tr("MiniMax（中国区）", "MiniMax (China)"), "https://api.minimaxi.com/v1")}
        rows = []
        for display, key, url in _llm_provider_table():
            rows.append((display, key, url))
            if key in regional:
                rows.append((regional[key][1], regional[key][0], regional[key][2]))
        for display, key, url in rows:
            if key in seen:
                continue
            seen.add(key)
            spec = OPENAI_COMPATIBLE_PROVIDERS.get(key)
            options = MODEL_OPTIONS.get(key, {})
            providers.append({
                "id": key,
                "label": display,
                "default_url": url,
                "key_env": get_api_key_env(key),
                "key_optional": bool(spec and spec.key_optional),
                "requires_url": bool(spec and spec.require_base_url),
                "signed_in": key in SIGNED_IN_PROVIDERS,
                "models": {mode: [{"label": label, "id": value} for label, value in opts if value != "custom"]
                           for mode, opts in options.items()},
            })
        return {
            "version": tradingagents.__version__,
            "providers": providers,
            "analysts": [
                {"id": "market", "label": tr("技术", "Technical"), "crypto": True},
                {"id": "social", "label": tr("情绪", "Sentiment"), "crypto": True},
                {"id": "news", "label": tr("新闻", "News"), "crypto": True},
                {"id": "fundamentals", "label": tr("基本面", "Fundamentals"), "crypto": False},
            ],
            "languages": [{"id": k, "label": v} for k, v in LANGUAGES],
            "depths": [{"id": "light", "rounds": 1, "label": tr("轻量", "Light")},
                       {"id": "standard", "rounds": 3, "label": tr("标准", "Standard")},
                       {"id": "deep", "rounds": 5, "label": tr("深入", "Deep")}],
            "ticker_examples": ["AAPL", "0700.HK", "600519.SS", "BTC-USD"],
        }

    @app.get("/api/v1/tickers/check")
    def check_ticker(symbol: str = Query(..., max_length=40)):
        from cli.prompts import detect_asset_type, parse_ticker

        try:
            canonical = parse_ticker(symbol)
        except ValueError:
            return {"valid": False, "input": symbol}
        return {"valid": True, "input": symbol, "symbol": canonical,
                "asset_type": detect_asset_type(canonical).value}

    # ---- settings and credentials ------------------------------------------------------

    @app.get("/api/v1/settings")
    def get_settings(c: Conn):
        revision = SettingsStore(c).current()
        return {**describe(revision), "credentials": list(credentials.status().values())}

    @app.patch("/api/v1/settings")
    def patch_settings(body: SettingsPatch, c: Conn):
        store = SettingsStore(c)
        try:
            revision = store.save(body.base_revision, body.config, body.reset, body.env, body.env_reset)
        except SettingsError as exc:
            raise ApiError(422, "INVALID_SETTINGS", tr("部分设置无效。", "Some settings are invalid."), field_errors=exc.field_errors) from None
        except RevisionConflict as exc:
            raise ApiError(409, "SETTINGS_REVISION_STALE", tr("设置已在其他标签页更新，请刷新后再改。", "Settings changed in another tab; reload before editing."),
                           details=tr(f"当前为第 {exc.current} 版。", f"Now at revision {exc.current}.")) from None
        return {**describe(revision), "credentials": list(credentials.status().values())}

    @app.put("/api/v1/credentials")
    def put_credentials(body: CredentialsPatch):
        try:
            credentials.update(body.set, body.clear)
        except KeyError as exc:
            raise ApiError(422, "UNKNOWN_CREDENTIAL", tr("未知的凭证名称。", "Unknown credential name."), details=str(exc)) from None
        return {"credentials": list(credentials.status().values())}

    # ---- runs ----------------------------------------------------------------------------

    @app.post("/api/v1/runs", status_code=202)
    def create_run(body: RunCreate, response: Response, c: Conn,
                   idempotency_key: str | None = Header(default=None, max_length=100)):
        result, created = RunService(c, credentials, manager).create(body, idempotency_key)
        if not created:
            response.status_code = 200
        return _run_view(c, result["id"])

    @app.get("/api/v1/runs")
    def list_runs(c: Conn, ticker: str | None = None,
                  status: str | None = None, limit: int = Query(50, ge=1, le=200),
                  offset: int = Query(0, ge=0)):
        where, args = [], []
        if ticker:
            where.append("ticker LIKE ?")
            args.append(ticker.strip().upper() + "%")
        if status:
            where.append("status = ?")
            args.append(status)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        total = c.execute(f"SELECT COUNT(*) FROM runs {clause}", args).fetchone()[0]
        rows = c.execute(f"SELECT * FROM runs {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                         [*args, limit, offset]).fetchall()
        return {"total": total, "items": [_summary(r) for r in rows]}

    @app.get("/api/v1/runs/{run_id}")
    def get_run(run_id: str, c: Conn):
        return _run_view(c, run_id)

    @app.get("/api/v1/runs/{run_id}/sections")
    def get_sections(run_id: str, c: Conn):
        row = _run_row(c, run_id)
        path = Path(row["run_dir"]) / "sections.json"
        try:
            return {"sections": json.loads(path.read_text(encoding="utf-8"))}
        except FileNotFoundError:
            return {"sections": {}}

    @app.get("/api/v1/runs/{run_id}/events/list")
    def list_events(run_id: str, c: Conn,
                    after: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=2000)):
        _run_row(c, run_id)
        items = events.since(c, run_id, after, limit)
        return {"items": items, "last_sequence": events.last_sequence(c, run_id)}

    @app.get("/api/v1/runs/{run_id}/events")
    async def stream_events(run_id: str, request: Request, after: int | None = Query(None, ge=0),
                            last_event_id: str | None = Header(default=None)):
        c = db.connect()
        try:
            _run_row(c, run_id)
        except ApiError:
            c.close()
            raise
        cursor = after or 0
        if last_event_id and last_event_id.isdigit():
            cursor = int(last_event_id)

        async def gen():
            nonlocal cursor
            idle = 0.0
            try:
                yield "retry: 2000\n\n"
                while True:
                    if await request.is_disconnected():
                        return
                    batch = events.since(c, run_id, cursor, 200)
                    for event in batch:
                        cursor = event["sequence"]
                        yield f"id: {cursor}\nevent: run_event\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if batch:
                        idle = 0.0
                        continue
                    status = c.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()[0]
                    if status in events.TERMINAL_STATUSES and cursor >= events.last_sequence(c, run_id):
                        yield f"event: end\ndata: {json.dumps({'status': status})}\n\n"
                        return
                    await asyncio.sleep(0.4)
                    idle += 0.4
                    if idle >= 15:
                        idle = 0.0
                        yield ": keep-alive\n\n"
            finally:
                c.close()

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    @app.post("/api/v1/runs/{run_id}/cancel", status_code=202)
    def cancel_run(run_id: str, c: Conn, body: CancelBody | None = None):
        return RunService(c, credentials, manager).cancel(run_id, bool(body and body.force))

    @app.get("/api/v1/runs/{run_id}/artifacts/{artifact_id}")
    def get_artifact(run_id: str, artifact_id: str, c: Conn,
                     inline: bool = False):
        row = _run_row(c, run_id)
        art = c.execute("SELECT * FROM artifacts WHERE id = ? AND run_id = ?", (artifact_id, run_id)).fetchone()
        if art is None:
            raise ApiError(404, "ARTIFACT_NOT_FOUND", tr("找不到这个文件。", "File not found."))
        base = Path(row["run_dir"]).resolve()
        path = (base / art["rel_path"]).resolve()
        if base not in path.parents or not path.is_file():
            raise ApiError(404, "ARTIFACT_NOT_FOUND", tr("找不到这个文件。", "File not found."))
        headers = {}
        if inline and art["kind"] == "report_html":
            # Shown in the app's own iframe: no scripts, no navigation, no network.
            headers["Content-Security-Policy"] = (
                "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; "
                "frame-ancestors 'self'")
            headers["X-Frame-Options"] = "SAMEORIGIN"
            return FileResponse(path, media_type=art["media_type"], headers=headers)
        return FileResponse(path, media_type=art["media_type"], filename=art["name"],
                            content_disposition_type="attachment")

    # ---- the built browser app ------------------------------------------------------------

    @app.get("/api/{rest:path}", include_in_schema=False)
    def api_not_found(rest: str):
        raise ApiError(404, "NOT_FOUND", tr("没有这个接口。", "No such endpoint."))

    @app.get("/{rest:path}", include_in_schema=False)
    def spa(rest: str):
        index = STATIC_DIR / "index.html"
        if not index.is_file():
            return JSONResponse({"error": {"code": "FRONTEND_NOT_BUILT",
                                           "message": tr("前端尚未构建：在 web/ 运行 npm run build。", "The frontend is not built: run npm run build in web/.")}},
                                status_code=503)
        candidate = (STATIC_DIR / rest).resolve()
        if rest and STATIC_DIR.resolve() in candidate.parents and candidate.is_file():
            cache = "public, max-age=31536000, immutable" if rest.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app


def _run_row(c: sqlite3.Connection, run_id: str) -> sqlite3.Row:
    row = c.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise ApiError(404, "RUN_NOT_FOUND", tr("找不到这次运行。", "Run not found."))
    return row


def _summary(row: sqlite3.Row) -> dict:
    config = json.loads(row["config_json"])
    portfolio = json.loads(row["portfolio_json"]) if row["portfolio_json"] else None
    return {
        "id": row["id"],
        "status": row["status"],
        "ticker": row["ticker"],
        "analysis_date": row["analysis_date"],
        "asset_type": row["asset_type"],
        "rating": row["rating"],
        "warnings": row["warnings"],
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "models": {"quick": config.get("quick_think_llm"), "deep": config.get("deep_think_llm"),
                   "provider": config.get("llm_provider")},
        "portfolio": None if portfolio is None else {
            "source": portfolio.get("source"), "id": portfolio.get("id"),
            "version": portfolio.get("version"), "name": portfolio.get("name")},
    }


def _stages(c: sqlite3.Connection, run_id: str) -> dict:
    """Stage and analyst states replayed from the persisted events."""
    rows = c.execute(
        "SELECT event_json FROM events WHERE run_id = ? AND (json_extract(event_json, '$.type') LIKE 'stage.%'"
        " OR json_extract(event_json, '$.type') LIKE 'agent.%') ORDER BY sequence", (run_id,)).fetchall()
    stages: dict[str, dict] = {}
    agents: dict[str, dict] = {}
    for r in rows:
        e = json.loads(r["event_json"])
        if e["type"].startswith("stage."):
            entry = stages.setdefault(e["stage"], {"state": "pending"})
            if e["type"] == "stage.started":
                entry.update(state="running", started_at=e["timestamp"])
            else:
                entry.update(state="completed", finished_at=e["timestamp"])
        else:
            entry = agents.setdefault(e["agent"], {"state": "pending"})
            if e["type"] == "agent.started":
                entry.update(state="running", started_at=e["timestamp"])
            else:
                entry.update(state="completed", finished_at=e["timestamp"])
    return {"stages": stages, "agents": agents}


def _run_view(c: sqlite3.Connection, run_id: str) -> dict:
    row = _run_row(c, run_id)
    artifacts = c.execute("SELECT id, kind, name, media_type, size, created_at FROM artifacts"
                          " WHERE run_id = ? ORDER BY created_at", (run_id,)).fetchall()
    request = json.loads(row["request_json"])
    final_path = Path(row["run_dir"]) / "final_state.json"
    memory_note = None
    if final_path.is_file():
        try:
            memory_note = json.loads(final_path.read_text(encoding="utf-8")).get("memory_note") or None
        except (OSError, ValueError):
            memory_note = None
    return {
        **_summary(row),
        "request": request,
        "config": json.loads(row["config_json"]),
        "settings_revision": row["settings_revision"],
        "portfolio_detail": json.loads(row["portfolio_json"]) if row["portfolio_json"] else None,
        "error": json.loads(row["error_json"]) if row["error_json"] else None,
        "stats": json.loads(row["stats_json"]) if row["stats_json"] else None,
        "cancel_requested": bool(row["cancel_requested"]),
        "artifacts": [dict(a) for a in artifacts],
        "memory_note": memory_note,
        "last_sequence": events.last_sequence(c, run_id),
        **_stages(c, run_id),
    }


__all__ = ["create_app", "CREDENTIALS"]
