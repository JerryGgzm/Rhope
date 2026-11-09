"""A run's event log: persisted first, then streamed, ordered by a per-run sequence."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime

from tradingagents.web import db

SCHEMA_VERSION = 1

TERMINAL_STATUSES = ("completed", "completed_with_warnings", "failed", "cancelled", "interrupted")


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def append(conn: sqlite3.Connection, run_id: str, type_: str, *, stage: str | None = None,
           agent: str | None = None, severity: str = "info", payload: dict | None = None) -> dict:
    with db.transaction(conn):
        row = conn.execute("SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE run_id = ?",
                           (run_id,)).fetchone()
        sequence = row[0]
        event = {
            "schema_version": SCHEMA_VERSION,
            "event_id": f"{run_id}:{sequence}",
            "run_id": run_id,
            "sequence": sequence,
            "timestamp": now_iso(),
            "type": type_,
            "stage": stage,
            "agent": agent,
            "severity": severity,
            "payload": payload or {},
        }
        conn.execute("INSERT INTO events (run_id, sequence, event_json) VALUES (?, ?, ?)",
                     (run_id, sequence, json.dumps(event, ensure_ascii=False)))
    return event


def since(conn: sqlite3.Connection, run_id: str, after: int = 0, limit: int = 500) -> list[dict]:
    rows = conn.execute(
        "SELECT event_json FROM events WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT ?",
        (run_id, after, limit),
    ).fetchall()
    return [json.loads(r["event_json"]) for r in rows]


def last_sequence(conn: sqlite3.Connection, run_id: str) -> int:
    row = conn.execute("SELECT COALESCE(MAX(sequence), 0) FROM events WHERE run_id = ?",
                       (run_id,)).fetchone()
    return row[0]
