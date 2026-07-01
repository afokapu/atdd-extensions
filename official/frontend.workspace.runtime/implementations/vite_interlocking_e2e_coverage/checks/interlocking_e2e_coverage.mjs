#!/usr/bin/env node
// Detector: Interlocking route <-> E2E coverage (family member emitting 2 rule_ids)
//
//   tester.vite.interlocking-route-e2e-coverage      (sev 2)  an admissible interlocking
//        route with no covering Playwright E2E spec.
//   tester.vite.interlocking-station-master-smoke    (sev 2)  an interlocking that declares a
//        station_master but has no *.smoke.spec.ts covering its rendered surface.
//
// FRONTEND (E2E) half of interlocking coverage — sibling of the BACKEND
// tester.convex.interlocking-route-coverage / -smoke-coverage-for-station-master, whose
// convex_interlocking_coverage detector scans server interlocking source. This one scans
// the frontend interlocking registry + e2e spec tree.
//
// Interlocking registry = `plan/_interlocking.yaml` + `plan/_interlocking/*.yaml`, with
// `route_id: <slug>` entries (admissible routes) and an optional `station_master: <slug>`.
// A spec BINDS a route by any of: `// Interlocking: route:{id}` header, `{route_id}.` filename
// prefix, or an `e2e/{route_id}/` parent dir. A station-master smoke spec = a `*.smoke.spec.ts`
// with a `// StationMaster: {id}` header or a `{station_master}.` filename prefix.
//
// CONTRACT (frontend.workspace.runtime v1.1): env ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES /
// ATDD_VIOLATIONS_REPORT in; RAW {rule_id,file,line,col,evidence,source_line} out. Exits 0.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, basename, dirname } from "node:path";

const RULE_ROUTE = "tester.vite.interlocking-route-e2e-coverage";
const RULE_SM = "tester.vite.interlocking-station-master-smoke";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SMOKE_RE = /\.smoke\.spec\.[cm]?[jt]sx?$/;
const ROUTE_ID_RE = /^[a-z][a-z0-9-]*$/;
const FILENAME_PREFIX_RE = /^([a-z][a-z0-9-]*?)\./;
const ROUTE_HDR_RE = /^\s*\/\/\s*Interlocking:\s*route:([a-z][a-z0-9-]*)\s*$/m;
const SM_HDR_RE = /^\s*\/\/\s*StationMaster:\s*([a-z][a-z0-9-]*)\s*$/m;

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
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
function lineOfIndex(text, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

// An interlocking registry file: plan/_interlocking.yaml, or a *.yaml under an `_interlocking/` dir.
function isInterlockingRegistryFile(path) {
  const segs = path.split(sep);
  const b = basename(path);
  if (b === "_interlocking.yaml") return true;
  if (b.endsWith(".yaml") && segs.includes("_interlocking")) return true;
  return false;
}
function collectRegistry(file, routes, stationMasters) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  const rre = /route_id:\s*["']?([a-z][a-z0-9-]*)["']?/g;
  let m;
  while ((m = rre.exec(text)) !== null) {
    const rid = m[1];
    if (!routes.has(rid)) routes.set(rid, { file, line: lineOfIndex(text, m.index) });
  }
  const sre = /station_master:\s*["']?([a-z][a-z0-9-]*)["']?/g;
  while ((m = sre.exec(text)) !== null) {
    const sm = m[1];
    if (!stationMasters.has(sm)) stationMasters.set(sm, { file, line: lineOfIndex(text, m.index) });
  }
}

function isTestSpec(path) { return TEST_RE.test(path); }

// The interlocking route a spec binds to (or null).
function boundRoute(file, text) {
  const hdr = text.match(ROUTE_HDR_RE);
  if (hdr) return hdr[1];
  const pref = basename(file).match(FILENAME_PREFIX_RE);
  if (pref && ROUTE_ID_RE.test(pref[1])) return pref[1];
  const parent = basename(dirname(file));
  if (ROUTE_ID_RE.test(parent)) return parent;
  return null;
}
// The station-master a smoke spec covers (or null).
function smoothCoveredSM(file, text) {
  if (!SMOKE_RE.test(file)) return null;
  const hdr = text.match(SM_HDR_RE);
  if (hdr) return hdr[1];
  const pref = basename(file).match(FILENAME_PREFIX_RE);
  if (pref && ROUTE_ID_RE.test(pref[1])) return pref[1];
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("interlocking-e2e: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const routes = new Map();          // route_id -> {file, line}
  const stationMasters = new Map();  // sm_id -> {file, line}
  const specs = [];                  // {file, boundRoute, smCovered}
  let registrySeen = false;

  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (isInterlockingRegistryFile(file)) { registrySeen = true; collectRegistry(file, routes, stationMasters); continue; }
      if (isTestSpec(file)) {
        let text = "";
        try { text = readFileSync(file, "utf8"); } catch { text = ""; }
        specs.push({ file, boundRoute: boundRoute(file, text), smCovered: smoothCoveredSM(file, text) });
      }
    }
  }

  const violations = [];
  // Out of scope entirely if there is no interlocking registry at all.
  if (!registrySeen && routes.size === 0 && stationMasters.size === 0) {
    writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
    process.stderr.write("interlocking-e2e: no interlocking registry — out of scope\n");
    process.exit(0);
  }

  const coveredRoutes = new Set(specs.map((s) => s.boundRoute).filter((b) => b !== null));
  const coveredSMs = new Set(specs.map((s) => s.smCovered).filter((b) => b !== null));

  // --- interlocking-route-e2e-coverage: every admissible route has a covering spec ---
  for (const [rid, decl] of [...routes.entries()].sort()) {
    if (!coveredRoutes.has(rid)) {
      let src = "";
      try { src = (readFileSync(decl.file, "utf8").split(/\r?\n/)[decl.line - 1] || "").trim(); } catch {}
      violations.push({ rule_id: RULE_ROUTE, file: decl.file, line: decl.line, col: 1,
        evidence: `admissible interlocking route "${rid}" has no covering E2E spec (no // Interlocking: route:${rid} header, ${rid}. filename, or e2e/${rid}/ dir)`,
        source_line: src });
    }
  }

  // --- interlocking-station-master-smoke: each declared station_master has a smoke spec ---
  for (const [sm, decl] of [...stationMasters.entries()].sort()) {
    if (!coveredSMs.has(sm)) {
      let src = "";
      try { src = (readFileSync(decl.file, "utf8").split(/\r?\n/)[decl.line - 1] || "").trim(); } catch {}
      violations.push({ rule_id: RULE_SM, file: decl.file, line: decl.line, col: 1,
        evidence: `interlocking station_master "${sm}" has no *.smoke.spec.ts covering its rendered surface (no // StationMaster: ${sm} header or ${sm}.*.smoke.spec.ts)`,
        source_line: src });
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`interlocking-e2e: ${routes.size} route(s), ${stationMasters.size} station-master(s), ${specs.length} spec(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
