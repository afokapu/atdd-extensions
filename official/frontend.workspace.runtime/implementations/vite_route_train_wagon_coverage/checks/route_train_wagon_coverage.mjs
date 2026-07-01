#!/usr/bin/env node
// Detector: Route -> Train -> Wagon coverage  (family member emitting 3 rule_ids)
//
//   coder.vite.route-trainid-not-registered        (sev 3, BOUNDARIES-ROUTE-COVERAGE-001)
//   coder.vite.route-resolved-train-lists-wagon     (sev 3, BOUNDARIES-ROUTE-COVERAGE-002)
//   coder.vite.route-trainid-expression-not-static  (sev 1, BOUNDARIES-ROUTE-COVERAGE-003, advisory)
//
// Vite/React realization of the agnostic route-coverage obligation
// (frontend.convention.yaml::train_composition.route_train_wagon_coverage,
// SPEC-CODER-ROUTE-0005). Faithful port of the python analyzer
// src/atdd/coder/validators/route_train_wagon_analyzer.py (regex per Decision #1):
// every `<TrainView trainId="..." />` in a router file must resolve to a train
// registered in plan/_trains.yaml, and that train's wagons must be registered in
// plan/_wagons.yaml. Dynamic trainId expressions are advisory-only (never hard-fail,
// Decision #4).
//
// CONTRACT (frontend.workspace.runtime v1.1):
//   INPUT   env ATDD_SCAN_ROOTS      JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES   JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
// RAW factual channel only — exits 0 even with violations; non-zero only on fault.

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, extname, sep, dirname, basename } from "node:path";

const RULE_UNREGISTERED_TRAIN = "coder.vite.route-trainid-not-registered";
const RULE_UNREGISTERED_WAGON = "coder.vite.route-resolved-train-lists-wagon";
const RULE_DYNAMIC_TRAIN_ID = "coder.vite.route-trainid-expression-not-static";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Router files: web/src/**/App.tsx and **/router.tsx (frontend.convention.yaml
// route_train_wagon_coverage.router_patterns).
function isRouterFile(path) {
  if (extname(path) !== ".tsx" || TEST_RE.test(path)) return false;
  const b = basename(path).toLowerCase();
  return b === "app.tsx" || b === "router.tsx";
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}

function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}

function* walk(root, excludes) {
  let st;
  try { st = statSync(root); } catch { return; }
  if (st.isFile()) { yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else yield full;
  }
}

// --- comment stripping: replace TS/JSX comments with spaces, keep newlines ---
function stripComments(content) {
  content = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  content = content.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
  return content;
}

function lineOf(content, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < content.length; i++) if (content[i] === "\n") n++;
  return n;
}

const TRAINVIEW_TAG_RE = /<TrainView\b([^>]*?)\/?>/gs;
const TRAINID_LITERAL_RE = /trainId\s*=\s*"([^"]*)"/;
const TRAINID_EXPR_RE = /trainId\s*=\s*\{([^}]+)\}/;
const BARE_IDENT_RE = /^[A-Za-z_]\w*$/;

function resolveConstInFile(name, content) {
  const re = new RegExp("\\bconst\\s+" + name + "\\s*(?::\\s*\\w+)?\\s*=\\s*\"([^\"]*)\"");
  const m = content.match(re);
  return m ? m[1] : null;
}

// One binding per <TrainView ...> occurrence. resolved=null => UNKNOWN.
function parseBindings(content) {
  const sanitized = stripComments(content);
  const bindings = [];
  let m;
  TRAINVIEW_TAG_RE.lastIndex = 0;
  while ((m = TRAINVIEW_TAG_RE.exec(sanitized)) !== null) {
    const attrs = m[1];
    const line = lineOf(sanitized, m.index);
    const lit = attrs.match(TRAINID_LITERAL_RE);
    if (lit) { bindings.push({ line, raw: lit[1], resolved: lit[1] }); continue; }
    const expr = attrs.match(TRAINID_EXPR_RE);
    if (expr) {
      const raw = expr[1].trim();
      let resolved = null;
      if (BARE_IDENT_RE.test(raw)) resolved = resolveConstInFile(raw, sanitized);
      bindings.push({ line, raw, resolved });
    }
  }
  return bindings;
}

