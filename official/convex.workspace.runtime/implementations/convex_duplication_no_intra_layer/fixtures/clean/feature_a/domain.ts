// CLEAN fixture — domain layer of feature A. Its helper is unique to this file;
// no other same-layer file shares a structural window with it.
export function teamRank(points: number, played: number): number {
  if (played === 0) {
    return 0;
  }
  return Math.round((points / played) * 100);
}
