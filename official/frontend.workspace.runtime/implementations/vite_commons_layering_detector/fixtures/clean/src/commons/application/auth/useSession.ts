// application/auth — depends inward on the domain layer (allowed). A UI-framework
// hook import (preact/hooks) is legitimate in the application layer; only the
// domain layer must stay framework-agnostic.
import { useState } from "preact/hooks";
import type { Score } from "../../domain/types";

export interface ScoreStorePort {
  persist(scores: Score[]): Promise<void>;
}

export function useSession(store: ScoreStorePort) {
  const [pending, setPending] = useState(false);
  return {
    pending,
    async record(scores: Score[]): Promise<void> {
      setPending(true);
      await store.persist(scores);
      setPending(false);
    },
  };
}
