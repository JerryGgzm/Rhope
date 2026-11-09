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
from tradingagents.web.i18n import current, tr
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
          "分析默认使用的模型服务商，快速层和深度层可以各自换掉。例如 openai、deepseek。"),
    Field("backend_url", "model", "主端点 URL", "url",
          "自定义接口地址，留空用服务商默认地址。地址里的凭证会脱敏显示。例如 https://api.openai.com/v1。",
          nullable=True, secret_like=True),
    Field("quick_think_llm", "model", "快速模型", "string",
          "分析师、研究员、辩论和交易员用的模型，目录里没有的 ID 也可以填。例如 gpt-5.4-mini。"),
    Field("deep_think_llm", "model", "深度模型", "string",
          "研究经理和组合经理用的模型，通常选更强的一个。例如 gpt-5.4。"),
    Field("quick_think_provider", "model", "快速层 provider", "enum",
          "只给快速层换服务商，留空就跟随主 provider。例如 ollama。", nullable=True),
    Field("deep_think_provider", "model", "深度层 provider", "enum",
          "只给深度层换服务商，留空就跟随主 provider。例如 anthropic。", nullable=True),
    Field("quick_think_backend_url", "model", "快速层端点", "url",
          "只给快速层用的接口地址，留空就用主端点。例如 http://localhost:11434/v1。",
          nullable=True, secret_like=True),
    Field("deep_think_backend_url", "model", "深度层端点", "url",
          "只给深度层用的接口地址，留空就用主端点。例如 https://api.deepseek.com。",
          nullable=True, secret_like=True),
    Field("openai_reasoning_effort", "generation", "推理强度（OpenAI / ChatGPT）", "enum",
          "推理模型花多少算力：越高越慢、越耗 token。留空用服务商默认。填 low、medium 或 high。",
          nullable=True, enum=_EFFORT, providers=("openai", "chatgpt")),
    Field("anthropic_effort", "generation", "Effort（Anthropic）", "enum",
          "Claude 的思考力度，留空用默认。填 low、medium 或 high。",
          nullable=True, enum=_EFFORT, providers=("anthropic",)),
    Field("google_thinking_level", "generation", "思考模式（Gemini）", "enum",
          "Gemini 想多深，留空用默认。填 high 或 minimal。",
          nullable=True, enum=("high", "minimal"), providers=("google",)),
    Field("temperature", "generation", "Temperature", "number",
          "回答的随机程度，越低越稳定。留空用各服务商默认；推理模型大多忽略它。例如 0.2。",
          nullable=True, minimum=0, maximum=2),
    Field("llm_max_retries", "generation", "SDK 重试次数", "integer",
          "模型调用被限流时重试几次，留空用 SDK 默认（通常 2）。例如 5。",
          nullable=True, minimum=0, maximum=50),
    Field("max_tokens", "generation", "输出 token 上限", "integer",
          "一次回复最多生成多少 token，用来拦住过长输出。留空不限制。例如 4096。",
          nullable=True, minimum=1),
    Field("output_language", "research", "报告语言", "string",
          "分析师报告和最终决策用的语言；内部辩论保持英文。例如 Chinese、English。"),
    Field("max_debate_rounds", "research", "多空研究轮数", "integer",
          "多头和空头各发言几轮，轮数越多越慢。例如 1。", minimum=1, maximum=10),
    Field("max_risk_discuss_rounds", "research", "风险讨论轮数", "integer",
          "激进、保守、中立三方各讨论几轮。例如 1。", minimum=1, maximum=10),
    Field("max_recur_limit", "research", "图递归上限", "integer",
          "一次分析最多走多少步，防止流程死循环。必须大于工具轮数的两倍再加 2。例如 100。",
          minimum=10, maximum=1000),
    Field("max_tool_rounds", "research", "分析师工具轮数上限", "integer",
          "每位分析师最多调几次工具，超出后就直接写报告。例如 20。", minimum=1, maximum=100),
    Field("checkpoint_enabled", "research", "断点保存", "boolean",
          "每一步之后保存进度。中断后用相同输入重新运行，会从上次停下的地方继续。"),
    Field("news_article_limit", "data", "个股新闻条数", "integer",
          "每只股票放进提示的新闻最多几条，调低可以省 token。例如 20。", minimum=1, maximum=200),
    Field("global_news_article_limit", "data", "宏观新闻条数", "integer",
          "宏观新闻最多取几条。例如 10。", minimum=1, maximum=200),
    Field("global_news_lookback_days", "data", "宏观新闻回看天数", "integer",
          "宏观新闻往回看多少天。例如 7。", minimum=1, maximum=90),
    Field("global_news_queries", "data", "宏观新闻检索词", "string_list",
          "用来搜宏观新闻的关键词，每行一条。例如 Federal Reserve interest rates。"),
    Field("data_vendors", "data", "数据来源（按类别）", "map",
          "每个类别按逗号从左到右尝试这些来源，不会悄悄用你没选的。例如 yfinance,alpha_vantage。"),
    Field("tool_vendors", "data", "数据来源（按工具覆盖）", "map",
          "给单个工具换来源，优先于上面的类别。键是工具名。例如 get_news → alpha_vantage。"),
    Field("holding_period_days", "review", "持有窗口（交易日）", "integer",
          "复盘和回测用多少个交易日来衡量一条建议的结果。例如 5。", minimum=1, maximum=250),
    Field("benchmark_ticker", "review", "固定基准", "string",
          "所有标的都相对这个基准算超额收益。留空则按交易所后缀自动选。例如 SPY。", nullable=True),
    Field("benchmark_map", "review", "基准映射", "map",
          "交易所后缀对应哪个基准；空后缀是美股默认。例如 .HK → ^HSI。"),
    Field("memory_log_max_entries", "review", "决策日志保留条数", "integer",
          "已结算的决策最多留多少条，留空就不删。还没结算的永不删除。例如 500。",
          nullable=True, minimum=1),
    Field("results_dir", "storage", "结果目录", "path",
          "报告和运行结果存到哪里。只影响新运行，不搬移旧文件。例如 ~/.tradingagents/logs。"),
    Field("data_cache_dir", "storage", "数据缓存目录", "path",
          "行情和指标的本地缓存放在哪里。例如 ~/.tradingagents/cache。"),
    Field("memory_log_path", "storage", "决策日志文件", "path",
          "复盘读取的决策日志文件。例如 ~/.tradingagents/memory/trading_memory.md。"),
]

