#!/usr/bin/env node
// Detector: coder.convex.interlocking-bilateral-binding  (disposition: strict, severity 1)
//
// Convex/TS realization of the core python `interlocking_binding.py` detector — the single EXTENSION
// obligation that makes train interlocking SYSTEMIC. An interlocking system requires CLOSURE across
// declaration (the interlocking YAML route space, core afokapu/atdd#1248), runtime resolution
// (InterlockingRunner, #1251), Station Master reachability (the convex/app.ts JOURNEY_MAP), TrainRunner
// delegation, and the execution trace. This detector emits RAW v1.1 violations under ONE rule_id for
// any of FIVE binding directions that is broken, plus a schema-drift signal for a parallel reachability
// field that forks core #1248's `entrypoint`:
//
//   declaration_to_runtime — every declared route's train artifact exists (runtime can resolve it).
//   runtime_to_declaration — the runtime never resolves a routeId/trainId absent from the loaded YAML.
//   station_to_declaration — every JOURNEY_MAP {interlockingId, path} mapping points to an existing YAML.
//   declaration_to_station — every exposed interlocking is reachable via a declared entrypoint.action.
//   trace_to_declaration   — every asserted trace routeId/interlockingId binds back to a declared route.
//   parallel_reachability_field — a forked reachability field is rejected as schema drift.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS, writes RAW
// {rule_id,file,line,col,evidence,source_line} violations to ATDD_VIOLATIONS_REPORT, exits 0.
// Zero third-party deps — node builtins only. The plan/_trains interlocking YAML route space is
// stack-neutral planner data (snake_case, core #1248); the runtime + JOURNEY_MAP + trace are Convex/TS.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep, resolve } from "node:path";

const RULE = "coder.convex.interlocking-bilateral-binding";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const PARALLEL_FIELDS = ["entrypoints", "runtime_exposure", "station_actions", "exposed_actions", "reachability"];

// ── generic IO / masking ─────────────────────────────────────────────────────

function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function lineOfIndex(text, idx) {
  return text.slice(0, idx).split("\n").length;
}

function lineAt(text, lineno) {
  const lines = text.split(/\r?\n/);
  return lineno >= 1 && lineno <= lines.length ? lines[lineno - 1].trim() : "";
}

