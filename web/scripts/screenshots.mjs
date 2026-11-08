// Capture review screenshots with the local Chrome.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const outDir = process.argv[3] ?? "../docs/web-prototype";
const chrome =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const shots = [
  { name: "01-analysis", path: "/analysis", w: 1440, h: 900 },
  {
    name: "02-analysis-filled",
    path: "/analysis",
    w: 1440,
    h: 900,
    run: async (p) => {
      await p.type("#ticker", "BTC-USD");
      await clickText(p, "button", "选快照");
    },
  },
  { name: "03-run-running", path: "/runs/demo-running", w: 1440, h: 900 },
  { name: "04-run-completed", path: "/runs/demo-completed", w: 1440, h: 900, full: true },
  {
    name: "05-run-reports",
    path: "/runs/demo-completed",
    w: 1440,
    h: 900,
    full: true,
    run: (p) => clickText(p, "button[role=tab]", "分析报告"),
  },
  { name: "06-run-failed", path: "/runs/demo-failed", w: 1440, h: 900 },
  {
    name: "07-run-log",
    path: "/runs/demo-running",
    w: 1440,
    h: 900,
    run: (p) => clickText(p, "button[role=tab]", "运行记录"),
  },
  {
    name: "08-diagnostics-drawer",
    path: "/runs/demo-completed",
    w: 1440,
    h: 900,
    run: (p) => clickText(p, "button", "诊断"),
  },
  { name: "09-runs", path: "/runs", w: 1440, h: 900 },
  { name: "10-portfolio", path: "/portfolio", w: 1440, h: 900 },
  { name: "11-backtests", path: "/backtests", w: 1440, h: 900, full: true },
  { name: "12-memory", path: "/memory", w: 1440, h: 900 },
  { name: "13-settings", path: "/settings", w: 1440, h: 900, full: true },
  { name: "14-run-completed-390", path: "/runs/demo-completed", w: 390, h: 844, full: true, mobile: true },
  { name: "15-analysis-390", path: "/analysis", w: 390, h: 844, mobile: true },
  { name: "16-analysis-1280", path: "/analysis", w: 1280, h: 800 },
  { name: "17-run-1920", path: "/runs/demo-completed", w: 1920, h: 1080 },
  { name: "18-portfolio-768", path: "/portfolio", w: 768, h: 1024 },
];

async function clickText(page, selector, text) {
  await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.includes(t));
      el?.click();
    },
    selector,
    text,
  );
  await new Promise((r) => setTimeout(r, 350));
}

const only = process.env.ONLY?.split(",");
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-first-run"] });
try {
  for (const s of shots) {
    if (only && !only.some((o) => s.name.includes(o))) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1, isMobile: !!s.mobile, hasTouch: !!s.mobile });
    await page.goto(base + s.path, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    if (s.run) await s.run(page);
    await new Promise((r) => setTimeout(r, 300));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: join(outDir, `${s.name}.png`), fullPage: !!s.full });
    console.log(`${s.name}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
}
