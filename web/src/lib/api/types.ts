import type { Rating, RunStatus } from "../labels";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: string | null;
  field_errors: { key: string; message: string }[];
  request_id?: string | null;
  retryable?: boolean;
  run_id?: string | null;
  stage?: string | null;
  provider?: string | null;
}

export interface Health {
  status: string;
  version: string;
  storage: string;
  worker: { busy: boolean; queued: number };
}

export interface ProviderCap {
  id: string;
  label: string;
  default_url: string | null;
  key_env: string | null;
  key_optional: boolean;
  requires_url: boolean;
  signed_in: boolean;
  models: Record<"quick" | "deep", { label: string; id: string }[]>;
}

export interface Capabilities {
  version: string;
  providers: ProviderCap[];
  analysts: { id: string; label: string; crypto: boolean }[];
  languages: { id: string; label: string }[];
  depths: { id: string; rounds: number; label: string }[];
  ticker_examples: string[];
}

export type FieldType = "string" | "integer" | "number" | "boolean" | "enum" | "string_list" | "map" | "path" | "url";
export type Source = "web" | "env" | "default";

export interface SettingField {
  key: string;
  kind: "config" | "env";
  group: string;
  label: string;
  type: FieldType;
  description: string;
  nullable: boolean;
  enum: string[];
  minimum: number | null;
  maximum: number | null;
  secret_like: boolean;
  providers: string[];
  env: string | null;
  default: unknown;
  inherited: unknown;
  value: unknown;
  source: Source;
}

export interface Credential {
  name: string;
  group: "llm" | "data" | "aws";
  label: string;
  providers: string[];
  optional: boolean;
  configured: boolean;
  source: "web" | "env" | null;
}

export interface SettingsDoc {
  revision: number;
  saved_at: string | null;
  groups: { id: string; label: string }[];
  fields: SettingField[];
  credentials: Credential[];
}

export interface RunModels {
  quick: string | null;
  deep: string | null;
  provider: string | null;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  ticker: string;
  analysis_date: string;
  asset_type: "stock" | "crypto";
  rating: Rating | null;
  warnings: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  models: RunModels;
  portfolio: { source: string; id?: string; version?: number; name?: string } | null;
}

export interface Artifact {
  id: string;
  kind: "state" | "report_md" | "report_html" | "report_zip";
  name: string;
  media_type: string;
  size: number | null;
  created_at: string;
}

export interface PhaseState {
  state: "pending" | "running" | "completed";
  started_at?: string;
  finished_at?: string;
}

export interface RunDetail extends RunSummary {
  request: {
    ticker: string;
    analysis_date: string;
    asset_type: string;
    analysts: string[];
    overrides: Record<string, unknown>;
    portfolio: { mode: string; id?: string | null; version?: number | null };
    checkpoint_enabled: boolean | null;
    report_options: { save: boolean; html: boolean };
    settings_revision: number;
  };
  config: Record<string, unknown>;
  settings_revision: number | null;
  portfolio_detail: Record<string, unknown> | null;
  error: (ApiErrorBody & { traceback?: string; stage?: string }) | null;
  stats: { llm_calls: number; tool_calls: number; tokens_in: number; tokens_out: number } | null;
  cancel_requested: boolean;
  artifacts: Artifact[];
  memory_note: string | null;
  last_sequence: number;
  stages: Record<string, PhaseState>;
  agents: Record<string, PhaseState>;
}

export interface RunEvent {
  schema_version: number;
  event_id: string;
  run_id: string;
  sequence: number;
  timestamp: string;
  type: string;
  stage: string | null;
  agent: string | null;
  severity: "info" | "warning" | "error";
  payload: Record<string, unknown>;
}

export interface RunCreateBody {
  ticker: string;
  analysis_date: string;
  asset_type?: "stock" | "crypto";
  analysts: string[];
  settings_revision: number;
  overrides: Record<string, unknown>;
  portfolio: { mode: "none" | "flat" | "snapshot"; id?: string; version?: number };
  checkpoint_enabled: boolean;
  report_options: { save: boolean; html: boolean };
}