// --- minimal YAML readers for plan/_trains.yaml + plan/_wagons.yaml -----------
// The plan files use a fixed, well-known shape. We do a tolerant line scan rather
// than pull in a YAML dependency (zero-dep contract).
function loadRegisteredTrains(trainsFile) {
  // returns { train_id: [wagon, ...] }
  let text;
  try { text = readFileSync(trainsFile, "utf8"); } catch { return {}; }
  const out = {};
  const lines = text.split(/\r?\n/);
  let currentTid = null;
  let inWagons = false;
  let wagonsIndent = -1;
  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const tidM = line.match(/^\s*-\s*train_id:\s*(.+?)\s*$/);
    if (tidM) {
      currentTid = tidM[1].replace(/^["']|["']$/g, "");
      out[currentTid] = [];
      inWagons = false;
      continue;
    }
    if (currentTid) {
      const wagonsHeader = line.match(/^(\s*)wagons:\s*$/);
      if (wagonsHeader) { inWagons = true; wagonsIndent = wagonsHeader[1].length; continue; }
      if (inWagons) {
        const item = line.match(/^(\s*)-\s+(.+?)\s*$/);
        if (item && item[1].length >= wagonsIndent) {
          out[currentTid].push(item[2].replace(/^["']|["']$/g, ""));
          continue;
        }
        // any non-deeper line ends the wagons list
        if (!/^\s*#/.test(line)) inWagons = false;
      }
    }
  }
  return out;
}

function loadRegisteredWagons(wagonsFile) {
  let text;
  try { text = readFileSync(wagonsFile, "utf8"); } catch { return new Set(); }
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*wagon:\s*(.+?)\s*$/);
    if (m) out.add(m[1].replace(/^["']|["']$/g, ""));
  }
  return out;
}

// Locate the plan registry nearest to a router file by walking up ancestors.
function findPlanFiles(routerPath) {
  let dir = dirname(routerPath);
  let prev = null;
  while (dir && dir !== prev) {
    for (const base of [join(dir, "plan"), dir]) {
      const t = join(base, "_trains.yaml");
      const w = join(base, "_wagons.yaml");
      if (existsSync(t)) return { trains: t, wagons: existsSync(w) ? w : null };
    }
    prev = dir;
    dir = dirname(dir);
  }
  return { trains: null, wagons: null };
}

function analyzeRouter(routerPath, content, registeredTrains, registeredWagons, violations) {
  const lines = content.split(/\r?\n/);
  for (const b of parseBindings(content)) {
    const src = (lines[b.line - 1] || "").trim();
    if (b.resolved === null) {
      violations.push({
        rule_id: RULE_DYNAMIC_TRAIN_ID, file: routerPath, line: b.line, col: 1,
        evidence: `trainId expression \`${b.raw}\` cannot be statically resolved (UNKNOWN); advisory only, never hard-fails`,
        source_line: src,
      });
      continue;
    }
    const tid = b.resolved;
    if (!(tid in registeredTrains)) {
      const reg = Object.keys(registeredTrains).sort().join(", ") || "<none>";
      violations.push({
        rule_id: RULE_UNREGISTERED_TRAIN, file: routerPath, line: b.line, col: 1,
        evidence: `trainId="${tid}" is not registered in plan/_trains.yaml. Registered: [${reg}]`,
        source_line: src,
      });
      continue;
    }
    for (const wagon of registeredTrains[tid] || []) {
      if (!registeredWagons.has(wagon)) {
        violations.push({
          rule_id: RULE_UNREGISTERED_WAGON, file: routerPath, line: b.line, col: 1,
          evidence: `train "${tid}" lists wagon "${wagon}" which is not registered in plan/_wagons.yaml`,
          source_line: src,
        });
      }
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("route-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const routers = [];
  for (const root of roots) for (const file of walk(root, excludes)) if (isRouterFile(file)) routers.push(file);

  const planCache = new Map();
  const violations = [];
  for (const routerPath of routers) {
    const { trains, wagons } = findPlanFiles(routerPath);
    if (!trains) continue; // no plan registry reachable — nothing to resolve against
    const key = trains + "|" + (wagons || "");
    if (!planCache.has(key)) {
      planCache.set(key, {
        trains: loadRegisteredTrains(trains),
        wagons: wagons ? loadRegisteredWagons(wagons) : new Set(),
      });
    }
    const plan = planCache.get(key);
    let content;
    try { content = readFileSync(routerPath, "utf8"); } catch { continue; }
    analyzeRouter(routerPath, content, plan.trains, plan.wagons, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`route-detector: ${routers.length} router(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
