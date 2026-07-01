// URN: component:checkout:wagon:entrypoint:backend:assembly
// Runtime: convex
// Production train composition root (NOT test infrastructure).
export class TrainRunner {
  constructor(private trainId: string) {}
  execute(inputs: Record<string, unknown>) {
    return { success: true, artifacts: {} as Record<string, unknown> }
  }
}
