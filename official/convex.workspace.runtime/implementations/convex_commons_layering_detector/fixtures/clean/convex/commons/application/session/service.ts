// application/session — depends inward on the domain layer only (allowed). It
// speaks to infrastructure through a port it declares, never by importing the
// integration layer.
import type { Score } from "../../domain/types";

export interface ScoreStorePort {
  persist(scores: Score[]): Promise<void>;
}

export function makeSessionService(store: ScoreStorePort) {
  return {
    async record(scores: Score[]): Promise<void> {
      await store.persist(scores);
    },
  };
}
