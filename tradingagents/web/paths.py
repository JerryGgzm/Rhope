"""Where the web workbench keeps its own state."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from tradingagents.default_config import _TRADINGAGENTS_HOME


def web_home() -> Path:
    """The workbench's private directory: index database, settings, credentials.

    ``TRADINGAGENTS_WEB_HOME`` moves it (tests point it at a temporary directory).
    """
    configured = os.environ.get("TRADINGAGENTS_WEB_HOME", "").strip()
    home = Path(configured) if configured else Path(_TRADINGAGENTS_HOME) / "web"
    home.mkdir(parents=True, exist_ok=True)
    os.chmod(home, 0o700)
    return home


def atomic_write(path: Path, data: str | bytes, mode: int = 0o600) -> None:
    """Replace ``path`` with ``data`` in one step, created with ``mode`` from the start."""
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = data.encode("utf-8") if isinstance(data, str) else data
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
