#!/usr/bin/env node
// Member check: coder.vite.urn-wagon-resolves-to-declared  (GREEN/URN traceability family)
//
// A component URN's wagon segment must name a wagon plan/_wagons.yaml declares.
//
// Its sibling coder.vite.green-urn-wagon-feature checks the segment is a well-formed
// kebab-case identifier — a SHAPE test that any invented word passes. Measured on a
// consumer: a component declaring
// `URN: component:not-a-declared-wagon:not-a-declared-feature:App:frontend:presentation`
// produced ZERO violations across every Vite detector. The traceability header pointed
// at a wagon that does not exist and nothing noticed, which is the same defect this hub
// found on the Bun side — a well-formed NAME accepted where a resolvable CLAIM is
// required.
//
// WAGON ONLY, DELIBERATELY. The feature segment has no declaration source to resolve
// against: the frontend corpus carries no plan-side feature registry, and `src/features/`
// is a code convention, so resolving a header's claim against the code that makes it
// would be circular. When a feature registry exists this check extends to segs[2]; until
// then reporting on it would be guesswork dressed as enforcement.
//
// NOT_APPLICABLE when the consumer has no plan/_wagons.yaml: nothing is declared, so
// nothing can fail to resolve, and firing there would report on every plan-less checkout.
//
// CONTRACT (v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES, writes RAW
// {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT, exits 0.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const RULE = "coder.vite.urn-wagon-resolves-to-declared";
const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "coverage"];
const SRC_RE = /\.(tsx|ts|jsx|js)$/;
const SPEC_RE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const URN_RE = /^\s*\/\/\s*URN:\s*(\S+)\s*$/m;
// plan/_wagons.yaml states `- wagon: <slug>` — the shape core's own plan uses.
const WAGON_RE = /^\s*-\s*wagon:\s*["']?([^"'#\s]+)["']?/;

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

// The wagon registry nearest the file, found by walking up — the same ancestor walk the
// route detector uses, so both agree which plan governs a given module.
export function declaredWagons(fromFile, stopAt) {
  let dir = dirname(fromFile);
  for (let i = 0; i < 12; i++) {
    const p = join(dir, "plan", "_wagons.yaml");
    try {
      if (statSync(p).isFile()) {
        const out = new Set();
        for (const line of read(p).split(/\r?\n/)) {
          const m = line.match(WAGON_RE);
          if (m) out.add(m[1]);
        }
        return out;
      }
    } catch { /* keep walking */ }
    const parent = dirname(dir);
    if (parent === dir || (stopAt && !dir.startsWith(stopAt))) break;
    dir = parent;
  }
  return null;                       // no registry anywhere above: NOT_APPLICABLE
}

const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
if (!reportPath) {
  process.stderr.write("green-check: ATDD_VIOLATIONS_REPORT not set\n");
  process.exit(2);
}
const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
const violations = [];

for (const root of parseJsonEnv("ATDD_SCAN_ROOTS", [])) {
  for (const file of walk(root, excludes)) {
    if (!SRC_RE.test(file) || SPEC_RE.test(file)) continue;
    const text = read(file);
    const m = text.match(URN_RE);
    if (!m) continue;                                  // owned by green-urn-marker
    const segs = m[1].split(":");
    if (segs.length !== 6 || segs[0] !== "component") continue;  // owned by green-urn-pattern
    const declared = declaredWagons(file, root);
    if (declared === null || declared.size === 0) continue;      // nothing to resolve against
    const wagon = segs[1];
    if (declared.has(wagon)) continue;
    const line = text.split(/\r?\n/).findIndex((l) => URN_RE.test(l + "\n")) + 1;
    violations.push({
      rule_id: RULE, file, line: line || 1, col: 1,
      evidence:
        `URN wagon segment "${wagon}" is not declared in plan/_wagons.yaml. ` +
        `Declared: [${[...declared].sort().join(", ")}]`,
      source_line: m[0].trim(),
    });
  }
}
writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
process.stderr.write(`vite[urn-wagon-declared]: ${violations.length} violation(s)\n`);
process.exit(0);
