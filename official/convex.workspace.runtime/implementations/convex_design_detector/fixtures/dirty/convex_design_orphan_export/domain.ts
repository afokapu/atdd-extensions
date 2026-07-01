// DIRTY fixture — `closeness` has a consumer (application.ts), but `deadRotate` is
// exported and imported by NO module and is not a Convex API entry → 1 orphan.
export type Cell = { row: number; col: number };

export function closeness(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function deadRotate(c: Cell): Cell {
  return { row: c.col, col: c.row };
}
