// DIRTY fixture — application use case that CONSTRUCTS its own dependency instead
// of receiving it by injection. `new LedgerRepository(ctx)` hard-wires the concrete
// collaborator into the consumer → 1 violation.
import { LedgerRepository } from "./integration";

export function makePayoutUseCase(ctx: unknown) {
  return async (batchId: string) => {
    const ledger = new LedgerRepository(ctx);
    const pending = await ledger.pending(batchId);
    return pending.length;
  };
}
