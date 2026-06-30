// CLEAN fixture — application imports only inward (domain). Allowed edge.
import { closeness, type Cell } from "./domain";

export function evaluateCellUseCase(a: Cell, b: Cell): number {
  return closeness(a, b);
}
