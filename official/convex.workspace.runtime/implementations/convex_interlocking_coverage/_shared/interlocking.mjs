// Shared helpers for the convex_interlocking_coverage FAMILY detector.
// Convex/TS realization of the core python `interlocking_coverage.py` detector (core
// afokapu/atdd#1248 route space + #1251 runner call model). Each check under ../checks/*.mjs imports
// this module and scans a consumer tree for ONE tester.convex.interlocking-* rule.
//
// ZERO third-party deps — node builtins only. The interlocking route space is stack-neutral planner
// data (snake_case, plan/_trains/_interlockings/**); the e2e tests are Convex/TS under e2e/**.

import { readFileSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

export const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];

// Production runner symbols (core #1251 call model).
export const PROD_INTERLOCKING = "InterlockingRunner";
export const PROD_TRAIN = "TrainRunner";

// Required trace-binding fields (core #1251 trace contract), TS camelCase. routeCategory is
// distinguished from routeCategoryDigit by a word boundary that a trailing "Digit" defeats.
export const REQUIRED_TRACE_FIELDS = [
  ["interlockingId", /\binterlockingId\b/],
  ["routeId", /\brouteId\b/],
  ["selectedTrainId", /\bselectedTrainId\b/],
  ["routeCategory", /\brouteCategory\b/],
  ["routeCategoryDigit", /\brouteCategoryDigit\b/],
  ["guardId", /\bguardId\b/],
  ["resolutionStrategy", /\bresolutionStrategy\b/],
  ["resolutionReason", /\bresolutionReason\b/],
];

// Forbidden runner-substitution patterns (production-runner-used), Convex/vitest idioms.
export const FORBIDDEN_PATTERNS = [
  ["MockInterlockingRunner", /\bMockInterlockingRunner\b/],
  ["MockTrainRunner", /\bMockTrainRunner\b/],
  [
    "vi.mock()/jest.mock() around a runner module",
    /\b(?:vi|jest)\.mock\s*\(\s*[^)]*(?:interlocking|InterlockingRunner|TrainRunner|runner)/,
  ],
  [
    "vi.spyOn()/jest.spyOn() replacing runner behavior",
    /\b(?:vi|jest)\.spyOn\s*\(\s*[^)]*(?:InterlockingRunner|TrainRunner|resolveTrain|execute)/,
  ],
  [
    "hand-built route resolver replacing InterlockingRunner",
    /(?:^|\n)\s*(?:(?:async\s+)?function\s+resolveTrain|class\s+\w*Resolver)\b/,
  ],
];

export const STATION_MASTER = /\b(?:StationMaster|station_master|stationMaster)\b/;
export const TRACE_OBJECT = /\btrace\b/;

export function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

// Blank `//` and `/* */` comments to spaces (offsets/newlines preserved); keep string literals so a
// routeId/trainId token inside a `.toBe("...")` literal and a `trace.routeId` identifier still match,
// but a route/field name that only appears in a comment does NOT count as coverage/an assertion.
export function maskComments(text) {
  const out = text.split("");
  const n = text.length;
  let i = 0;
  let state = "code";
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : "";
    if (state === "code") {
      if (c === "/" && d === "/") { out[i] = out[i + 1] = " "; i += 2; state = "line"; continue; }
      if (c === "/" && d === "*") { out[i] = out[i + 1] = " "; i += 2; state = "block"; continue; }
      if (c === "'") { i++; state = "sq"; continue; }
      if (c === '"') { i++; state = "dq"; continue; }
      if (c === "`") { i++; state = "tpl"; continue; }
      i++;
      continue;
    }
    if (state === "line") { if (c === "\n") state = "code"; else out[i] = " "; i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { out[i] = out[i + 1] = " "; i += 2; state = "code"; continue; } if (c !== "\n") out[i] = " "; i++; continue; }
    if (state === "sq" || state === "dq") { const q = state === "sq" ? "'" : '"'; if (c === "\\") { i += 2; continue; } if (c === q) state = "code"; i++; continue; }
    if (c === "\\") { i += 2; continue; }
    if (c === "`") { state = "code"; i++; continue; }
    i++;
  }
  return out.join("");
}

export function lineOfIndex(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

export function lineAt(text, lineno) {
  const lines = text.split(/\r?\n/);
  return lineno >= 1 && lineno <= lines.length ? lines[lineno - 1].trim() : "";
}

export function rel(path, root) {
  const r = root.endsWith(sep) ? root : root + sep;
  return path.startsWith(r) ? path.slice(r.length) : path;
}

export function mk(ruleId, file, line, col, evidence, sourceLine) {
  return { rule_id: ruleId, file, line, col, evidence, source_line: sourceLine };
}

function isExcluded(path) {
  return path.split(sep).some((s) => DEFAULT_EXCLUDES.includes(s));
}

function hasChildDir(dir, name) {
  try {
    return statSync(join(dir, name)).isDirectory();
  } catch {
    return false;
  }
}

function* walkDirs(root) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  yield root;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) yield* walkDirs(full);
  }
}

