// CLEAN fixture — the composition root. Wiring/instantiation lives HERE, which is
// exactly where it belongs. The detector never flags a composition.ts.
import { LedgerRepository } from "./integration";
import { makePayoutUseCase } from "./application";

export function composePayout(ctx: unknown) {
  const ledger = new LedgerRepository(ctx);
  return makePayoutUseCase(ledger);
}
