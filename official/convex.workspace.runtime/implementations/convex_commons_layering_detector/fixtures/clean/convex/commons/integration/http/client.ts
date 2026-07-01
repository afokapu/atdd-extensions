// integration/http — the outermost layer. It may depend inward on both domain
// and application (it implements the ports the application declares).
import type { Score } from "../../domain/types";
import type { ScoreStorePort } from "../../application/session/service";

export function makeHttpScoreStore(baseUrl: string): ScoreStorePort {
  return {
    async persist(scores: Score[]): Promise<void> {
      await Promise.resolve({ baseUrl, count: scores.length });
    },
  };
}