// Blank `//` and `/* */` comments to spaces (offsets/newlines preserved); keep string literals.
function maskComments(text) {
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

// ── consumer-tree + scope discovery ──────────────────────────────────────────

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

function findConsumerRoots(scanRoot) {
  const roots = new Set();
  for (const d of walkDirs(scanRoot)) {
    if (hasChildDir(d, "convex") || hasChildDir(d, "plan") || hasChildDir(d, "e2e")) roots.add(d);
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

function interlockingFiles(croot) {
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

function runtimeFiles(croot) {
  return [...walkFiles(join(croot, "convex", "trains"), isTs)].sort();
}

function e2eFiles(croot) {
  return [...walkFiles(join(croot, "e2e"), isTs)].sort();
}

function appFile(croot) {
  const p = join(croot, "convex", "app.ts");
  try {
    if (statSync(p).isFile()) return p;
  } catch {
    /* absent */
  }
  return null;
}

function rel(path, root) {
  const r = root.endsWith(sep) ? root : root + sep;
  return path.startsWith(r) ? path.slice(r.length) : path;
}

// ── interlocking YAML parse (CONSUMES core #1248 fields; snake_case planner data) ─────────────

function parseInterlocking(text) {
  const lines = text.split(/\r?\n/);
  const idM = text.match(/^interlocking_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/m);
  if (!idM) return null;
  const interlockingId = idM[1].trim();

  const routes = [];
  const ri = lines.findIndex((l) => /^routes:\s*(?:#.*)?$/.test(l));
  if (ri >= 0) {
    for (let i = ri + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\S/.test(l)) break; // dedent to a new top-level key ends the routes block
      const rm = l.match(/^\s*-\s*route_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
      if (rm) {
        routes.push({ routeId: rm[1].trim(), line: i + 1, sourceLine: l, trainId: null, trainPath: null });
      } else if (routes.length) {
        const cur = routes[routes.length - 1];
        const tm = l.match(/^\s*train_id:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
        if (tm) cur.trainId = tm[1].trim();
        const pm = l.match(/^\s*train_path:\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
        if (pm) cur.trainPath = pm[1].trim();
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
      if (/^\S/.test(l)) break; // dedent ends the entrypoint block
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

  const parallelFields = PARALLEL_FIELDS.filter((f) => new RegExp("^\\s*" + f + "\\s*:", "m").test(text));
  return { interlockingId, routes, exposed, actions, parallelFields, rawText: text };
}

// ── Station Master JOURNEY_MAP parse (convex/app.ts) ─────────────────────────

function parseJourneyMap(rawText) {
  const text = maskComments(rawText);
  const m = /\bJOURNEY_MAP\b[^=]*=\s*\{/.exec(text);
  if (!m) return {};
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const bodyStart = open + 1;
  const body = text.slice(bodyStart, close < 0 ? text.length : close);
  const out = {};
  let re = /(?:([A-Za-z_$][\w$]*)|"([^"]+)"|'([^']+)')\s*:\s*\{([^{}]*)\}/g;
  let mm;
  while ((mm = re.exec(body)) !== null) {
    const action = mm[1] || mm[2] || mm[3];
    const inner = mm[4];
    const idm = inner.match(/interlockingId\s*:\s*["']([^"']+)["']/);
    const pm = inner.match(/path\s*:\s*["']([^"']+)["']/);
    if (idm || pm) {
      out[action] = {
        kind: "interlocking",
        interlockingId: idm ? idm[1] : null,
        path: pm ? pm[1] : null,
        line: lineOfIndex(rawText, bodyStart + mm.index),
      };
    }
  }
  re = /(?:([A-Za-z_$][\w$]*)|"([^"]+)"|'([^']+)')\s*:\s*["']([^"']+)["']\s*[,}]/g;
  while ((mm = re.exec(body)) !== null) {
    const action = mm[1] || mm[2] || mm[3];
    if (!(action in out)) {
      out[action] = { kind: "direct", trainId: mm[4], line: lineOfIndex(rawText, bodyStart + mm.index) };
    }
  }
  return out;
}

// Resolution-output object properties the runtime sets (core #1251 InterlockingResolution).
function runtimeResolutionLiterals(rawText) {
  const text = maskComments(rawText);
  const out = [];
  let re = /\brouteId\s*:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ kind: "route", value: m[1], line: lineOfIndex(rawText, m.index) });
  re = /\b(?:trainId|selectedTrainId)\s*:\s*["']([^"']+)["']/g;
  while ((m = re.exec(text)) !== null) out.push({ kind: "train", value: m[1], line: lineOfIndex(rawText, m.index) });
  return out;
}

const TRACE_OBJECT = /\btrace\b/;
// Matches both a bare `trace.routeId === "X"` / `trace["routeId"] === "X"` comparison AND the
// vitest/jest `expect(trace.routeId).toBe("X")` / `.toEqual(...)` / `.toStrictEqual(...)` form.
const TRACE_ASSERT =
  /trace\s*(?:\.\s*(routeId|interlockingId)|\[\s*["'](routeId|interlockingId)["']\s*\])\s*(?:===?\s*|\)\s*\.\s*to(?:Be|Equal|StrictEqual)\s*\(\s*)["']([^"']+)["']/g;

// ── violation helper ─────────────────────────────────────────────────────────

function mk(file, line, direction, detail, sourceLine) {
  return { rule_id: RULE, file, line, col: 0, evidence: `${direction}: ${detail}`, source_line: sourceLine };
}

function trainArtifactExists(croot, route) {
  if (route.trainPath) {
    try {
      return statSync(join(croot, route.trainPath)).isFile();
    } catch {
      return false;
    }
  }
  if (route.trainId) {
    try {
      return statSync(join(croot, "plan", "_trains", `${route.trainId}.yaml`)).isFile();
    } catch {
      return false;
    }
  }
  return false;
}

// ── per-consumer-tree scan ───────────────────────────────────────────────────

function scanConsumerRoot(croot) {
  const records = [];
  for (const f of interlockingFiles(croot)) {
    const rec = parseInterlocking(readText(f));
    if (rec) records.push({ file: f, ...rec });
  }
  const runtime = runtimeFiles(croot).map((f) => ({ file: f, text: readText(f) }));
  const app = appFile(croot);
  const appText = app ? readText(app) : "";
  const journey = app ? parseJourneyMap(appText) : {};
  const e2e = e2eFiles(croot).map((f) => ({ file: f, text: readText(f) }));

  const enabled =
    records.length > 0 ||
    runtime.some((r) => /InterlockingRunner|InterlockingResolution/.test(r.text));
  if (!enabled) return [];

  const declaredRoutes = new Set(records.flatMap((r) => r.routes.map((x) => x.routeId)));
  const declaredTrains = new Set(records.flatMap((r) => r.routes.map((x) => x.trainId).filter(Boolean)));
  const declaredIds = new Set(records.map((r) => r.interlockingId));
  const violations = [];

  // 1. declaration_to_runtime
  for (const rec of records) {
    for (const route of rec.routes) {
      if (trainArtifactExists(croot, route)) continue;
      const target = route.trainPath || (route.trainId ? `plan/_trains/${route.trainId}.yaml` : "<no train_id>");
      violations.push(
        mk(
          rel(rec.file, croot),
          route.line,
          "declaration_to_runtime",
          `declared route "${route.routeId}" of interlocking "${rec.interlockingId}" is not runtime-resolvable: ` +
            `its train artifact "${target}" does not exist, so InterlockingRunner -> TrainRunner cannot resolve it`,
          route.sourceLine.trim(),
        ),
      );
    }
  }

  // 2. runtime_to_declaration (no hidden routes)
  for (const { file, text } of runtime) {
    if (!/InterlockingResolution|resolveTrain/.test(text)) continue;
    for (const lit of runtimeResolutionLiterals(text)) {
      const declared = lit.kind === "route" ? declaredRoutes : declaredTrains;
      if (declared.has(lit.value)) continue;
      const label = lit.kind === "route" ? "routeId" : "trainId";
      violations.push(
        mk(
          rel(file, croot),
          lit.line,
          "runtime_to_declaration",
          `InterlockingRunner resolves ${label} "${lit.value}" which is declared in no interlocking YAML ` +
            `(hidden route); every resolved route/train must come from the loaded route space`,
          lineAt(text, lit.line),
        ),
      );
    }
  }

  // 3. station_to_declaration (mappings point to existing YAML)
  if (app) {
    for (const [action, mapping] of Object.entries(journey)) {
      if (mapping.kind !== "interlocking") continue;
      if (mapping.path) {
        let exists = false;
        try {
          exists = statSync(join(croot, mapping.path)).isFile();
        } catch {
          exists = false;
        }
        if (!exists) {
          violations.push(
            mk(
              rel(app, croot),
              mapping.line,
              "station_to_declaration",
              `Station Master action "${action}" maps to interlocking path "${mapping.path}" which does not ` +
                `exist; the mapping must point to a real interlocking YAML`,
              lineAt(appText, mapping.line),
            ),
          );
        }
      }
      if (mapping.interlockingId && !declaredIds.has(mapping.interlockingId)) {
        violations.push(
          mk(
            rel(app, croot),
            mapping.line,
            "station_to_declaration",
            `Station Master action "${action}" maps to interlockingId "${mapping.interlockingId}" which is ` +
              `declared by no interlocking YAML in the route space`,
            lineAt(appText, mapping.line),
          ),
        );
      }
    }
  }

  // 4. declaration_to_station (exposed interlockings are reachable)
  for (const rec of records) {
    if (!rec.exposed) continue;
    const reachable = rec.actions.some((action) => {
      const mapping = journey[action];
      if (!mapping || mapping.kind !== "interlocking") return false;
      if (mapping.interlockingId === rec.interlockingId) return true;
      if (mapping.path && resolve(join(croot, mapping.path)) === resolve(rec.file)) return true;
      return false;
    });
    if (reachable) continue;
    const m = /^\s*exposed:\s*true\b.*$/m.exec(rec.rawText);
    const line = m ? lineOfIndex(rec.rawText, m.index) : 1;
    const actions = rec.actions.join(", ") || "<none>";
    violations.push(
      mk(
        rel(rec.file, croot),
        line,
        "declaration_to_station",
        `interlocking "${rec.interlockingId}" has entrypoint.exposed:true but is not Station-Master-reachable: ` +
          `none of its entrypoint.actions [${actions}] is wired into JOURNEY_MAP to this interlocking ` +
          `(core afokapu/atdd#1248 entrypoint.exposed/actions)`,
        m ? m[0].trim() : "",
      ),
    );
  }

  // schema drift — parallel reachability field
  for (const rec of records) {
    for (const field of rec.parallelFields) {
      const m = new RegExp("^\\s*" + field + "\\s*:.*$", "m").exec(rec.rawText);
      const line = m ? lineOfIndex(rec.rawText, m.index) : 1;
      violations.push(
        mk(
          rel(rec.file, croot),
          line,
          "parallel_reachability_field",
          `interlocking "${rec.interlockingId}" declares a parallel reachability field "${field}"; reachability ` +
            `is owned by core afokapu/atdd#1248's \`entrypoint\` (exposed/actions/reason) — this extension must ` +
            `not fork it (schema drift)`,
          m ? m[0].trim() : "",
        ),
      );
    }
  }

  // 5. trace_to_declaration (trace binds back to source YAML)
  for (const { file, text } of e2e) {
    if (!TRACE_OBJECT.test(text)) continue;
    TRACE_ASSERT.lastIndex = 0;
    let m;
    while ((m = TRACE_ASSERT.exec(text)) !== null) {
      const field = m[1] || m[2];
      const value = m[3];
      const declared = field === "interlockingId" ? declaredIds : declaredRoutes;
      if (declared.has(value)) continue;
      const line = lineOfIndex(text, m.index);
      violations.push(
        mk(
          rel(file, croot),
          line,
          "trace_to_declaration",
          `interlocking trace test asserts trace.${field} === "${value}", which resolves to no declared ` +
            `${field === "interlockingId" ? "interlocking" : "route"} in the YAML route space; the trace must ` +
            `bind the executed route back to its declaration`,
          lineAt(text, line),
        ),
      );
    }
  }

  return violations;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-interlocking-binding: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const violations = [];
  for (const scanRoot of roots) {
    for (const croot of findConsumerRoots(scanRoot)) violations.push(...scanConsumerRoot(croot));
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-interlocking-binding: ${violations.length} violation(s)\n`);
  process.exit(0);
}

main();
