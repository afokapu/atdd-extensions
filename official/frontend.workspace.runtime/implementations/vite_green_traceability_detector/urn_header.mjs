// urn_header.mjs — zero-dependency shared header parser + FS walk + runCheck
// helper for the GREEN/URN-traceability family checks. Lives at the implementation
// ROOT (imported by checks via `../urn_header.mjs`); the family runner only spawns
// `checks/*.mjs`, so this module is never run as a member.
//
// The GREEN convention requires every implementation file to carry a traceability
// header: `// URN: component:{wagon}:{feature}:{Name}:{side}:{layer}` as the first
// non-empty line, then `// Tested-By:` / `// - test:…`, `// Runtime: …`,
// `// Purpose: …` (order: URN -> Tested-By -> Runtime -> Purpose). Each family
// member imports this parser and evaluates ONE rule over the parsed header.
import { readFileSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { join, extname, sep } from "node:path";

export const DEFAULT_EXCLUDES = ["_generated", "node_modules", "dist", "build", ".next"];
export const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
export const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function isExcluded(path, excludes) {
  const segs = path.split(sep);
  return excludes.some((ex) => segs.includes(ex) || path.includes(ex));
}

export function* walk(root, excludes) {
  let st;
  try {
    st = statSync(root);
  } catch {
    return; // a missing scan root is not a fault — skip silently
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

// Parse the leading traceability header. The header REGION is the leading run of
// blank lines, an optional shebang, and `//` line comments; the first real code
// line ends it. Markers are recognised only inside that region (so a header
// pushed below imports reads as "missing", which is what the marker rule flags).
export function parseHeader(text) {
  const lines = text.split(/\r?\n/);
  let firstNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "") { firstNonEmpty = i; break; }
  }
  const H = {
    lines,
    firstNonEmptyNo: firstNonEmpty >= 0 ? firstNonEmpty + 1 : 0,
    firstNonEmptyText: firstNonEmpty >= 0 ? lines[firstNonEmpty].trim() : "",
    urn: null, segs: null, runtime: null, purpose: null, testedBy: null, testedEntries: 0,
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === "") continue;             // blank lines do not end the header region
    if (t.startsWith("#!")) continue;   // shebang
    if (!t.startsWith("//")) break;     // first real code line ends the region
    let m;
    if (!H.urn && (m = t.match(/^\/\/\s*URN:\s*(\S.*?)\s*$/))) {
      H.urn = { no: i + 1, col: raw.indexOf("//") + 1, value: m[1], raw: t };
      H.segs = m[1].split(":");
    } else if (!H.runtime && (m = t.match(/^\/\/\s*Runtime:\s*(\S.*?)\s*$/))) {
      H.runtime = { no: i + 1, value: m[1], raw: t };
    } else if (!H.purpose && (m = t.match(/^\/\/\s*Purpose:\s*(\S.*?)\s*$/))) {
      H.purpose = { no: i + 1, value: m[1], raw: t };
    } else if (!H.testedBy && /^\/\/\s*Tested-By:\s*$/.test(t)) {
      H.testedBy = { no: i + 1 };
    } else if (/^\/\/\s*-\s*test:\S/.test(t)) {
      H.testedEntries++;
    }
  }
  return H;
}

// Boilerplate shared by every member: read env channel, walk scan roots, parse
// each file's header, call `evaluate(H, file)` -> violation record | null, write
// the RAW v1.1 report, exit 0 (run-health, not a verdict).
export function runCheck(ruleId, evaluate) {
  const reportPath = process.env.ATDD_VIOLATIONS_REPORT;
  if (!reportPath) {
    process.stderr.write("green-check: ATDD_VIOLATIONS_REPORT not set\n");
    process.exit(2);
  }
  const roots = parseJsonEnv("ATDD_SCAN_ROOTS", []);
  const excludes = [...DEFAULT_EXCLUDES, ...parseJsonEnv("ATDD_SCAN_EXCLUDES", [])];
  const violations = [];
  for (const root of roots) {
    for (const file of walk(root, excludes)) {
      let text;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      const H = parseHeader(text);
      const r = evaluate(H, file);
      if (!r) continue;
      violations.push({
        rule_id: ruleId,
        file,
        line: r.line,
        col: r.col ?? 1,
        evidence: r.evidence,
        source_line: r.source_line ?? "",
      });
    }
  }
  writeFileSync(reportPath, JSON.stringify({ violations }, null, 2), "utf8");
  process.stderr.write("green-check " + ruleId + ": " + violations.length + " violation(s)\n");
  process.exit(0);
}
