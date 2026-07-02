#!/usr/bin/env node
// Detector: coder.astro.no-secret-in-frontmatter  (disposition: strict, severity 4)
//
// An Astro component's `---` frontmatter fence is the component SCRIPT — it runs at
// build/SSR time and its source ships in the repo. A secret-shaped string literal
// baked into that fence (an API key, token, password, access key) is a hardcoded
// credential: it must instead be read from `import.meta.env.*` so the value lives in
// the environment, not in source. This detector scans only the frontmatter fence of
// each `.astro` file and flags secret-shaped literals.
//
// CONTRACT (frontend.workspace.runtime v1.1 — JS sibling of the python-pytest
// provider contract). The provider shells out to `node` over THIS file and
// communicates ONLY through env + a JSON report file:
//
//   INPUT   env ATDD_SCAN_ROOTS     JSON array of dir/file roots to inspect.
//           env ATDD_SCAN_EXCLUDES  JSON array of substring/segment excludes (optional).
//           env ATDD_VIOLATIONS_REPORT  path to write the JSON report to.
//   OUTPUT  {"violations": [{rule_id,file,line,col,evidence,source_line}, ...]}
//
// RAW factual channel only — the detector applies ZERO disposition. It exits 0 even
// when it finds violations; it exits non-zero only on a genuine runtime fault.
//
// SELF-SCOPING (defense-in-depth to the consumer scope map). This detector already
// keys on the strongest possible Astro signature: it inspects ONLY `.astro` files
// (frontmatter fences). To make that boundary explicit and uniform with the rest of
// the Astro family, it also file-signature-gates the whole run: with NO `.astro` file
// anywhere in the roots it NO-OPS. SCOPES TO: `.astro` frontmatter. RESIDUE: none —
// this rule is fully decidable from the `.astro` extension and leaves nothing for the
// scope map (the `.tsx`-island ambiguity that burdens the XSS/logging detectors does
// not apply here, because frontmatter is an Astro-only construct).

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, sep } from "node:path";

const RULE_ID = "coder.astro.no-secret-in-frontmatter";

const DEFAULT_EXCLUDES = ["node_modules", "dist", "build", ".next", ".git", "_generated"];
const EXT = new Set([".astro"]);

// Known credential prefixes whose mere presence in a string literal is damning,
// regardless of the variable name. Placeholder-friendly: `sk_REDACTED...` matches
// the `sk_` arm without needing a real provider sub-format.
const SECRET_PREFIX_RE =
  /(['"`])(sk_[A-Za-z0-9_]{6,}|pk_(?:live|test)_[A-Za-z0-9]{6,}|AKIA[A-Z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{6,}|AIza[A-Za-z0-9_\-]{8,})\1/;

// A secret-NAMED identifier assigned a bare string literal. The approved source is
// `import.meta.env.*`; a quoted literal RHS is the violation.
const SECRET_NAME_RE =
  /\b(?:const|let|var)\s+([A-Za-z0-9_$]*(?:secret|token|api[_-]?key|apikey|password|passwd|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key)[A-Za-z0-9_$]*)\s*=\s*(['"`])([^'"`]*)\2/i;

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
    if (EXT.has(extname(root))) yield root;
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
    if (cst.isDirectory()) yield* walk(full, excludes);
    else if (EXT.has(extname(full))) yield full;
  }
}

// Return the [startLine, endLineExclusive) range of the frontmatter fence, or null.
// The fence is the block between the FIRST `---` line and the next `---` line, and
// must open at the very top of the file (only blank lines may precede it).
function frontmatterRange(lines) {
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (lines[i].trim() === "---") {
      open = i;
      break;
    }
    return null; // first non-blank line is not a fence — no frontmatter
  }
  if (open === -1) return null;
  for (let j = open + 1; j < lines.length; j++) {
    if (lines[j].trim() === "---") return [open + 1, j];
  }
  return null; // unterminated fence
}

function scanFile(file, violations) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  const range = frontmatterRange(lines);
  if (!range) return;
  const [start, end] = range;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    // At most one violation per frontmatter line; a literal credential prefix is
    // the stronger signal, so it wins over the named-assignment heuristic.
    const pm = SECRET_PREFIX_RE.exec(line);
    if (pm) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: pm.index + 1,
        evidence: "credential-shaped literal in .astro frontmatter; read it from import.meta.env",
        source_line: line.trim(),
      });
      continue;
    }
    if (line.includes("import.meta.env")) continue; // env-sourced — the approved form
    const nm = SECRET_NAME_RE.exec(line);
    if (nm) {
      violations.push({
        rule_id: RULE_ID,
        file,
        line: i + 1,
        col: nm.index + 1,
        evidence: `secret-named binding "${nm[1]}" assigned a string literal in .astro frontmatter; read it from import.meta.env`,
        source_line: line.trim(),
      });
    }
  }
}

// File-signature gate: does the scan tree contain any `.astro` file? Reuses walk()
// (which yields only `.astro` here) so it costs one directory pass.
function treeHasAstro(roots, excludes) {
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      if (extname(file) === ".astro") return true;
    }
  }
  return false;
}

function main() {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("astro-detector: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];

  const violations = [];
  if (!treeHasAstro(roots, excludes)) {
    writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
    process.stderr.write(
      `astro-detector(${RULE_ID}): no .astro files in scan tree — self-scoped no-op\n`,
    );
    process.exit(0);
  }
  for (const root of roots) for (const file of walk(root, excludes)) scanFile(file, violations);

  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write(
    `astro-detector(${RULE_ID}): scanned ${roots.length} root(s), ${violations.length} violation(s)\n`,
  );
  process.exit(0); // run-health OK regardless of violation count (RAW channel)
}

main();
