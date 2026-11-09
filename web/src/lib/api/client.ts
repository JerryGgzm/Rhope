import type { ApiErrorBody } from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
  fieldError(key: string): string | undefined {
    return this.body.field_errors.find((f) => f.key === key)?.message;
  }
}

/** The request never reached the service (it is down or the network failed). */
export class OfflineError extends Error {
  constructor() {
    super("无法连接本地服务。");
  }
}

let csrf: Promise<string> | null = null;

function csrfToken(refresh = false): Promise<string> {
  if (!csrf || refresh) {
    csrf = fetch(`${BASE}/session`, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("session");
        return r.json();
      })
      .then((b: { csrf_token: string }) => b.csrf_token)
      .catch((e) => {
        csrf = null;
        throw e;
      });
  }
  return csrf;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    const json = await res.json();
    body = json.error ?? { code: "HTTP_" + res.status, message: res.statusText, field_errors: [] };
  } catch {
    body = { code: "HTTP_" + res.status, message: `服务返回 ${res.status}`, field_errors: [] };
  }
  body.field_errors ??= [];
  return new ApiError(res.status, body);
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const unsafe = method !== "GET" && method !== "HEAD";
  const send = async (refresh: boolean) => {
    const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (unsafe) headers["X-CSRF-Token"] = await csrfToken(refresh);
    return fetch(BASE + path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      signal: init.signal,
    });
  };
  let res: Response;
  try {
    res = await send(false);
    if (res.status === 403 && unsafe) {
      const err = await parseError(res.clone());
      // The service restarted and issued a new session token: fetch it once and retry.
      if (err.body.code === "CSRF_INVALID") res = await send(true);
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new OfflineError();
  }
  // A dev proxy answers for a stopped service with a non-JSON 5xx.
  if (res.status >= 500 && !(res.headers.get("content-type") ?? "").includes("application/json")) {
    throw new OfflineError();
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function artifactUrl(runId: string, artifactId: string, inline = false) {
  return `${BASE}/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}${inline ? "?inline=true" : ""}`;
}

export function eventsUrl(runId: string, after: number) {
  return `${BASE}/runs/${encodeURIComponent(runId)}/events?after=${after}`;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.body.message;
  if (e instanceof OfflineError) return e.message;
  return "出现未知错误。";
}
