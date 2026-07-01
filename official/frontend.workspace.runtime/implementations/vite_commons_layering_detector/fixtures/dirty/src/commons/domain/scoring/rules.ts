// VIOLATIONS:
//   * domain -> UI framework 'preact'  (coder.vite.commons-domain-no-framework-import)
//   * domain -> integration            (coder.vite.commons-domain-no-outbound)
//   * domain/scoring -> domain/teams sibling feature (coder.vite.commons-cross-feature-imports-in)
import { signal } from "preact";
import { makeHttpScoreStore } from "../../integration/http/client";
import type { Team } from "../teams/model";

export function persistWinner(baseUrl: string, team: Team) {
  const s = signal(team.id);
  const store = makeHttpScoreStore(baseUrl);
  return store.persist([{ team: s.value, points: 1 }]);
}