export function findConsumerRoots(scanRoot) {
  const roots = new Set();
  for (const d of walkDirs(scanRoot)) {
    if (hasChildDir(d, "plan") || hasChildDir(d, "e2e") || hasChildDir(d, "convex")) roots.add(d);
  }
  return [...roots];
}

function* walkFiles(dir, pred) {
  let st;
  try {
    st = statSync(dir);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (pred(dir)) yield dir;
    return;
  }
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (isExcluded(full)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) yield* walkFiles(full, pred);
    else if (pred(full)) yield full;
  }
}

const isYaml = (f) => f.endsWith(".yaml") || f.endsWith(".yml");
const isTs = (f) => f.endsWith(".ts") || f.endsWith(".tsx");

export function interlockingFiles(croot) {
  const base = join(croot, "plan", "_trains", "_interlockings");
  const out = [...walkFiles(base, isYaml)];
  const idx = join(croot, "plan", "_trains", "_interlockings.yaml");
  try {
    if (statSync(idx).isFile()) out.push(idx);
  } catch {
    /* absent */
  }
  return [...new Set(out)].sort();
}

export function e2eFiles(croot) {
  return [...walkFiles(join(croot, "e2e"), isTs)].sort();
}

// Interlocking YAML parse — declares interlocking_id + a non-empty routes list (core #1248,
// snake_case planner data). Registry/projection docs with no routes yield null.
export function parseInterlocking(text) {
  const lines = text.split(/\r?\n/);
  const idM = text.match(/^interlocking_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/m);
  if (!idM) return null;
  const interlockingId = idM[1].trim();

  const routes = [];
  const ri = lines.findIndex((l) => /^routes:\s*(?:#.*)?$/.test(l));
  if (ri >= 0) {
    for (let i = ri + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\S/.test(l)) break;
      const rm = l.match(/^\s*-\s*route_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
      if (rm) {
        routes.push({
          routeId: rm[1].trim(),
          line: i + 1,
          sourceLine: l,
          trainId: null,
          category: null,
          categoryDigit: null,
        });
      } else if (routes.length) {
        const cur = routes[routes.length - 1];
        const tm = l.match(/^\s*train_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
        if (tm) cur.trainId = tm[1].trim();
        const cm = l.match(/^\s*category:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
        if (cm) cur.category = cm[1].trim();
        const dm = l.match(/^\s*category_digit:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
        if (dm) cur.categoryDigit = dm[1].trim();
      }
    }
  }
  if (!routes.length) return null;

  let exposed = false;
  const actions = [];
  const ei = lines.findIndex((l) => /^entrypoint:\s*(?:#.*)?$/.test(l));
  if (ei >= 0) {
    for (let i = ei + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\S/.test(l)) break;
      if (/^\s*exposed:\s*true\b/.test(l)) exposed = true;
      if (/^\s*actions:\s*(?:#.*)?$/.test(l)) {
        for (let j = i + 1; j < lines.length; j++) {
          const am = lines[j].match(/^\s*-\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
          if (am) actions.push(am[1].trim());
          else break;
        }
      }
    }
  }
  return { interlockingId, routes, exposed, actions, rawText: text };
}

export function lineOf(text, pattern, def = 1) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (pattern.test(lines[i])) return [i + 1, lines[i]];
  return [def, ""];
}

// A token appears not flanked by identifier chars (allowing the id chars used in route/train ids).
export function tokenCovered(token, text) {
  if (!token) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\w-])" + esc + "(?![\\w-])").test(text);
}

export function isRouteCovered(route, e2eTexts) {
  return e2eTexts.some((t) => tokenCovered(route.routeId, t) || tokenCovered(route.trainId, t));
}

export function interlockingTokenSet(records) {
  const tokens = new Set();
  for (const rec of records) {
    tokens.add(rec.interlockingId);
    for (const r of rec.routes) {
      if (r.routeId) tokens.add(r.routeId);
      if (r.trainId) tokens.add(r.trainId);
    }
  }
  return [...tokens].filter(Boolean);
}

export function isInterlockingTest(text, tokens) {
  if (text.includes(PROD_INTERLOCKING) || text.includes(PROD_TRAIN) || text.includes("resolveTrain")) {
    return true;
  }
  return tokens.some((t) => tokenCovered(t, text));
}

export function writeReport(violations) {
  const rp = process.env.ATDD_VIOLATIONS_REPORT;
  if (!rp) {
    process.stderr.write("convex-interlocking-coverage: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  writeFileSync(rp, JSON.stringify({ violations }, null, 2), "utf8");
  process.exit(0);
}
