import { AlertTriangle, Check, Loader2, X } from "lucide-react";
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

function NodeIcon({ state }: { state: StepState }) {
  if (state === "done") return <Check size={15} />;
  if (state === "failed") return <X size={15} />;
  if (state === "warn") return <AlertTriangle size={14} />;
  if (state === "running") return <Loader2 size={15} className="spin" />;
  return <span style={{ width: 6, height: 6, borderRadius: 6, background: "currentColor" }} />;
}

const STATE_TEXT: Record<StepState, string> = {
  pending: "等待",
  running: "进行中",
  done: "完成",
  failed: "失败",
  warn: "有警告",
  skipped: "未选择",
};

export function ResearchTrack({ model }: { model: TrackModel }) {
  return (
    <div className="track" aria-label="研究轨道">
      {STAGES.map((stage) => {
        const s = model.stages[stage.key];
        return (
          <div className="track-stage" key={stage.key}>
            <div className="track-head">
              <span className="node" data-state={s.state} aria-hidden>
                <NodeIcon state={s.state} />
              </span>
              <span>{stage.label}</span>
              <span className="visually-hidden">：{STATE_TEXT[s.state]}</span>
            </div>
            <div className="track-sub">
              {stage.key === "analysts" ? (
                model.analysts.map((lane) => (
                  <div className="lane" data-state={lane.state} key={lane.key}>
                    <span className="mini-node" aria-hidden />
                    <span>{lane.label ?? analystLabel(lane.key)}</span>
                    <span className="visually-hidden">{STATE_TEXT[lane.state]}</span>
                    <span className="time">
                      {lane.state === "skipped" ? "未选" : lane.seconds != null ? formatDuration(lane.seconds) : ""}
                    </span>
                  </div>
                ))
              ) : (
                <div className="lane" data-state={s.state}>
                  <span className="faint">{s.detail ?? STATE_TEXT[s.state]}</span>
                  {s.seconds != null && <span className="time">{formatDuration(s.seconds)}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