ENV_FIELDS: list[Field] = [
    Field("SEC_EDGAR_USER_AGENT", "data", "SEC EDGAR User-Agent", "string",
          "访问 SEC 申报时必须带上的联系方式。例如 Jane Doe jane@example.com。", nullable=True),
    Field("TYPESAFE_DEFAULT_MODEL", "data", "Typesafe 模型", "string",
          "用 TypeSafe 筛选社交帖子时调用的模型，留空用 jev-latest。例如 jev-latest。", nullable=True),
    Field("TYPESAFE_BASE_URL", "data", "Typesafe 端点", "url",
          "TypeSafe 的接口地址，留空用 https://api.typesafe.ai。", nullable=True, secret_like=True),
    Field("OLLAMA_BASE_URL", "model", "Ollama 地址", "url",
          "本机 Ollama 的 OpenAI 兼容地址。例如 http://localhost:11434/v1。",
          nullable=True, secret_like=True, providers=("ollama",)),
    Field("AZURE_OPENAI_ENDPOINT", "model", "Azure 端点", "url",
          "Azure OpenAI 资源地址；填了主端点就用主端点。例如 https://my-resource.openai.azure.com/。",
          nullable=True, secret_like=True, providers=("azure",)),
    Field("AZURE_OPENAI_DEPLOYMENT_NAME", "model", "Azure 部署名", "string",
          "Azure 上的部署名称，留空就用模型名。例如 gpt-4o。", nullable=True, providers=("azure",)),
    Field("OPENAI_API_VERSION", "model", "Azure API 版本", "string",
          "Azure 要求的 API 版本号。例如 2025-03-01-preview。", nullable=True, providers=("azure",)),
    Field("AWS_REGION", "model", "AWS 区域", "string",
          "Bedrock 所在区域，优先于下面的默认区域。例如 us-west-2。", nullable=True, providers=("bedrock",)),
    Field("AWS_DEFAULT_REGION", "model", "AWS 默认区域", "string",
          "没填 AWS 区域时用这个。例如 us-east-1。", nullable=True, providers=("bedrock",)),
    Field("AWS_PROFILE", "model", "AWS Profile", "string",
          "~/.aws/credentials 里的配置名，用访问密钥登录时可选。例如 default。",
          nullable=True, providers=("bedrock",)),
    Field("HTTP_PROXY", "network", "HTTP 代理", "url",
          "HTTP 请求走的代理。例如 http://127.0.0.1:7890。", nullable=True, secret_like=True),
    Field("HTTPS_PROXY", "network", "HTTPS 代理", "url",
          "HTTPS 请求走的代理。例如 http://127.0.0.1:7890。", nullable=True, secret_like=True),
    Field("ALL_PROXY", "network", "全部代理", "url",
          "其余流量走的代理，常用来填 SOCKS。例如 socks5://127.0.0.1:7890。",
          nullable=True, secret_like=True),
    Field("NO_PROXY", "network", "不走代理", "string",
          "这些主机不走代理，用逗号分隔。例如 localhost,127.0.0.1。", nullable=True),
]

