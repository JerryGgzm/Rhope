import { Check, X } from "lucide-react";
import { STAGES, analystLabel, formatDuration, type StageKey, type StepState } from "../lib/labels";
import { t } from "../lib/i18n";

export interface TrackLane {
  key: string;
  label?: string;
  state: StepState;
  seconds?: number | null;
}

export interface TrackModel {
  stages: Record<StageKey, { state: StepState; seconds?: number | null; detail?: string }>;
  analysts: TrackLane[];
}

const STATE_TEXT: Record<StepState, readonly [string, string]> = {
  pending: ["等待", "Waiting"],
  running: ["进行中", "Running"],
  done: ["完成", "Done"],
  failed: ["失败", "Failed"],
  warn: ["完成 · 有警告", "Done · warnings"],
  skipped: ["未选择", "Not selected"],
};

const stateText = (s: StepState) => t(...STATE_TEXT[s]);

const LANE_DOT: Record<StepState, string> = {
  pending: "hollow",
  running: "active",
  done: "ok",
  failed: "danger",
  warn: "caution",
  skipped: "muted",
};

function NodeGlyph({ state }: { state: StepState }) {
  if (state === "done" || state === "warn") return <Check size={11} strokeWidth={3} />;
  if (state === "failed") return <X size={11} strokeWidth={3} />;
  return null;
}

export function ResearchTrack({ model }: { model: TrackModel }) {
  return (
    <ol className="track" aria-label={t("研究进度", "Research progress")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {STAGES.map((stage) => {
        const s = model.stages[stage.key];
        const finished = s.state === "done" || s.state === "warn";
        return (
          <li className="track-step" data-state={s.state} key={stage.key}>
            <span className="track-line" style={{ ["--fill" as string]: finished ? 1 : 0 }} aria-hidden />
            <span className="track-node" data-state={s.state} aria-hidden>
              <NodeGlyph state={s.state} />
            </span>
            <div className="track-text stack-sm" style={{ gap: 6 }}>
              <span className="track-label">
                {stage.label}
                <span className="visually-hidden">: {stateText(s.state)}</span>
              </span>
              <div className="track-meta">
                {stage.key === "analysts" ? (
                  model.analysts.map((lane) => (
                    <div className="lane" data-state={lane.state} key={lane.key}>
                      <span className="dot" data-tone={LANE_DOT[lane.state]} aria-hidden />
                      <span>{lane.label ?? analystLabel(lane.key)}</span>
                      <span className="visually-hidden">{stateText(lane.state)}</span>
                      <span className="time">
                        {lane.state === "skipped" ? t("未选", "Off") : lane.seconds != null ? formatDuration(lane.seconds) : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="lane">
                    <span className={s.state === "failed" ? "danger-text" : undefined}>{s.detail ?? stateText(s.state)}</span>
                    {s.seconds != null && <span className="time">{formatDuration(s.seconds)}</span>}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
