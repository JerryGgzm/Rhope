"""Schema-driven settings: every engine config key, with its source, saved as revisions.

Precedence for a web run: the run's own overrides > saved web settings >
the environment / .env read at startup > the built-in defaults. A saved
revision is immutable; a run records the revision it was started from.
"""

from __future__ import annotations

import copy
import json
import os
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from unittest import mock

import tradingagents.default_config as default_config
from tradingagents.default_config import _ENV_OVERRIDES, build_default_config
from tradingagents.web import db
from tradingagents.web.redact import redact_url

_PATH_ENV = {
    "results_dir": "TRADINGAGENTS_RESULTS_DIR",
    "data_cache_dir": "TRADINGAGENTS_CACHE_DIR",
    "memory_log_path": "TRADINGAGENTS_MEMORY_LOG_PATH",
}
ENV_FOR_KEY = {key: env for env, key in _ENV_OVERRIDES.items()} | _PATH_ENV


@dataclass(frozen=True)
class Field:
    key: str
    group: str
    label: str
    type: str                      # string|integer|number|boolean|enum|string_list|map|path|url
    description: str = ""
    nullable: bool = False
    enum: tuple[str, ...] = ()
    minimum: float | None = None
    maximum: float | None = None
    secret_like: bool = False      # may carry credentials: shown redacted
    providers: tuple[str, ...] = ()  # applies only when one of these providers is in use
    env: str | None = None


_EFFORT = ("low", "medium", "high")

CONFIG_FIELDS: list[Field] = [
    Field("llm_provider", "model", "主 provider", "enum",
          "分析默认使用的模型服务商。quick / deep 层可分别覆盖。"),
    Field("backend_url", "model", "主端点 URL", "url",
          "留空使用 provider 默认端点。URL 中的凭证会脱敏显示。", nullable=True, secret_like=True),
    Field("quick_think_llm", "model", "快速模型", "string",
          "分析师、研究员、辩论和交易员使用的模型。可填 catalog 之外的 model ID。"),
    Field("deep_think_llm", "model", "深度模型", "string", "研究经理与组合经理使用的模型。"),
    Field("quick_think_provider", "model", "快速层 provider", "enum",
          "留空则使用主 provider。", nullable=True),
    Field("deep_think_provider", "model", "深度层 provider", "enum", "留空则使用主 provider。", nullable=True),
    Field("quick_think_backend_url", "model", "快速层端点", "url", "", nullable=True, secret_like=True),
    Field("deep_think_backend_url", "model", "深度层端点", "url", "", nullable=True, secret_like=True),
    Field("openai_reasoning_effort", "generation", "推理强度（OpenAI / ChatGPT）", "enum",
          "留空使用 provider 默认值。", nullable=True, enum=_EFFORT, providers=("openai", "chatgpt")),
    Field("anthropic_effort", "generation", "Effort（Anthropic）", "enum", "留空使用默认值。",
          nullable=True, enum=_EFFORT, providers=("anthropic",)),
    Field("google_thinking_level", "generation", "思考模式（Gemini）", "enum", "留空使用默认值。",
          nullable=True, enum=("high", "minimal"), providers=("google",)),
    Field("temperature", "generation", "Temperature", "number",
          "留空使用各 provider 默认值。推理模型大多忽略它。", nullable=True, minimum=0, maximum=2),
    Field("llm_max_retries", "generation", "SDK 重试次数", "integer",
          "留空使用 SDK 默认（通常 2）。", nullable=True, minimum=0, maximum=50),
    Field("max_tokens", "generation", "输出 token 上限", "integer", "留空不限制。",
          nullable=True, minimum=1),
    Field("output_language", "research", "报告语言", "string",
          "分析师报告与最终决策使用的语言；内部辩论保持英文。"),
    Field("max_debate_rounds", "research", "多空研究轮数", "integer", "", minimum=1, maximum=10),
    Field("max_risk_discuss_rounds", "research", "风险讨论轮数", "integer", "", minimum=1, maximum=10),
    Field("max_recur_limit", "research", "图递归上限", "integer", "LangGraph recursion limit。",
          minimum=10, maximum=1000),
    Field("max_tool_rounds", "research", "分析师工具轮数上限", "integer",
          "超出后要求分析师直接写报告。", minimum=1, maximum=100),
    Field("checkpoint_enabled", "research", "断点保存", "boolean",
          "每个节点后保存状态，中断后可按相同输入恢复。"),
    Field("news_article_limit", "data", "个股新闻条数", "integer", "", minimum=1, maximum=200),
    Field("global_news_article_limit", "data", "宏观新闻条数", "integer", "", minimum=1, maximum=200),
    Field("global_news_lookback_days", "data", "宏观新闻回看天数", "integer", "", minimum=1, maximum=90),
    Field("global_news_queries", "data", "宏观新闻检索词", "string_list", ""),
    Field("data_vendors", "data", "数据来源（按类别）", "map",
          "每个类别按顺序尝试列出的来源，只会使用你选择的来源。"),
    Field("tool_vendors", "data", "数据来源（按工具覆盖）", "map", "优先于类别设置。"),
    Field("holding_period_days", "review", "持有窗口（交易日）", "integer",
          "复盘与回测计算结果的窗口。", minimum=1, maximum=250),
    Field("benchmark_ticker", "review", "固定基准", "string",
          "留空则按交易所后缀自动选择基准。", nullable=True),
    Field("benchmark_map", "review", "基准映射", "map", "交易所后缀 → 基准代码；空后缀为默认。"),
    Field("memory_log_max_entries", "review", "决策日志保留条数", "integer",
          "留空不轮转；待结算条目永不删除。", nullable=True, minimum=1),
    Field("results_dir", "storage", "结果目录", "path", "改变只影响新运行，不搬移旧文件。"),
    Field("data_cache_dir", "storage", "数据缓存目录", "path", ""),
    Field("memory_log_path", "storage", "决策日志文件", "path", ""),
]

