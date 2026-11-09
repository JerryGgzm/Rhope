"""Strip secrets from text before it reaches the browser, an event, or a log."""

from __future__ import annotations

import re
from collections.abc import Iterable

_URL_USERINFO = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.-]*://)[^/\s:@]+(?::[^/\s@]*)?@")
_QUERY_SECRET = re.compile(
    r"(?i)(?P<k>[?&](?:api[_-]?key|apikey|key|token|access_token|secret|password|sig|signature)=)[^&\s#\"']+"
)
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")
_AUTH_HEADER = re.compile(r"(?i)(authorization|x-api-key|api-key)(['\"]?\s*[:=]\s*['\"]?)[^\s,'\"}]+")
_KEY_SHAPES = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9]{12,}"
    r"|AKIA[0-9A-Z]{16}|gsk_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,})"
)

MASK = "••••"


def redact(text: str | None, secrets: Iterable[str] = ()) -> str | None:
    if not text:
        return text
    for secret in sorted({s for s in secrets if s and len(s) >= 6}, key=len, reverse=True):
        text = text.replace(secret, MASK)
    text = _URL_USERINFO.sub(lambda m: f"{m.group('scheme')}{MASK}@", text)
    text = _QUERY_SECRET.sub(lambda m: f"{m.group('k')}{MASK}", text)
    text = _BEARER.sub(lambda m: f"{m.group(1)} {MASK}", text)
    text = _AUTH_HEADER.sub(lambda m: f"{m.group(1)}{m.group(2)}{MASK}", text)
    return _KEY_SHAPES.sub(MASK, text)


def redact_obj(value, secrets: Iterable[str] = ()):
    """``redact`` applied to every string inside a JSON-like value."""
    secrets = list(secrets)
    if isinstance(value, str):
        return redact(value, secrets)
    if isinstance(value, dict):
        return {k: redact_obj(v, secrets) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_obj(v, secrets) for v in value]
    return value


def redact_url(url: str | None) -> str | None:
    """A URL safe to display: credentials in it are masked, the destination kept."""
    return redact(url) if url else url
