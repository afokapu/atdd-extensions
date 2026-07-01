#!/usr/bin/env node
// Member check: coder.convex.green-urn-marker  (GREEN/URN traceability family)
//
// CONTRACT (v1.1): reads ATDD_SCAN_ROOTS / ATDD_SCAN_EXCLUDES, writes RAW
// {rule_id,file,line,col,evidence,source_line} violations to ATDD_VIOLATIONS_REPORT,
// exits 0 regardless of violation count. Zero deps; shared parsing lives in
// ../urn_header.mjs. Evaluates ONE rule over each file's parsed header.
import { runCheck } from "../urn_header.mjs";

runCheck("coder.convex.green-urn-marker", (H, file) => {
  if (!H.urn) return { line: H.firstNonEmptyNo || 1, col: 1,
    evidence: "missing `// URN:` component marker (must be the first non-empty line)",
    source_line: H.firstNonEmptyText };
  if (H.urn.no !== H.firstNonEmptyNo) return { line: H.firstNonEmptyNo, col: 1,
    evidence: "`// URN:` marker is not the first non-empty line of the file",
    source_line: H.firstNonEmptyText };
  return null;
});
