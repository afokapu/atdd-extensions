#!/usr/bin/env node
// Member check: tester.vite.covered-train-is-routed  (train/e2e coverage family)
//
// A spec that CLAIMS to cover a train must be exercising a train the router actually
// renders. Its sibling tester.vite.train-e2e-coverage closes the other direction — a
// declared train with no spec. Neither asked whether a covered train is ROUTED, and a
// route declared in the interlocking, with a registered train, registered wagons and a
// passing smoke spec, that NO router renders, passed every rule in this workspace.
// The spec was green while exercising nothing: `page.goto` reached a router that
// returns null for that path, and the assertion never ran against a rendered train.
//
// WHY THIS IS KEYED ON THE SPEC'S CLAIM, NOT ON THE PLAN. Not every declared train is
// the frontend's to render — a backend train legitimately has no route here — and
// `entrypoint` carries no side/surface discriminator to tell them apart (afokapu/atdd
// #1818, ask 2, open at core). Keying off plan/_trains.yaml would therefore report
// every backend train as an unrouted frontend route. A spec's own `// Train:` header
// is a claim made BY the frontend ABOUT the frontend, so it scopes the obligation
// without needing the discriminator at all. When that lands this rule does not change;
// a plan-keyed variant becomes possible as an addition.
//
// DYNAMIC BINDINGS ARE RESPECTED. coder.vite.route-trainid-expression-not-static holds
// that a `trainId={expr}` the scanner cannot resolve is advisory, never a hard failure.
// A router carrying any unresolvable binding may well render the covered train, so this
// check reports nothing for that consumer rather than contradicting that decision.
//
// CONTRACT (v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES, writes RAW violations to
// ATDD_VIOLATIONS_REPORT, exits 0 regardless of count.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const RULE = "tester.vite.covered-train-is-routed";
const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "coverage"];
const TRAIN_HDR_RE = /^\s*\/\/\s*Train:\s*train:(\d{4}-[a-z0-9-]+)\s*$/m;
const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const ROUTER_EXT = /\.(tsx|jsx|ts|js)$/;
// A static binding: trainId="..." or trainId={IDENT} — the shapes the sibling detector
// resolves. An unresolvable expression is detected separately and suppresses the rule.
const STATIC_BIND = /\btrainId\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g;
const IDENT_BIND = /\btrainId\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
const CONST_LITERAL = (name) =>
  new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*["']([^"']+)["']`);
const DYNAMIC_BIND = /\btrainId\s*=\s*\{(?!\s*(?:"[^"]*"|'[^']*'|[A-Za-z_$][\w$]*\s*)\})/;

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

function parseJsonEnv(name, fallback) {
  try { const v = JSON.parse(process.env[name] || ""); return Array.isArray(v) ? v : fallback; }
  catch { return fallback; }
}

function* walk(root, excludes) {
  let entries;
  try { entries = readdirSync(root).sort(); } catch { return; }
  for (const n of entries) {
    if (excludes.includes(n)) continue;
    const full = join(root, n);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full, excludes);
    else yield full;
  }
}

// Trains a router renders, resolved the way the sibling detector resolves them: a
// literal attribute, or an identifier bound to a same-file string constant.
export function routedTrains(text) {
  const out = new Set();
  for (const m of text.matchAll(STATIC_BIND)) out.add(m[1] || m[2] || m[3] || m[4]);
  for (const m of text.matchAll(IDENT_BIND)) {
    const lit = text.match(CONST_LITERAL(m[1]));
    if (lit) out.add(lit[1]);
  }
  return out;
}

const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
if (!reportPath) {
  process.stderr.write("route-detector: ATDD_VIOLATIONS_REPORT not set\n");
  process.exit(2);
}
const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
const violations = [];

for (const root of parseJsonEnv("ATDD_SCAN_ROOTS", [])) {
  const files = [...walk(root, excludes)];
  const routed = new Set();
  let hasDynamic = false;
  for (const f of files) {
    if (!ROUTER_EXT.test(f) || SPEC_RE.test(f)) continue;
    const text = read(f);
    if (!/\btrainId\s*=/.test(text)) continue;
    for (const t of routedTrains(text)) routed.add(t);
    if (DYNAMIC_BIND.test(text)) hasDynamic = true;
  }
  if (hasDynamic) continue;          // an unresolvable binding may render it; advisory territory
  if (!routed.size) continue;        // no router surface resolved at all: nothing to judge

  for (const f of files) {
    if (!SPEC_RE.test(f)) continue;
    const text = read(f);
    const m = text.match(TRAIN_HDR_RE);
    if (!m) continue;                // owned by tester.vite.e2e-names-valid-train
    const tid = m[1];
    if (routed.has(tid)) continue;
    const line = text.split(/\r?\n/).findIndex((l) => TRAIN_HDR_RE.test(l + "\n")) + 1;
    violations.push({
      rule_id: RULE, file: f, line: line || 1, col: 1,
      evidence:
        `spec claims to cover train "${tid}" but no router renders it — the router resolves ` +
        `[${[...routed].sort().join(", ")}]; the spec is green while exercising nothing`,
      source_line: m[0].trim(),
    });
  }
}
writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
process.stderr.write(`vite[covered-train-is-routed]: ${violations.length} violation(s)\n`);
process.exit(0);
