// VIOLATION:
//   * application -> integration  (coder.vite.commons-application-no-integration)
// The application layer must depend on a port, not reach into integration directly.
import { makeHttpScoreStore } from "../../integration/http/client";

export function useSession(baseUrl: string) {
  const store = makeHttpScoreStore(baseUrl);
  return {
    async record(points: number): Promise<void> {
      await store.persist([{ team: "red", points }]);
    },
  };
}
