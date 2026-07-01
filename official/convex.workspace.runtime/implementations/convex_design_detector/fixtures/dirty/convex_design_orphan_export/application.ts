// CLEAN fixture — imports closeness (consuming the domain export) and exports
// evaluateCellUseCase, which api.ts consumes.
import { closeness, type Cell } from "./domain";

export function evaluateCellUseCase(a: Cell, b: Cell): number {
  return closeness(a, b);
}
