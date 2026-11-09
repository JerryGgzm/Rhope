"""The workbench index: settings revisions, runs, their events and artifacts, portfolios.

One SQLite file in WAL mode, written by the API process and by run workers.
It indexes; it does not replace the engine's checkpoints or memory log.
"""

from __future__ import annotations

import contextlib
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from tradingagents.web.paths import web_home

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings_revisions (
    revision    INTEGER PRIMARY KEY,
    values_json TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id                TEXT PRIMARY KEY,
    kind              TEXT NOT NULL DEFAULT 'analysis',
    status            TEXT NOT NULL,
    ticker            TEXT,
    analysis_date     TEXT,
    asset_type        TEXT,
    request_json      TEXT NOT NULL,
    config_json       TEXT NOT NULL,
    settings_revision INTEGER,
    portfolio_json    TEXT,
    rating            TEXT,
    error_json        TEXT,
    stats_json        TEXT,
    warnings          INTEGER NOT NULL DEFAULT 0,
    run_dir           TEXT NOT NULL,
    worker_pid        INTEGER,
    idempotency_key   TEXT UNIQUE,
    cancel_requested  INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    started_at        TEXT,
    finished_at       TEXT
);
CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at DESC);
CREATE TABLE IF NOT EXISTS events (
    run_id     TEXT NOT NULL,
    sequence   INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    PRIMARY KEY (run_id, sequence)
);
CREATE TABLE IF NOT EXISTS artifacts (
    id         TEXT PRIMARY KEY,
    run_id     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    name       TEXT NOT NULL,
    rel_path   TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size       INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_run ON artifacts(run_id);
CREATE TABLE IF NOT EXISTS portfolios (
    id         TEXT NOT NULL,
    version    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    as_of      TEXT,
    data_json  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);
"""


def db_path() -> Path:
    return web_home() / "workbench.sqlite3"


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or db_path(), timeout=30, isolation_level=None,
                           check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init(path: Path | None = None) -> None:
    path = path or db_path()
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()
    for suffix in ("", "-wal", "-shm"):
        with contextlib.suppress(FileNotFoundError):
            os.chmod(f"{path}{suffix}", 0o600)


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """An immediate write transaction, so readers of MAX(sequence) never race."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
