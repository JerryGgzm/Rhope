"""The interface language of the request being served: Chinese or English.

Text a request returns follows its Accept-Language. Text that is stored (run
events, a run's error) outlives the request, so it is stored in both languages
and the page picks one.
"""

from __future__ import annotations

from contextvars import ContextVar

_lang: ContextVar[str] = ContextVar("ui_lang", default="zh")


def lang_from_header(accept_language: str | None) -> str:
    first = (accept_language or "").split(",")[0].strip().lower()
    if not first:
        return "zh"
    return "zh" if first.startswith("zh") else "en"


def set_lang(lang: str):
    return _lang.set(lang)


def current() -> str:
    return _lang.get()


def tr(zh: str, en: str) -> str:
    return en if _lang.get() == "en" else zh


def both(zh: str, en: str, key: str = "message") -> dict:
    """A stored message in both languages: ``{key: zh, key_en: en}``."""
    return {key: zh, f"{key}_en": en}
