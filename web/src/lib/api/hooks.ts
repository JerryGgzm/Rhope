import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, eventsUrl } from "./client";
import type {
  Capabilities,
  Health,
  RunCreateBody,
  RunDetail,
  RunEvent,
  RunSummary,
  SettingsDoc,
} from "./types";

export const keys = {
  health: ["health"] as const,
  capabilities: ["capabilities"] as const,
  settings: ["settings"] as const,
  runs: (q: object) => ["runs", q] as const,
  run: (id: string) => ["run", id] as const,
  sections: (id: string) => ["sections", id] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: () => api<Health>("/health"),
    refetchInterval: (q) => (q.state.status === "error" ? 3000 : 10000),
    retry: false,
  });
}

export function useCapabilities() {
  return useQuery({ queryKey: keys.capabilities, queryFn: () => api<Capabilities>("/capabilities"), staleTime: 5 * 60_000 });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsDoc>("/settings") });
}

export interface SettingsPatch {
  base_revision: number;
  config?: Record<string, unknown>;
  reset?: string[];
  env?: Record<string, unknown>;
  env_reset?: string[];
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api<SettingsDoc>("/settings", { method: "PATCH", body: patch }),
    onSuccess: (doc) => qc.setQueryData(keys.settings, doc),
  });
}

export function useSaveCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { set?: Record<string, string>; clear?: string[] }) =>
      api<{ credentials: SettingsDoc["credentials"] }>("/credentials", { method: "PUT", body }),
    onSuccess: (res) =>
      qc.setQueryData<SettingsDoc>(keys.settings, (doc) => (doc ? { ...doc, credentials: res.credentials } : doc)),
  });
}

export function useRuns(q: { ticker?: string; status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v !== undefined && v !== "" && params.set(k, String(v)));
  return useQuery({
    queryKey: keys.runs(q),
    queryFn: () => api<{ total: number; items: RunSummary[] }>(`/runs?${params}`),
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => ["queued", "running", "cancelling"].includes(r.status)) ? 4000 : false,
  });
}

export function useRun(id: string) {
  return useQuery({ queryKey: keys.run(id), queryFn: () => api<RunDetail>(`/runs/${encodeURIComponent(id)}`) });
}

export function useSections(id: string) {
  return useQuery({
    queryKey: keys.sections(id),
    queryFn: () => api<{ sections: Record<string, string> }>(`/runs/${encodeURIComponent(id)}/sections`),
    select: (d) => d.sections,
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: RunCreateBody; key: string }) =>
      api<RunDetail>("/runs", { method: "POST", body, headers: { "Idempotency-Key": key } }),
    onSuccess: (run) => {
      qc.setQueryData(keys.run(run.id), run);
      qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useCancelRun(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => api<{ status: string }>(`/runs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { force } }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.run(id) }),
  });
}

export type StreamState = "connecting" | "open" | "lost" | "ended";

const RUN_REFRESH = /^(stage\.|agent\.|run\.|artifact\.|stats\.|queued|checkpoint)/;

/** A run's persisted events, replayed then followed live; resumes after the last one seen. */
export function useRunEvents(id: string) {
  const qc = useQueryClient();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [state, setState] = useState<StreamState>("connecting");
  const lastSeq = useRef(0);
  const buffer = useRef<RunEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    lastSeq.current = 0;
    buffer.current = [];
    let source: EventSource | null = null;
    let closed = false;
    let retry: number | undefined;
    let flushFrame: number | undefined;
    let refreshTimer: number | undefined;
    let sectionsTimer: number | undefined;

    const flush = () => {
      flushFrame = undefined;
      const batch = buffer.current;
      buffer.current = [];
      if (batch.length) setEvents((cur) => cur.concat(batch));
    };
    const refreshRun = () => {
      if (refreshTimer) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        qc.invalidateQueries({ queryKey: keys.run(id) });
      }, 300);
    };
    const refreshSections = () => {
      if (sectionsTimer) return;
      sectionsTimer = window.setTimeout(() => {
        sectionsTimer = undefined;
        qc.invalidateQueries({ queryKey: keys.sections(id) });
      }, 600);
    };

    const connect = () => {
      if (closed) return;
      setState((s) => (s === "lost" ? "lost" : "connecting"));
      source = new EventSource(eventsUrl(id, lastSeq.current));
      source.onopen = () => setState("open");
      source.addEventListener("run_event", (msg) => {
        const event = JSON.parse((msg as MessageEvent).data) as RunEvent;
        if (event.sequence <= lastSeq.current) return;
        lastSeq.current = event.sequence;
        buffer.current.push(event);
        flushFrame ??= window.requestAnimationFrame(flush);
        if (event.type === "report.updated") refreshSections();
        if (RUN_REFRESH.test(event.type)) refreshRun();
      });
      source.addEventListener("end", () => {
        source?.close();
        setState("ended");
        qc.invalidateQueries({ queryKey: keys.run(id) });
        qc.invalidateQueries({ queryKey: keys.sections(id) });
        qc.invalidateQueries({ queryKey: ["runs"] });
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        setState("lost");
        retry = window.setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      closed = true;
      source?.close();
      window.clearTimeout(retry);
      window.clearTimeout(refreshTimer);
      window.clearTimeout(sectionsTimer);
      if (flushFrame) window.cancelAnimationFrame(flushFrame);
    };
  }, [id, qc]);

  return { events, state };
}