GROUPS = [
    ("model", "模型与认证", "Models & auth"),
    ("generation", "推理与生成", "Reasoning & generation"),
    ("research", "研究参数", "Research"),
    ("data", "数据来源", "Data sources"),
    ("review", "复盘与回测", "Review & backtests"),
    ("storage", "输出与存储", "Output & storage"),
    ("network", "网络与高级", "Network & advanced"),
]

# English label and description per field, for an English interface.
EN: dict[str, tuple[str, str]] = {
    "llm_provider": ("Main provider", "The model provider analyses use by default. The quick and deep tiers can each override it. e.g. openai, deepseek."),
    "backend_url": ("Main endpoint URL", "A custom API address; leave empty for the provider's default. Credentials in the URL are shown redacted. e.g. https://api.openai.com/v1."),
    "quick_think_llm": ("Quick model", "Used by analysts, researchers, debaters and the trader. Any model ID is accepted, even one not in the catalog. e.g. gpt-5.4-mini."),
    "deep_think_llm": ("Deep model", "Used by the research manager and the portfolio manager, usually a stronger model. e.g. gpt-5.4."),
    "quick_think_provider": ("Quick-tier provider", "A different provider for the quick tier only. Leave empty to follow the main provider. e.g. ollama."),
    "deep_think_provider": ("Deep-tier provider", "A different provider for the deep tier only. Leave empty to follow the main provider. e.g. anthropic."),
    "quick_think_backend_url": ("Quick-tier endpoint", "API address for the quick tier only. Leave empty to use the main endpoint. e.g. http://localhost:11434/v1."),
    "deep_think_backend_url": ("Deep-tier endpoint", "API address for the deep tier only. Leave empty to use the main endpoint. e.g. https://api.deepseek.com."),
    "openai_reasoning_effort": ("Reasoning effort (OpenAI / ChatGPT)", "How hard reasoning models think: higher is slower and costs more tokens. Leave empty for the provider default. One of low, medium, high."),
    "anthropic_effort": ("Effort (Anthropic)", "How hard Claude thinks. Leave empty for the default. One of low, medium, high."),
    "google_thinking_level": ("Thinking level (Gemini)", "How deeply Gemini thinks. Leave empty for the default. One of high, minimal."),
    "temperature": ("Temperature", "How random replies are; lower is more stable. Leave empty for each provider's default. Most reasoning models ignore it. e.g. 0.2."),
    "llm_max_retries": ("SDK retries", "How many times to retry a rate-limited model call. Leave empty for the SDK default (usually 2). e.g. 5."),
    "max_tokens": ("Output token limit", "Most tokens one reply may generate, to stop a runaway response. Leave empty for no limit. e.g. 4096."),
    "output_language": ("Report language", "Language of the analyst reports and the final decision. Internal debate stays in English. e.g. Chinese, English."),
    "max_debate_rounds": ("Bull/bear rounds", "How many times the bull and the bear each speak. More rounds are slower. e.g. 1."),
    "max_risk_discuss_rounds": ("Risk discussion rounds", "How many rounds the aggressive, conservative and neutral sides each debate. e.g. 1."),
    "max_recur_limit": ("Graph recursion limit", "Most steps one analysis may take, so the flow cannot loop forever. Must be more than twice the tool rounds plus 2. e.g. 100."),
    "max_tool_rounds": ("Analyst tool rounds", "Tool calls each analyst may make before it is asked to write its report. e.g. 20."),
    "checkpoint_enabled": ("Checkpoints", "Save progress after every step. Rerunning with the same inputs continues from where it stopped."),
    "news_article_limit": ("Company news articles", "Most company-news articles put in the prompt per symbol. Lower it to use fewer tokens. e.g. 20."),
    "global_news_article_limit": ("Macro news articles", "Most macro-news articles fetched. e.g. 10."),
    "global_news_lookback_days": ("Macro news lookback (days)", "How many days of macro news to look back over. e.g. 7."),
    "global_news_queries": ("Macro news queries", "Search phrases for macro headlines, one per line. e.g. Federal Reserve interest rates."),
    "data_vendors": ("Data sources (by category)", "Each category tries these sources left to right and never one you didn't choose. e.g. yfinance,alpha_vantage."),
    "tool_vendors": ("Data sources (per tool)", "Replace the category source for one tool. The key is the tool name. e.g. get_news → alpha_vantage."),
    "holding_period_days": ("Holding window (trading days)", "Trading days over which review and backtests measure one call's result. e.g. 5."),
    "benchmark_ticker": ("Fixed benchmark", "Measure every symbol against this ticker. Leave empty to pick one from the exchange suffix. e.g. SPY."),
    "benchmark_map": ("Benchmark map", "Which benchmark each exchange suffix uses. An empty suffix is the US default. e.g. .HK → ^HSI."),
    "memory_log_max_entries": ("Decision log entries kept", "Most settled decisions to keep. Leave empty to keep them all. Pending entries are never removed. e.g. 500."),
    "results_dir": ("Results directory", "Where reports and run output are saved. Affects new runs only; old files stay put. e.g. ~/.tradingagents/logs."),
    "data_cache_dir": ("Data cache directory", "Where the local cache of prices and indicators lives. e.g. ~/.tradingagents/cache."),
    "memory_log_path": ("Decision log file", "The decision log that review reads. e.g. ~/.tradingagents/memory/trading_memory.md."),
    "SEC_EDGAR_USER_AGENT": ("SEC EDGAR User-Agent", "Contact details SEC requires on every filing request. e.g. Jane Doe jane@example.com."),
    "TYPESAFE_DEFAULT_MODEL": ("Typesafe model", "Model TypeSafe uses to screen social posts. Leave empty for jev-latest. e.g. jev-latest."),
    "TYPESAFE_BASE_URL": ("Typesafe endpoint", "TypeSafe API address. Leave empty for https://api.typesafe.ai."),
    "OLLAMA_BASE_URL": ("Ollama URL", "This machine's Ollama, at its OpenAI-compatible address. e.g. http://localhost:11434/v1."),
    "AZURE_OPENAI_ENDPOINT": ("Azure endpoint", "Azure OpenAI resource URL. A main endpoint, when set, is used instead. e.g. https://my-resource.openai.azure.com/."),
    "AZURE_OPENAI_DEPLOYMENT_NAME": ("Azure deployment", "Deployment name on Azure. Leave empty to use the model name. e.g. gpt-4o."),
    "OPENAI_API_VERSION": ("Azure API version", "API version Azure requires. e.g. 2025-03-01-preview."),
    "AWS_REGION": ("AWS region", "Region Bedrock runs in. Takes precedence over the default region. e.g. us-west-2."),
    "AWS_DEFAULT_REGION": ("AWS default region", "Used when AWS region is empty. e.g. us-east-1."),
    "AWS_PROFILE": ("AWS profile", "A profile name in ~/.aws/credentials. Optional when signing in with access keys. e.g. default."),
    "HTTP_PROXY": ("HTTP proxy", "Proxy for HTTP requests. e.g. http://127.0.0.1:7890."),
    "HTTPS_PROXY": ("HTTPS proxy", "Proxy for HTTPS requests. e.g. http://127.0.0.1:7890."),
    "ALL_PROXY": ("Proxy for all traffic", "Proxy for everything else, often a SOCKS proxy. e.g. socks5://127.0.0.1:7890."),
    "NO_PROXY": ("No proxy for", "Hosts that skip the proxy, comma-separated. e.g. localhost,127.0.0.1."),
}

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
        raise ValueError(tr("不能为空", "Required"))
    t = f.type
    if t in ("string", "path", "url") or (t == "enum" and not f.enum and f.key.endswith("provider")):
        if not isinstance(value, str):
            raise ValueError(tr("需要文本", "Text expected"))
        value = value.strip()
        if not value:
            if f.nullable:
                return None
            raise ValueError(tr("不能为空", "Required"))
        if t == "url" and not value.startswith(("http://", "https://", "socks5://", "socks5h://")):
            raise ValueError(tr("需要以 http:// 或 https:// 开头", "Must start with http:// or https://"))
        if f.key.endswith("provider") and value.lower() not in _provider_choices():
            raise ValueError(tr(f"未知 provider：{value}", f"Unknown provider: {value}"))
        return value.lower() if f.key.endswith("provider") else value
    if t == "enum":
        if value not in f.enum:
            raise ValueError(tr("可选值：", "Choose from: ") + ", ".join(f.enum))
        return value
    if t == "boolean":
        if not isinstance(value, bool):
            raise ValueError(tr("需要开关值", "On or off expected"))
        return value
    if t in ("integer", "number"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(tr("需要数字", "Number expected"))
        if t == "integer":
            if value != int(value):
                raise ValueError(tr("需要整数", "Whole number expected"))
            value = int(value)
        value = float(value) if t == "number" else value
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError(tr("需要有限数字", "Finite number expected"))
        if f.minimum is not None and value < f.minimum:
            raise ValueError(tr(f"不能小于 {f.minimum:g}", f"At least {f.minimum:g}"))
        if f.maximum is not None and value > f.maximum:
            raise ValueError(tr(f"不能大于 {f.maximum:g}", f"At most {f.maximum:g}"))
        return value
    if t == "string_list":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError(tr("需要文本列表", "List of text expected"))
        return [v.strip() for v in value if v.strip()]
    if t == "map":
        if not isinstance(value, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in value.items()
        ):
            raise ValueError(tr("需要键值表", "Key-value map expected"))
        return {k.strip(): v.strip() for k, v in value.items() if v.strip()}
    raise ValueError(f"unsupported type {t}")


def validate_config_values(values: dict) -> dict:
    out, errors = {}, []
    for key, value in values.items():
        f = _BY_KEY.get(key)
        if f is None:
            errors.append({"key": key, "message": tr("未知设置项", "Unknown setting")})
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
                errors.append({"key": key, "message": tr("未知设置项", "Unknown setting")})
                continue
            try:
                clean_env[key] = _validate(f, value)
            except ValueError as exc:
                errors.append({"key": key, "message": str(exc)})
        errors += [{"key": k, "message": tr("未知设置项", "Unknown setting")} for k in reset if k not in _BY_KEY]
        errors += [{"key": k, "message": tr("未知设置项", "Unknown setting")} for k in env_reset if k not in _ENV_BY_KEY]
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


def _localized(f: Field) -> dict:
    if current() != "en" or f.key not in EN:
        return {}
    label, description = EN[f.key]
    return {"label": label, "description": description}


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
            **_localized(f),
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
            **_localized(f),
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
        "groups": [{"id": g, "label": tr(zh, en)} for g, zh, en in GROUPS],
        "fields": fields,
    }
