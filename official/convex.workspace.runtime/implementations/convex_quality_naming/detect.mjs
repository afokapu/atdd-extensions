#!/usr/bin/env node
// Detector: coder.convex.quality-naming  (disposition: strict)
//
// Convex realization of Core's coder.refactor.quality-naming, re-expressed in
// TypeScript/Convex naming conventions. Three concrete RAW signals:
//   (1) FUNCTION not camelCase — a `function` declaration, or a module-level arrow
//       function bound to a `const`, whose name is not `^[a-z][A-Za-z0-9]*$`.
//   (2) TYPE/INTERFACE not PascalCase — an `interface`/`type` declaration whose name
//       is not `^[A-Z][A-Za-z0-9]*$`.
//   (3) MODULE CONST should be SCREAMING — a module-level (non-indented) `const`
//       whose target is a lowercase name CONTAINING an underscore and whose RHS is a
//       literal (string/number/boolean/array/object): it reads as a constant and
//       should be SCREAMING_SNAKE_CASE. (Mirrors Core's snake-name + literal heuristic.)
//
// CONTRACT (convex.workspace.runtime v1.1). Env in / JSON report out, RAW channel,
// exit 0 even when violations are found.

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.convex.quality-naming";

const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
const TS_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const CAMEL_RE = /^[a-z][A-Za-z0-9]*$/;
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;

// `function name(` / `async function name(` / `function* name(`
const FUNC_DECL_RE = /\bfunction\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/;
// module-level (non-indented) `const NAME = (args) =>` or `= async (args) =>`
const CONST_ARROW_RE = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::[^=]+)?=>/;
// `interface Name` / `type Name =`
const INTERFACE_RE = /\binterface\s+([A-Za-z_$][\w$]*)/;
const TYPE_RE = /\btype\s+([A-Za-z_$][\w$]*)\s*=/;
// module-level (non-indented) `const name = <literal>`
const CONST_LITERAL_RE =
  /^(?:export\s+)?const\s+([a-z][\w$]*)\s*(?::[^=]+)?=\s*(.+?);?\s*$/;
// A right-hand side that "reads as a constant value": string/number/boolean/array/object literal.
const LITERAL_RHS_RE = /^(["'`].*|-?\d.*|true\b|false\b|\[.*|\{.*)$/;

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
    } else if (TS_EXT.has(extname(full)) && !TEST_RE.test(full)) {
      yield full;
    }
  }
}

function push(violations, file, i, line, evidence) {
  violations.push({
    rule_id: RULE_ID,
    file,
    line: i + 1,
    col: 1,
    evidence,
    source_line: line.trim(),
  });
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const moduleLevel = /^(?:export\s+)?(?:const|function|interface|type)\b/.test(line);

    // (1) function declarations — name must be camelCase
    let m = FUNC_DECL_RE.exec(line);
    if (m && !CAMEL_RE.test(m[1])) {
      push(violations, file, i, line, `function '${m[1]}' should be camelCase`);
    }
    // (1b) module-level const arrow functions — name must be camelCase
    if (moduleLevel) {
      m = CONST_ARROW_RE.exec(line);
      if (m && !CAMEL_RE.test(m[1])) {
        push(violations, file, i, line, `function '${m[1]}' should be camelCase`);
      }
    }
    // (2) interface / type — name must be PascalCase
    m = INTERFACE_RE.exec(line);
    if (m && !PASCAL_RE.test(m[1])) {
      push(violations, file, i, line, `interface '${m[1]}' should be PascalCase`);
    }
    m = TYPE_RE.exec(line);
    if (m && !PASCAL_RE.test(m[1])) {
      push(violations, file, i, line, `type '${m[1]}' should be PascalCase`);
    }
    // (3) module-level const that reads as a constant — should be SCREAMING_SNAKE
    if (moduleLevel) {
      m = CONST_LITERAL_RE.exec(line);
      if (m) {
        const name = m[1];
        const rhs = m[2].trim();
        if (name.includes("_") && LITERAL_RHS_RE.test(rhs)) {
          push(
            violations,
            file,
            i,
            line,
            `module constant '${name}' should be SCREAMING_SNAKE_CASE`,
          );
        }
      }
    }
  }
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("convex-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) scanFile(file, violations);
  }

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `convex-detector: scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0);
}

main();
