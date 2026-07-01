// CLEAN fixture — the domain FOUNDATION of the score-closeness feature. Pure
// rules/types, zero Convex imports. The upper layers compose from this.
export type Cell = { row: number; col: number };

export function closeness(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
