// CLEAN fixture — application use case, composes from the domain foundation.
import { closeness, type Cell } from "./domain";

export function evaluateCellUseCase(a: Cell, b: Cell): number {
  return closeness(a, b);
}
