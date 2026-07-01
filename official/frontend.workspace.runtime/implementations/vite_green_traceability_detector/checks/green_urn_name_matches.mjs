#!/usr/bin/env node
// Member check: coder.vite.green-urn-name-matches  (GREEN/URN traceability family)
//
// CONTRACT (v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES, writes RAW
// {rule_id,file,line,col,evidence,source_line} violations to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero deps; shared parsing lives in
// ../urn_header.mjs. Evaluates ONE rule over each file's parsed header.
import { runCheck } from "../urn_header.mjs";

runCheck("coder.vite.green-urn-name-matches", (H, file) => {
  if (!H.urn || H.segs.length !== 6) return null;
  const name = H.segs[3];
  const SPECIAL = new Set(["composition", "wagon", "entrypoint", "http", "index", "schema", "router"]);
  if (SPECIAL.has(name.toLowerCase())) return null;
  const base = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm(name) === norm(base)) return null;
  return { line: H.urn.no, col: H.urn.col,
    evidence: `URN name segment "${name}" does not match filename "${base}"`,
    source_line: H.urn.raw };
});