ENV_FIELDS: list[Field] = [
    Field("SEC_EDGAR_USER_AGENT", "data", "SEC EDGAR User-Agent", "string",
          "SEC 要求包含联系方式，例如 “Name email@example.com”。", nullable=True),
    Field("TYPESAFE_DEFAULT_MODEL", "data", "Typesafe 模型", "string", "", nullable=True),
    Field("TYPESAFE_BASE_URL", "data", "Typesafe 端点", "url", "", nullable=True, secret_like=True),
    Field("OLLAMA_BASE_URL", "model", "Ollama 地址", "url", "", nullable=True, secret_like=True,
          providers=("ollama",)),
    Field("AZURE_OPENAI_ENDPOINT", "model", "Azure 端点", "url", "", nullable=True, secret_like=True,
          providers=("azure",)),
    Field("AZURE_OPENAI_DEPLOYMENT_NAME", "model", "Azure 部署名", "string", "", nullable=True,
          providers=("azure",)),
    Field("OPENAI_API_VERSION", "model", "Azure API 版本", "string", "", nullable=True,
          providers=("azure",)),
    Field("AWS_REGION", "model", "AWS 区域", "string", "", nullable=True, providers=("bedrock",)),
    Field("AWS_DEFAULT_REGION", "model", "AWS 默认区域", "string", "", nullable=True,
          providers=("bedrock",)),
    Field("AWS_PROFILE", "model", "AWS Profile", "string", "", nullable=True, providers=("bedrock",)),
    Field("HTTP_PROXY", "network", "HTTP 代理", "url", "", nullable=True, secret_like=True),
    Field("HTTPS_PROXY", "network", "HTTPS 代理", "url", "", nullable=True, secret_like=True),
    Field("ALL_PROXY", "network", "全部代理", "url", "", nullable=True, secret_like=True),
    Field("NO_PROXY", "network", "不走代理", "string", "", nullable=True),
]

GROUPS = [
    ("model", "模型与认证"),
    ("generation", "推理与生成"),
    ("research", "研究参数"),
    ("data", "数据来源"),
    ("review", "复盘与回测"),
    ("storage", "输出与存储"),
    ("network", "网络与高级"),
]

_BY_KEY = {f.key: f for f in CONFIG_FIELDS}
_ENV_BY_KEY = {f.key: f for f in ENV_FIELDS}


