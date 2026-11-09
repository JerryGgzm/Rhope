"""The workbench's one error shape, and how an engine exception maps onto it."""

from __future__ import annotations

from collections.abc import Iterable

from tradingagents.web.i18n import both
from tradingagents.web.redact import redact


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, *, details: str | None = None,
                 field_errors: list[dict] | None = None, retryable: bool = False, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        self.field_errors = field_errors or []
        self.retryable = retryable
        self.extra = extra

    def body(self, request_id: str | None = None) -> dict:
        return {"error": {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "field_errors": self.field_errors,
            "request_id": request_id,
            "retryable": self.retryable,
            "run_id": self.extra.get("run_id"),
            "stage": self.extra.get("stage"),
            "provider": self.extra.get("provider"),
        }}


def _status_of(exc: BaseException) -> int | None:
    for attr in ("status_code", "status", "http_status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    value = getattr(response, "status_code", None)
    return value if isinstance(value, int) else None


def classify(exc: BaseException, secrets: Iterable[str] = ()) -> dict:
    """An engine failure as {code, message, details, retryable}, with secrets removed."""
    name = type(exc).__name__
    text = redact(str(exc), secrets) or name
    status = _status_of(exc)
    lowered = f"{name} {text}".lower()
    if status in (401, 403) or "authentication" in lowered or "permissiondenied" in lowered \
            or "api key for provider" in lowered or "invalid_api_key" in lowered:
        return {"code": "PROVIDER_AUTH_FAILED", **both("模型凭证未通过验证或缺失。", "The model credentials were rejected or are missing."),
                "details": f"{name}: {text}", "retryable": False}
    if status == 429 or "ratelimit" in lowered or "rate limit" in lowered or "quota" in lowered:
        return {"code": "PROVIDER_RATE_LIMITED", **both("模型服务限流或额度不足。", "The model service is rate limiting or out of quota."),
                "details": f"{name}: {text}", "retryable": True}
    if "timeout" in lowered or "timed out" in lowered:
        return {"code": "PROVIDER_TIMEOUT", **both("调用超时。", "The call timed out."),
                "details": f"{name}: {text}", "retryable": True}
    if "connection" in lowered or "unreachable" in lowered or "name resolution" in lowered:
        return {"code": "NETWORK_ERROR", **both("网络连接失败。", "The network connection failed."),
                "details": f"{name}: {text}", "retryable": True}
    if status == 404 or "model_not_found" in lowered or "does not exist" in lowered:
        return {"code": "PROVIDER_MODEL_NOT_FOUND", **both("模型不存在或当前账号无权使用。", "The model does not exist or this account cannot use it."),
                "details": f"{name}: {text}", "retryable": False}
    if status is not None and 400 <= status < 500:
        return {"code": "PROVIDER_REQUEST_REJECTED", **both(f"模型服务拒绝了请求（HTTP {status}）。", f"The model service rejected the request (HTTP {status})."),
                "details": f"{name}: {text}", "retryable": False}
    if status is not None and status >= 500:
        return {"code": "PROVIDER_UNAVAILABLE", **both(f"模型服务暂时不可用（HTTP {status}）。", f"The model service is unavailable (HTTP {status})."),
                "details": f"{name}: {text}", "retryable": True}
    if isinstance(exc, ValueError):
        return {"code": "INVALID_INPUT", **both("输入或配置无效。", "The input or configuration is invalid."),
                "details": f"{name}: {text}", "retryable": False}
    return {"code": "INTERNAL_ERROR", **both("运行中出现未预期的错误。", "An unexpected error occurred during the run."),
            "details": f"{name}: {text}", "retryable": False}
