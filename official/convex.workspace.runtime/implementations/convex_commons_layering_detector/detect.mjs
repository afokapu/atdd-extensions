#!/usr/bin/env node
// FAMILY validator: convex_commons_layering_detector
//
// Convex-stack realization of the agnostic "commons module layers depend inward"
// obligations (core: coder.commons.domain-layer-in-commons /
// application-layer-uses-ports / cross-feature-imports-in). ONE detector emitting
// a cohesive group of rule_ids (Core family pattern).
//
// The commons module is the shared, cross-cutting code root recognized by a path
// segment named `commons` or `shared` (the canonical name and the legacy name the
// real consumer frg-app uses). Inside it, files belong to a layer by the segment
// after the commons root: `domain`, `application`, or `integration`. Dependencies
// must point inward only — integration -> application -> domain:
//
//   RULE 1  coder.convex.commons-domain-no-outbound
//           a domain-layer module MUST NOT import application/integration.
//   RULE 2  coder.convex.commons-application-no-integration
//           an application-layer module MUST NOT import integration (it uses ports).
//   RULE 3  coder.convex.commons-cross-feature-imports-in
//           a module inside a feature subdir MUST NOT import a *sibling feature* in
//           the same layer directly (peer-to-peer feature edge) — go through the
//           layer barrel / the layer above.
//
// CONTRACT (convex.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES,
// writes RAW {rule_id,file,line,col,evidence,source_line} violations to
// ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count (run-health, not a
// verdict). Skips _generated/, node_modules, build dirs, and *.test/*.spec files.
// Zero dependencies, no AST — lexical import scan.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, dirname, posix } from "node:path";

const RULE_DOMAIN_OUTBOUND = "coder.convex.commons-domain-no-outbound";
const RULE_APP_INTEGRATION = "coder.convex.commons-application-no-integration";
const RULE_CROSS_FEATURE = "coder.convex.commons-cross-feature-imports-in";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const COMMONS_NAMES = new Set(["commons", "shared"]);
const LAYERS = new Set(["domain", "application", "integration"]);

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

function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}

function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // a missing scan root is not a fault
  }
  if (st.isFile()) {
    if (TS_EXT.has(extname(root)) && !TEST_RE.test(root)) yield root;
    return;
  }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (isExcluded(full, excludes)) continue;
    let cst;
    try {
      cst = statSync(full);
    } catch {
      continue;
    }
    if (cst.isDirectory()) {
      yield* walk(full, excludes);
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

// Resolve a path's segments to a commons {inCommons, layer, feature} location.
// leafIsFile: true when the final segment is a filename (source files, resolved
// relative targets); false for alias targets that carry no filename — there a
// single segment after the layer is treated as a layer-level barrel, not a feature.
function locFromSegs(segs, leafIsFile) {
  const rootIdx = segs.findIndex((s) => COMMONS_NAMES.has(s));
  if (rootIdx === -1) return null; // not inside any commons module
  const layer = segs[rootIdx + 1];
  if (!LAYERS.has(layer)) return { inCommons: true, layer: null, feature: null };
  const after = segs.slice(rootIdx + 2); // dirs + (leaf, if a filename)
  let feature = null;
  // A feature exists when there is at least one *directory* segment before the leaf.
  const dirDepth = leafIsFile ? after.length - 1 : after.length;
  if (dirDepth >= 1) feature = after[0];
  return { inCommons: true, layer, feature };
}

function splitSegs(p) {
  return p.split(/[\\/]+/).filter(Boolean);
}

// Resolve an import specifier from a source file into a commons location, or null
// when it does not resolve into a commons module (bare packages, foreign paths).
function resolveTarget(spec, sourceFile) {
  // Relative forms resolve against the source file's directory (leaf is a filename).
  if (spec.startsWith(".")) {
    const resolved = posix.normalize(
      posix.join(splitSegs(dirname(sourceFile)).join("/"), spec),
    );
    return locFromSegs(splitSegs(resolved), /* leafIsFile */ true);
  }
  // Non-relative (path-aliased) forms — `@commons/...`, `@shared/...`, `@game/shared/...`,
  // etc. Resolve ONLY when the specifier names a commons-module segment (an exact
  // `commons`/`shared` path segment); everything else is an external package, not a
  // commons edge. The leading scope `@` is dropped so `@commons` matches the `commons`
  // segment. leafIsFile is false: aliases carry no filename.
  const segs = splitSegs(spec.replace(/^@/, ""));
  if (segs.some((s) => COMMONS_NAMES.has(s))) {
    return locFromSegs(segs, /* leafIsFile */ false);
  }
  return null; // external package specifier — not a commons edge
}

const IMPORT_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/, // import ... from '...' / export ... from '...'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/, // dynamic import('...')
  /^\s*import\s+['"]([^'"]+)['"]/, // side-effect import '...'
];

function specsOnLine(line) {
  const out = [];
  for (const re of IMPORT_RES) {
    const m = re.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

function evaluate(file, src, violations) {
  const from = locFromSegs(splitSegs(file), true);
  if (!from || !from.inCommons || !from.layer) return; // not a layered commons file
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const spec of specsOnLine(line)) {
      const tgt = resolveTarget(spec, file);
      if (!tgt || !tgt.inCommons || !tgt.layer) continue;
      const push = (rule_id, evidence) =>
        violations.push({
          rule_id,
          file,
          line: i + 1,
          col: line.indexOf(spec) + 1,
          evidence,
          source_line: line.trim(),
        });

      // RULE 1 — domain must not reach application/integration.
      if (from.layer === "domain" && (tgt.layer === "application" || tgt.layer === "integration")) {
        push(
          RULE_DOMAIN_OUTBOUND,
          `commons domain module imports the ${tgt.layer} layer ('${spec}') — domain must have no outbound edges`,
        );
      }
      // RULE 2 — application must not reach integration (it uses ports).
      if (from.layer === "application" && tgt.layer === "integration") {
        push(
          RULE_APP_INTEGRATION,
          `commons application module imports the integration layer ('${spec}') — application depends on ports, not integration`,
        );
      }
      // RULE 3 — no peer-to-peer feature edge within the same layer.
      if (
        from.feature &&
        tgt.feature &&
        tgt.layer === from.layer &&
        tgt.feature !== from.feature
      ) {
        push(
          RULE_CROSS_FEATURE,
          `commons feature '${from.feature}' imports sibling feature '${tgt.feature}' in the same ${from.layer} layer ('${spec}') — cross-feature imports must go through the layer above`,
        );
      }
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-commons-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      evaluate(file, text, violations);
    }
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-commons-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
