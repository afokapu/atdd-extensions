#!/usr/bin/env node
// Detector: coder.convex.train-wagons-communicate-via-cargo  (disposition: strict)
//
// Wagons communicate via cargo, never via direct cross-wagon imports. This flags a
// cross-wagon import — a `@<other-wagon>/wagon` scoped import, or a relative import
// (`../<sibling-wagon>/...`) that escapes the importing file's own wagon directory —
// in any module that is NOT the wagon's `wagon.ts` composition root. Imports of shared
// layers (shared/lib/commons/design/contracts/...) are always allowed.
//
// Wagon of a file = its first path segment under the scan root. The scan root is the
// wagon-container (in real code, the `convex/` function tree).
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero dependencies, no AST.
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, relative, dirname, basename } from "node:path";

const RULE_ID = "coder.convex.train-wagons-communicate-via-cargo";
const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// Not wagons — shared/common layers are always importable across the tree.
const SHARED = new Set(["shared", "lib", "commons", "common", "design", "contracts", "_generated", "migrations"]);
const COMPOSITION_ROOT_RE = /^wagon\.[cm]?[jt]sx?$/;

const SPEC_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];

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
  if (st.isFile()) { if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root; return; }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try { cst = statSync(full); } catch { continue; }
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) yield full;
  }
}
const kebab = (s) => s.replace(/_/g, "-");
// Normalize a POSIX-ish relative path, collapsing "." and ".." segments.
function normSegs(p) {
  const out = [];
  for (const s of p.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { out.pop(); continue; }
    out.push(s);
  }
  return out;
}

// Returns the offending "other wagon" name if `spec` is a cross-wagon import from a
// file whose own wagon is `importerWagon`, else null.
function crossWagon(spec, importerWagon, importerRelDir) {
  // scoped alias `@<name>/wagon`
  let m = /^@([\w-]+)\/wagon(?:\/|$)/.exec(spec);
  if (m) {
    const scope = m[1];
    if (!SHARED.has(scope) && kebab(scope) !== kebab(importerWagon)) return scope;
    return null;
  }
  // bare alias `@<name>/...` targeting another wagon subtree (defensive; still requires /wagon-like)
  // relative import escaping the importer's wagon
  if (spec.startsWith(".")) {
    const target = normSegs(importerRelDir.split(sep).join("/") + "/" + spec);
    const seg = target[0];
    if (seg && seg !== importerWagon && !SHARED.has(seg)) return seg;
  }
  return null;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) { process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n"); process.exit(2); }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      const base = basename(file);
      if (COMPOSITION_ROOT_RE.test(base)) continue; // composition root exempt
      const rel = relative(root, file);
      const relSegs = rel.split(sep);
      const importerWagon = relSegs.length > 1 ? relSegs[0] : null;
      if (!importerWagon || SHARED.has(importerWagon)) continue; // top-level or shared file: no wagon to breach
      const importerRelDir = dirname(rel);
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const seen = new Set();
        for (const re of SPEC_RES) {
          re.lastIndex = 0;
          let mm;
          while ((mm = re.exec(line)) !== null) {
            const spec = mm[1];
            if (seen.has(spec)) continue;
            seen.add(spec);
            const other = crossWagon(spec, importerWagon, importerRelDir);
            if (other) {
              violations.push({
                rule_id: RULE_ID,
                file,
                line: i + 1,
                col: (mm.index || 0) + 1,
                evidence: `wagon "${importerWagon}" imports across a wagon boundary into "${other}" — communicate via cargo`,
                source_line: line.trim(),
              });
            }
          }
        }
      }
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(`convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`);
  process.exit(0);
}
main();
