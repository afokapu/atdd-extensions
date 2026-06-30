// DIRTY fixture — dead code. This module exports a plain helper, exports NO Convex
// function (not an API entry / root), and no reachable module imports it. It is
// unreachable from any graph root → 1 violation.
export function unusedChecksum(input: string): number {
  let h = 0;
  for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
