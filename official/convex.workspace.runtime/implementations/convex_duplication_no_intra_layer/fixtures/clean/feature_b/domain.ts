// CLEAN fixture — domain layer of feature B. Distinct logic from feature A; the two
// domain siblings share no structural fragment.
export function streakBonus(wins: number): number {
  const capped = Math.min(wins, 5);
  return capped * capped;
}