def _provider_choices() -> list[str]:
    from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV

    return list(PROVIDER_API_KEY_ENV)


def builtin_defaults() -> dict:
    """The defaults with no TRADINGAGENTS_* environment applied."""
    clean = {k: v for k, v in os.environ.items() if not k.startswith("TRADINGAGENTS_")}
    with mock.patch.dict(os.environ, clean, clear=True):
        return build_default_config()


def startup_defaults() -> dict:
    """The defaults as the engine read them at import: built-ins plus env / .env."""
    return copy.deepcopy(default_config.DEFAULT_CONFIG)


class SettingsError(ValueError):
    def __init__(self, field_errors: list[dict]):
        super().__init__("; ".join(f"{e['key']}: {e['message']}" for e in field_errors))
        self.field_errors = field_errors


class RevisionConflict(Exception):
    def __init__(self, current: int):
        super().__init__(f"settings changed (now revision {current})")
        self.current = current


def _validate(f: Field, value):
    """The value coerced to the field's type, or a ValueError naming the problem."""
    if value is None:
        if f.nullable:
            return None
        raise ValueError("不能为空")
    t = f.type
    if t in ("string", "path", "url") or (t == "enum" and not f.enum and f.key.endswith("provider")):
        if not isinstance(value, str):
            raise ValueError("需要文本")
        value = value.strip()
        if not value:
            if f.nullable:
                return None
            raise ValueError("不能为空")
        if t == "url" and not value.startswith(("http://", "https://", "socks5://", "socks5h://")):
            raise ValueError("需要以 http:// 或 https:// 开头")
        if f.key.endswith("provider") and value.lower() not in _provider_choices():
            raise ValueError(f"未知 provider：{value}")
        return value.lower() if f.key.endswith("provider") else value
    if t == "enum":
        if value not in f.enum:
            raise ValueError(f"可选值：{', '.join(f.enum)}")
        return value
    if t == "boolean":
        if not isinstance(value, bool):
            raise ValueError("需要开关值")
        return value
    if t in ("integer", "number"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("需要数字")
        if t == "integer":
            if value != int(value):
                raise ValueError("需要整数")
            value = int(value)
        value = float(value) if t == "number" else value
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("需要有限数字")
        if f.minimum is not None and value < f.minimum:
            raise ValueError(f"不能小于 {f.minimum:g}")
        if f.maximum is not None and value > f.maximum:
            raise ValueError(f"不能大于 {f.maximum:g}")
        return value
    if t == "string_list":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError("需要文本列表")
        return [v.strip() for v in value if v.strip()]
    if t == "map":
        if not isinstance(value, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in value.items()
        ):
            raise ValueError("需要键值表")
        return {k.strip(): v.strip() for k, v in value.items() if v.strip()}
    raise ValueError(f"unsupported type {t}")


def validate_config_values(values: dict) -> dict:
    out, errors = {}, []
    for key, value in values.items():
        f = _BY_KEY.get(key)
        if f is None:
            errors.append({"key": key, "message": "未知设置项"})
            continue
        try:
            out[key] = _validate(f, value)
        except ValueError as exc:
            errors.append({"key": key, "message": str(exc)})
    if errors:
        raise SettingsError(errors)
    return out


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


@dataclass
class Revision:
    revision: int
    config: dict = field(default_factory=dict)
    env: dict = field(default_factory=dict)
    created_at: str | None = None


class SettingsStore:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def current(self) -> Revision:
        row = self.conn.execute(
            "SELECT revision, values_json, created_at FROM settings_revisions ORDER BY revision DESC LIMIT 1"
        ).fetchone()
        if row is None:
            return Revision(0)
        values = json.loads(row["values_json"])
        return Revision(row["revision"], values.get("config", {}), values.get("env", {}), row["created_at"])

    def get(self, revision: int) -> Revision | None:
        if revision == 0:
            return Revision(0)
        row = self.conn.execute(
            "SELECT revision, values_json, created_at FROM settings_revisions WHERE revision = ?", (revision,)
        ).fetchone()
        if row is None:
            return None
        values = json.loads(row["values_json"])
        return Revision(row["revision"], values.get("config", {}), values.get("env", {}), row["created_at"])

    def save(self, base_revision: int, config: dict, reset: list[str], env: dict,
             env_reset: list[str]) -> Revision:
        errors = []
        try:
            config = validate_config_values(config)
        except SettingsError as exc:
            errors += exc.field_errors
        clean_env = {}
        for key, value in env.items():
            f = _ENV_BY_KEY.get(key)
            if f is None:
                errors.append({"key": key, "message": "未知设置项"})
                continue
            try:
                clean_env[key] = _validate(f, value)
            except ValueError as exc:
                errors.append({"key": key, "message": str(exc)})
        errors += [{"key": k, "message": "未知设置项"} for k in reset if k not in _BY_KEY]
        errors += [{"key": k, "message": "未知设置项"} for k in env_reset if k not in _ENV_BY_KEY]
        if errors:
            raise SettingsError(errors)
        with db.transaction(self.conn):
            current = self.current()
            if current.revision != base_revision:
                raise RevisionConflict(current.revision)
            merged_config = {**current.config, **config}
            for key in reset:
                merged_config.pop(key, None)
            merged_env = {k: v for k, v in {**current.env, **clean_env}.items() if v is not None}
            for key in env_reset:
                merged_env.pop(key, None)
            revision = current.revision + 1
            created = _now()
            self.conn.execute(
                "INSERT INTO settings_revisions (revision, values_json, created_at) VALUES (?, ?, ?)",
                (revision, json.dumps({"config": merged_config, "env": merged_env}), created),
            )
        return Revision(revision, merged_config, merged_env, created)


def effective_config(revision: Revision, overrides: dict | None = None) -> dict:
    """The config a run starting now would use under ``revision`` and its own overrides."""
    config = startup_defaults()
    for key, value in {**revision.config, **(overrides or {})}.items():
        config[key] = copy.deepcopy(value)
    return config


def effective_env(revision: Revision) -> dict[str, str]:
    """Saved non-secret environment settings to give a run's worker."""
    return {k: str(v) for k, v in revision.env.items() if v is not None}


def _display(f: Field, value):
    return redact_url(value) if f.secret_like and isinstance(value, str) else value


def describe(revision: Revision) -> dict:
    """The schema and every field's default, inherited and effective value with its source."""
    builtins = builtin_defaults()
    startup = startup_defaults()
    providers = _provider_choices()
    fields = []
    for f in CONFIG_FIELDS:
        env_name = ENV_FOR_KEY.get(f.key)
        env_set = bool(env_name and os.environ.get(env_name))
        if f.key in revision.config:
            source, value = "web", revision.config[f.key]
        elif env_set:
            source, value = "env", startup.get(f.key)
        else:
            source, value = "default", startup.get(f.key)
        enum = list(f.enum) or (providers if f.key.endswith("provider") else [])
        fields.append({
            **{k: v for k, v in asdict(f).items() if k not in ("enum", "providers", "secret_like")},
            "kind": "config",
            "enum": enum,
            "providers": list(f.providers),
            "secret_like": f.secret_like,
            "env": env_name,
            "default": _display(f, builtins.get(f.key)),
            "inherited": _display(f, startup.get(f.key)),
            "value": _display(f, value),
            "source": source,
            "applies": "new_runs",
        })
    for f in ENV_FIELDS:
        if f.key in revision.env:
            source, value = "web", revision.env[f.key]
        elif os.environ.get(f.key):
            source, value = "env", os.environ[f.key]
        else:
            source, value = "default", None
        fields.append({
            **{k: v for k, v in asdict(f).items() if k not in ("enum", "providers", "secret_like")},
            "kind": "env",
            "enum": list(f.enum),
            "providers": list(f.providers),
            "secret_like": f.secret_like,
            "env": f.key,
            "default": None,
            "inherited": _display(f, os.environ.get(f.key) or None),
            "value": _display(f, value),
            "source": source,
            "applies": "new_runs",
        })
    return {
        "revision": revision.revision,
        "saved_at": revision.created_at,
        "groups": [{"id": g, "label": label} for g, label in GROUPS],
        "fields": fields,
    }
