// integration/http — a legitimate integration module (the import *target* for the
// dirty domain/application modules above). It has no violations of its own.
export function makeHttpScoreStore(baseUrl: string) {
  return {
    async persist(rows: Array<{ team: string; points: number }>): Promise<void> {
      await Promise.resolve({ baseUrl, count: rows.length });
    },
  };
}
