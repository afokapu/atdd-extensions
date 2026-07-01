// DIRTY fixture — domain layer of feature B. The `clampScore` helper is the SAME
// structural fragment copy-pasted from feature A's domain.ts (renamed args only) →
// the intra-layer duplication this rule forbids.
export function streakBonus(wins: number): number {
  return Math.min(wins, 5) ** 2;
}

export function clampValue(input: number, lo: number, hi: number): number {
  let result = input;
  if (result < lo) {
    result = lo;
  }
  if (result > hi) {
    result = hi;
  }
  return result;
}
