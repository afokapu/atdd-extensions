#!/usr/bin/env bun
// STAGED — coder.bun.runtime-executes-the-declaration
//
// The coder half of the executes-the-declaration pair: the runtime must EXECUTE the
// declared route space, not transcribe it. Every other rule in this family closes a
// TEXT-level correspondence — literals in the runtime also appear in the plan — and
// none asks whether the runtime ever READS it.
//
// FIRES ON POSITIVE EVIDENCE, NOT ON ABSENCE. The python sibling reports when nothing
// under the runtime selector reads a file. That design does not survive this stack: a
// runtime can legitimately obtain its route space through a generated module or a
// query and read no file at all, and would be called plan-blind for being idiomatic.
// This fires only when BOTH hold — the runtime reads nothing AND it restates declared
// route/train values as literals. Transcription PROVEN, not loading merely unproven.
//
// SELF-CONTAINED ON PURPOSE. The sibling detect.mjs exports nothing and calls main()
// at import time, so its helpers cannot be reused from here. The duplication below is
// the cost of that shape; extracting detect.mjs's walkers into a _shared/ module both
// can import is the right follow-up, and is a refactor of a live gated detector rather
// than something to smuggle into a staged one.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

export const RULE_EXECUTES = "coder.bun.runtime-executes-the-declaration";

// A FILE READ, not a parse. `parse(x)` alone says nothing about where x came from.
// Vocabulary established by building a consumer in this stack: python reads with
// yaml.safe_load / read_text, bun with Bun.file(...).text(), convex with readFileSync.
const LOADS_DECLARATION =
  /\breadFileSync\s*\(|\breadFile\s*\(|\bBun\s*\.\s*file\s*\(|\bcreateReadStream\s*\(|\bfs\s*\.\s*promises\s*\.\s*readFile\b/;
const RESOLVES = /\bInterlockingResolution\b|\bresolveTrain\s*\(/;
const EXCLUDES = ["node_modules", "dist", "build", ".next", "_generated"];

const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

function walk(dir, pred) {
  const out = [];
  (function rec(d) {
    let entries; try { entries = readdirSync(d).sort(); } catch { return; }
    for (const n of entries) {
      if (EXCLUDES.includes(n)) continue;
      const full = join(d, n);
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) rec(full);
      else if (pred(full)) out.push(full);
    }
  })(dir);
  return out;
}

export function findConsumerRoots(scanRoot) {
  const roots = new Set();
  (function rec(d) {
    let st; try { st = statSync(d); } catch { return; }
    if (!st.isDirectory()) return;
    for (const marker of ["src", "plan", "e2e"]) {
      try { if (statSync(join(d, marker)).isDirectory()) { roots.add(d); break; } } catch {}
    }
    let entries; try { entries = readdirSync(d).sort(); } catch { return; }
    for (const n of entries) { if (!EXCLUDES.includes(n)) { try { if (statSync(join(d, n)).isDirectory()) rec(join(d, n)); } catch {} } }
  })(scanRoot);
  return [...roots];
}

// Only what this check needs: the declared route_id / train_id of each route.
export function declaredValues(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const l of lines) {
    const m = l.match(/^\s*-?\s*(?:route_id|train_id):\s*["']?([^"'#\n]+?)["']?\s*(?:#.*)?$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scanExecution(scanRoot) {
  const violations = [];
  for (const croot of findConsumerRoots(scanRoot)) {
    const ilFiles = walk(join(croot, "plan"), (f) => /_interlockings[/\\].*\.ya?ml$/.test(f));
    const declared = [...new Set(ilFiles.flatMap((f) => declaredValues(readText(f))))];
    if (!declared.length) continue;
    const rtFiles = walk(join(croot, "src/trains"), (f) => /\.(ts|tsx|mjs|js)$/.test(f))
      .map((f) => ({ file: f, text: readText(f) }));
    const resolving = rtFiles.filter((x) => RESOLVES.test(x.text));
    if (!resolving.length) continue;
    if (rtFiles.some((x) => LOADS_DECLARATION.test(x.text))) continue;
    const transcribed = [...new Set(
      resolving.flatMap((x) => declared.filter((v) => new RegExp(`(?<![\\w-])${esc(v)}(?![\\w-])`).test(x.text))),
    )].sort();
    if (!transcribed.length) continue;   // reads nothing AND states nothing: not transcription
    const rel = resolving[0].file.startsWith(croot + sep) ? resolving[0].file.slice(croot.length + 1) : resolving[0].file;
    violations.push({
      rule_id: RULE_EXECUTES, file: rel, line: 1, col: 0,
      evidence: `the InterlockingRunner runtime never reads the interlocking declaration and ` +
        `restates ${transcribed.length} declared value(s) as literals (${transcribed.join(", ")}); ` +
        `the route space is transcribed, not executed — delete the plan and this runtime keeps answering`,
      source_line: "",
    });
  }
  return violations;
}

if (import.meta.main ?? process.argv[1]?.endsWith("scan_execution_coder.mjs")) {
  let roots = [];
  try { roots = JSON.parse(process.env.ATDD_SCAN_ROOTS || "[]"); } catch {}
  const out = roots.flatMap((r) => scanExecution(r));
  const rp = process.env.ATDD_VIOLATIONS_REPORT;
  if (rp) writeFileSync(rp, JSON.stringify({ violations: out }, null, 2), "utf8");
  process.stderr.write(`bun-executes: ${out.length} violation(s)\n`);
}
