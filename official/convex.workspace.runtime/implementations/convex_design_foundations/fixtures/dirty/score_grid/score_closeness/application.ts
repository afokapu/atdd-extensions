// DIRTY fixture — application use case with the domain rule inlined (no domain.ts
// to compose from). This is the symptom: logic that belongs in the foundation
// lives in the upper layer because the foundation is missing.
type Cell = { row: number; col: number };

export function evaluateCellUseCase(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
