import { useSyncExternalStore } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "ta.lang";

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* storage unavailable: fall through to the browser language */
  }
  return (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function applyToDocument(l: Lang) {
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  document.title = l === "zh" ? "TradingAgents 研究工作台" : "TradingAgents Research Workbench";
}

let lang: Lang = initial();
const listeners = new Set<() => void>();
applyToDocument(lang);

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  applyToDocument(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* the choice just won't persist */
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The interface language; a component that shows text calls this so it re-renders on a switch. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang);
}

/** The text for the current interface language. */
export function t(zh: string, en: string): string {
  return lang === "en" ? en : zh;
}

/** A stored message in the current language: `message_en` when English is wanted and present. */
export function pickMessage(p: object | null | undefined, key = "message"): string {
  if (!p) return "";
  const r = p as Record<string, unknown>;
  const en = r[`${key}_en`];
  if (lang === "en" && typeof en === "string" && en) return en;
  return String(r[key] ?? "");
}

export const locale = () => (lang === "en" ? "en-US" : "zh-CN");
