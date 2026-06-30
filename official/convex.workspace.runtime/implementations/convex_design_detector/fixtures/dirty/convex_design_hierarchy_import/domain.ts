// DIRTY fixture — the domain foundation reaches UPWARD into the application layer.
// domain must import nothing upward/outward → 1 violation (domain -> application).
import { evaluateCellUseCase } from "./application";

export type Cell = { row: number; col: number };

export function score(a: Cell, b: Cell): number {
  return evaluateCellUseCase(a, b);
}
