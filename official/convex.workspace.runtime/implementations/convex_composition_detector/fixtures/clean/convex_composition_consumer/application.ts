// CLEAN fixture — application use case that RECEIVES its dependency by injection.
// The ledger repository arrives as a parameter; the consumer constructs nothing.
import type { LedgerPort } from "./domain";

export function makePayoutUseCase(ledger: LedgerPort) {
  return async (batchId: string) => {
    const pending = await ledger.pending(batchId);
    return pending.length;
  };
}
