// Shared helpers for the convex_journey_test_detector family checks.
// Zero-dependency. Each member check imports these; the family runner still runs
// each member as its own subprocess (import is resolved locally at load time).
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

export const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
export const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export const TRAIN_URN_RE = /^train:\d{4}-[a-z0-9][a-z0-9-]*$/;
export const JOURNEY_URN_RE = /^test:train:\d{4}-[a-z0-9][a-z0-9-]*:[A-Z0-9]+-\d{3}-[a-z0-9][a-z0-9-]*$/;

export function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}
// Walk yielding ONLY test files — tester rules govern the test surface.
export function* walkTests(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { if (TS_EXT.has(extname(root)) && TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walkTests(full, excludes);
    else if (TS_EXT.has(extname(full)) && TEST_RE.test(full)) yield full;
  }
}

// Parse the header markers (line-numbered, 1-based). Recognizes `// Key: value`.
export function parseHeader(text) {
  const lines = text.split(/\r?\n/);
  const h = { urn: null, urnLine: 0, train: null, trainLine: 0, layer: null, layerLine: 0, acceptLine: 0, wmbtLine: 0, lines };
  const grab = (line, key) => {
    const m = new RegExp("^\\s*//\\s*" + key + ":\\s*(\\S+)", "i").exec(line);
    return m ? m[1] : null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!h.urn) { const v = grab(line, "URN"); if (v) { h.urn = v; h.urnLine = i + 1; } }
    if (!h.train) { const v = grab(line, "Train"); if (v) { h.train = v; h.trainLine = i + 1; } }
    if (!h.layer) { const v = grab(line, "Layer"); if (v) { h.layer = v; h.layerLine = i + 1; } }
    if (!h.acceptLine && /^\s*\/\/\s*Acceptance:/i.test(line)) h.acceptLine = i + 1;
    if (!h.wmbtLine && /^\s*\/\/\s*WMBT:/i.test(line)) h.wmbtLine = i + 1;
  }
  h.isJourney = (h.urn && h.urn.startsWith("test:train:")) || !!h.train;
  return h;
}

export function iterTestFiles() {
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const files = [];
  for (const root of roots) for (const f of walkTests(root, excludes)) files.push(f);
  return files;
}

export function readText(file) {
  try { return readFileSync(file, "utf8"); } catch { return null; }
}
