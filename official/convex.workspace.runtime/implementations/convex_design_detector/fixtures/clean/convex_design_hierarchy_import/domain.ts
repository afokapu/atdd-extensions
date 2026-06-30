// CLEAN fixture — the domain foundation. Pure: imports nothing upward or outward.
export type Cell = { row: number; col: number };

export function closeness(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
