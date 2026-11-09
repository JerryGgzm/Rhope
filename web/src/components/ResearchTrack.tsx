import { Check, X } from "lucide-react";
import { STAGES, analystLabel, formatDuration, type StageKey, type StepState } from "../lib/labels";

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

const STATE_TEXT: Record<StepState, string> = {
  pending: "等待",
  running: "进行中",
  done: "完成",
  failed: "失败",
  warn: "完成 · 有警告",
  skipped: "未选择",
};

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
    <ol className="track" aria-label="研究进度" style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
                <span className="visually-hidden">：{STATE_TEXT[s.state]}</span>
              </span>
              <div className="track-meta">
                {stage.key === "analysts" ? (
                  model.analysts.map((lane) => (
                    <div className="lane" data-state={lane.state} key={lane.key}>
                      <span className="dot" data-tone={LANE_DOT[lane.state]} aria-hidden />
                      <span>{lane.label ?? analystLabel(lane.key)}</span>
                      <span className="visually-hidden">{STATE_TEXT[lane.state]}</span>
                      <span className="time">
                        {lane.state === "skipped" ? "未选" : lane.seconds != null ? formatDuration(lane.seconds) : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="lane">
                    <span className={s.state === "failed" ? "danger-text" : undefined}>{s.detail ?? STATE_TEXT[s.state]}</span>
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
