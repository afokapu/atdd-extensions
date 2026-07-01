// Dirty: two silent swallows — an empty catch, and a catch that returns a fallback
// with no log and no rethrow. Both turn a loud failure into an invisible bad state.
import { httpClient } from "../shared/httpClient";

export async function submitVote(matchId: string, choice: string): Promise<boolean> {
  try {
    await httpClient.post({ path: `/api/matches/${matchId}/vote`, body: { choice } });
    return true;
  } catch (e) {
    // ❌ returns a fallback, never logs, never rethrows.
    return false;
  }
}

export function parseConfig(raw: string): Record<string, unknown> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // ❌ empty handler — the parse error vanishes.
  }
  return parsed;
}
