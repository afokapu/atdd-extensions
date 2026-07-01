// URN: component:checkout:wagon:entrypoint:backend:assembly
// Runtime: convex
// A train runner DEFINED inside a test file — VIOLATION: composition roots are
// production code, not test infrastructure.
export class TrainRunner {
  constructor(private trainId: string) {}
  execute(inputs: Record<string, unknown>) {
    return { success: true, artifacts: {} as Record<string, unknown> }
  }
}
