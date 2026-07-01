// CLEAN fixture — every export here has a consumer. `closeness` is imported by
// application.ts below, so it is not an orphan.
export type Cell = { row: number; col: number };

export function closeness(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
