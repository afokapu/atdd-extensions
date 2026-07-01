// integration/http — the outermost layer; may depend inward on both domain and
// application (it implements the port the application declares).
import type { Score } from "../../domain/types";
import type { ScoreStorePort } from "../../application/auth/useSession";

export function makeHttpScoreStore(baseUrl: string): ScoreStorePort {
  return {
    async persist(scores: Score[]): Promise<void> {
      await Promise.resolve({ baseUrl, count: scores.length });
    },
  };
}
