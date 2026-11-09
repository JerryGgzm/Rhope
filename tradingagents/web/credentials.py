"""Secrets the workbench stores for runs: API keys and other credentials.

Kept in one owner-only (0600) JSON file under the web home, written atomically,
never returned whole to the browser. A run's worker receives them in its
environment at start; nothing else in the API process exports them.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path

from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV
from tradingagents.web.paths import atomic_write, web_home


@dataclass(frozen=True)
class CredentialSpec:
    name: str
    group: str
    label: str
    providers: tuple[str, ...] = ()
    optional: bool = False


def _provider_specs() -> list[CredentialSpec]:
    by_env: dict[str, list[str]] = {}
    for provider, env in PROVIDER_API_KEY_ENV.items():
        if env:
            by_env.setdefault(env, []).append(provider)
    return [
        CredentialSpec(name=env, group="llm", label=f"{', '.join(providers)} API Key",
                       providers=tuple(providers), optional=env == "OPENAI_COMPATIBLE_API_KEY")
        for env, providers in by_env.items()
    ]


CREDENTIALS: dict[str, CredentialSpec] = {
    spec.name: spec
    for spec in [
        *_provider_specs(),
        CredentialSpec("ALPHA_VANTAGE_API_KEY", "data", "Alpha Vantage API Key", optional=True),
        CredentialSpec("FRED_API_KEY", "data", "FRED API Key", optional=True),
        CredentialSpec("TYPESAFE_API_KEY", "data", "Typesafe API Key", optional=True),
        CredentialSpec("AWS_ACCESS_KEY_ID", "aws", "AWS Access Key ID", ("bedrock",), True),
        CredentialSpec("AWS_SECRET_ACCESS_KEY", "aws", "AWS Secret Access Key", ("bedrock",), True),
        CredentialSpec("AWS_SESSION_TOKEN", "aws", "AWS Session Token", ("bedrock",), True),
        CredentialSpec("AWS_BEARER_TOKEN_BEDROCK", "aws", "Bedrock Bearer Token", ("bedrock",), True),
    ]
}


class CredentialStore:
    def __init__(self, path: Path | None = None):
        self.path = path or web_home() / "credentials.json"
        self._lock = threading.Lock()

    def _read(self) -> dict[str, str]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        if not isinstance(data, dict):
            return {}
        return {k: v for k, v in data.items() if k in CREDENTIALS and isinstance(v, str) and v}

    def update(self, set_values: dict[str, str], clear: list[str]) -> None:
        unknown = [k for k in [*set_values, *clear] if k not in CREDENTIALS]
        if unknown:
            raise KeyError(", ".join(unknown))
        with self._lock:
            data = self._read()
            for name, value in set_values.items():
                value = value.strip()
                if value:   # an empty input leaves the stored value as it is
                    data[name] = value
            for name in clear:
                data.pop(name, None)
            atomic_write(self.path, json.dumps(data, indent=2))

    def status(self) -> dict[str, dict]:
        """Configured or not, and from where; never the value."""
        stored = self._read()
        out = {}
        for name, spec in CREDENTIALS.items():
            if name in stored:
                source = "web"
            elif os.environ.get(name):
                source = "env"
            else:
                source = None
            out[name] = {"name": name, "group": spec.group, "label": spec.label,
                         "providers": list(spec.providers), "optional": spec.optional,
                         "configured": source is not None, "source": source}
        return out

    def resolved(self) -> dict[str, str]:
        """Every known credential's effective value: the web store wins over the environment."""
        values = {name: os.environ[name] for name in CREDENTIALS if os.environ.get(name)}
        values.update(self._read())
        return values

    def secret_values(self) -> list[str]:
        return [v for v in self.resolved().values() if len(v) >= 6]
