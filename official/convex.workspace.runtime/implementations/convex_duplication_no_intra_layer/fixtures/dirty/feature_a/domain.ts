// DIRTY fixture — domain layer of feature A. The `clampScore` helper below is
// copy-pasted verbatim into feature B's domain.ts (same layer) → 1 violation.
export function teamRank(points: number, played: number): number {
  return played === 0 ? 0 : Math.round((points / played) * 100);
}

export function clampScore(raw: number, min: number, max: number): number {
  let value = raw;
  if (value < min) {
    value = min;
  }
  if (value > max) {
    value = max;
  }
  return value;
}
