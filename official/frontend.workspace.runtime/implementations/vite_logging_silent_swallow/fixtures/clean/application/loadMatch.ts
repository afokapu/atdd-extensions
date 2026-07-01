// Clean: every catch observably reacts — it logs and rethrows, or logs and returns
// a declared fallback.
import { httpClient } from "../shared/httpClient";

const logger = console;

export async function loadMatch(matchId: string) {
  try {
    return await httpClient.get<{ id: string }>({ path: `/api/matches/${matchId}` });
  } catch (e) {
    logger.error("failed to load match", { matchId, error: e });
    throw e;
  }
}

export async function loadMatchCount(): Promise<number> {
  try {
    const res = await httpClient.get<{ count: number }>({ path: "/api/matches/count" });
    return res.count;
  } catch (e) {
    // Observable fallback: log, then return the documented default.
    logger.warn("match count unavailable, defaulting to 0", { error: e });
    return 0;
  }
}
