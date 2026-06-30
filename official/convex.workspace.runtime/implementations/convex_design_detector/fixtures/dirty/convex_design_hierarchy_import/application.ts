// DIRTY fixture — application layer (the import target). Its own import of domain
// would be allowed; the violation is on the domain side reaching up into it.
type Cell = { row: number; col: number };

export function evaluateCellUseCase(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
