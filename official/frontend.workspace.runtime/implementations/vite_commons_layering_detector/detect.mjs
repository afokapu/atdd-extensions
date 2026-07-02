#!/usr/bin/env node
// FAMILY validator: vite_commons_layering_detector
//
// Vite/React realization of the agnostic commons-layering obligations plus the
// frontend domain framework-purity obligation. ONE detector emitting a cohesive
// group of rule_ids (Core family pattern).
//
// The commons module is the shared, cross-cutting code root recognized by a path
// segment named `commons` or `shared` (canonical + the legacy name the real
// consumer frg-app uses). A file's layer is the segment after that root:
// `domain`, `application`, or `integration`. Dependencies must point inward only —
// integration -> application -> domain:
//
//   RULE 1  coder.vite.commons-domain-no-outbound
//           a domain module MUST NOT import application/integration.
//   RULE 2  coder.vite.commons-application-no-integration
//           an application module MUST NOT import integration (it uses ports).
//   RULE 3  coder.vite.commons-cross-feature-imports-in
//           a module inside a feature subdir MUST NOT import a sibling feature in
//           the same layer directly (peer-to-peer feature edge).
//   RULE 4  coder.vite.commons-domain-no-framework-import
//           a domain module MUST NOT import a UI framework (preact/react/@tanstack/
//           @maintain-ux/gsap) — the domain layer stays framework-agnostic.
//
// SELF-SCOPING (defense-in-depth to the consumer scope map). Vite/React detector.
// SCOPES TO: the React/TS-extension whitelist (`*.ts`/`*.tsx`/`*.js`/`*.jsx`/`*.mjs`/
// `*.cjs`) only; it explicitly SKIPS `.astro` files (Astro-stack artifacts a Vite rule
// must never lint). RESIDUE the extension cannot decide: a `.tsx` module is legal in
// both a Vite app and an Astro island, so in a MIXED tree this still scans Astro-island
// `.tsx` — the last-mile split is the consumer scope map's job, not this guard's.
//
// CONTRACT (frontend.workspace.runtime v1.1): reads ATDD_SCAN_ROOTS /
// ATDD_SCAN_EXCLUDES, writes RAW {rule_id,file,line,col,evidence,source_line}
// violations to ATDD_VIOLATIONS_REPORT, exits 0 regardless of violation count.
// Skips node_modules/build dirs and *.test/*.spec files. Zero deps, no AST.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep, dirname, posix } from "node:path";

const RULE_DOMAIN_OUTBOUND = "coder.vite.commons-domain-no-outbound";
const RULE_APP_INTEGRATION = "coder.vite.commons-application-no-integration";
const RULE_CROSS_FEATURE = "coder.vite.commons-cross-feature-imports-in";
const RULE_DOMAIN_FRAMEWORK = "coder.vite.commons-domain-no-framework-import";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const COMMONS_NAMES = new Set(["commons", "shared"]);
const LAYERS = new Set(["domain", "application", "integration"]);

// Domain-layer forbidden UI frameworks (core: layers.domain.forbidden_imports.frontend).
const FRAMEWORKS = ["preact", "react", "@tanstack", "@maintain-ux", "gsap", "@gsap"];

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
    return;
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
    } else if (extname(full) === ".astro") {
      continue; // SELF-SCOPING: never lint an Astro-stack `.astro` file (see header)
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function locFromSegs(segs, leafIsFile) {
  const rootIdx = segs.findIndex((s) => COMMONS_NAMES.has(s));
  if (rootIdx === -1) return null;
  const layer = segs[rootIdx + 1];
  if (!LAYERS.has(layer)) return { inCommons: true, layer: null, feature: null };
  const after = segs.slice(rootIdx + 2);
  let feature = null;
  const dirDepth = leafIsFile ? after.length - 1 : after.length;
  if (dirDepth >= 1) feature = after[0];
  return { inCommons: true, layer, feature };
}

function splitSegs(p) {
  return p.split(/[\\/]+/).filter(Boolean);
}

function resolveTarget(spec, sourceFile) {
  // Relative forms resolve against the source file's directory (leaf is a filename).
  if (spec.startsWith(".")) {
    const resolved = posix.normalize(
      posix.join(splitSegs(dirname(sourceFile)).join("/"), spec),
    );
    return locFromSegs(splitSegs(resolved), true);
  }
  // Non-relative (path-aliased) forms — `@commons/...`, `@shared/...`, `@game/shared/...`,
  // etc. Resolve ONLY when the specifier names an exact `commons`/`shared` path segment;
  // everything else is an external package. The leading scope `@` is dropped so
  // `@commons` matches the `commons` segment. leafIsFile is false: aliases carry no filename.
  const segs = splitSegs(spec.replace(/^@/, ""));
  if (segs.some((s) => COMMONS_NAMES.has(s))) {
    return locFromSegs(segs, false);
  }
  return null;
}

function isFramework(spec) {
  return FRAMEWORKS.some((fw) => spec === fw || spec.startsWith(fw + "/"));
}

const IMPORT_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  /^\s*import\s+['"]([^'"]+)['"]/,
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
  if (!from || !from.inCommons || !from.layer) return;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const spec of specsOnLine(line)) {
      const push = (rule_id, evidence) =>
        violations.push({
          rule_id,
          file,
          line: i + 1,
          col: line.indexOf(spec) + 1,
          evidence,
          source_line: line.trim(),
        });

      // RULE 4 — domain must not import a UI framework (bare package specifier).
      if (from.layer === "domain" && isFramework(spec)) {
        push(
          RULE_DOMAIN_FRAMEWORK,
          `commons domain module imports the UI framework '${spec}' — the domain layer must stay framework-agnostic`,
        );
      }

      const tgt = resolveTarget(spec, file);
      if (!tgt || !tgt.inCommons || !tgt.layer) continue;

      // RULE 1 — domain must not reach application/integration.
      if (from.layer === "domain" && (tgt.layer === "application" || tgt.layer === "integration")) {
        push(
          RULE_DOMAIN_OUTBOUND,
          `commons domain module imports the ${tgt.layer} layer ('${spec}') — domain must have no outbound edges`,
        );
      }
      // RULE 2 — application must not reach integration.
      if (from.layer === "application" && tgt.layer === "integration") {
        push(
          RULE_APP_INTEGRATION,
          `commons application module imports the integration layer ('${spec}') — application depends on ports, not integration`,
        );
      }
      // RULE 3 — no peer-to-peer feature edge within the same layer.
      if (from.feature && tgt.feature && tgt.layer === from.layer && tgt.feature !== from.feature) {
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
    process.stderr.write("vite-commons-detector: ATDD_VIOLATIONS_REPORT not set\n");
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
    `vite-commons-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
