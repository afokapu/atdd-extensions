// VIOLATIONS:
//   * domain -> integration  (coder.convex.commons-domain-no-outbound)
//   * domain/scoring -> domain/teams sibling feature (coder.convex.commons-cross-feature-imports-in)
import { makeHttpScoreStore } from "../../integration/http/client";
import type { Team } from "../teams/model";

export function persistWinner(baseUrl: string, team: Team) {
  const store = makeHttpScoreStore(baseUrl);
  return store.persist([{ team: team.id, points: 1 }]);
}
