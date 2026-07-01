#!/usr/bin/env node
// Member check: coder.convex.green-header-runtime  (GREEN/URN traceability family)
//
// CONTRACT (v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES, writes RAW
// {rule_id,file,line,col,evidence,source_line} violations to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero deps; shared parsing lives in
// ../urn_header.mjs. Evaluates ONE rule over each file's parsed header.
import { runCheck } from "../urn_header.mjs";

runCheck("coder.convex.green-header-runtime", (H, file) => {
  const ALLOWED = new Set(["convex", "node"]);
  if (!H.runtime) return { line: H.urn ? H.urn.no : (H.firstNonEmptyNo || 1), col: 1,
    evidence: "missing `// Runtime:` declaration in the file header",
    source_line: H.firstNonEmptyText };
  if (ALLOWED.has(H.runtime.value)) return null;
  return { line: H.runtime.no, col: 1,
    evidence: `Runtime "${H.runtime.value}" is not one of ${[...ALLOWED].join("|")}`,
    source_line: H.runtime.raw };
});
