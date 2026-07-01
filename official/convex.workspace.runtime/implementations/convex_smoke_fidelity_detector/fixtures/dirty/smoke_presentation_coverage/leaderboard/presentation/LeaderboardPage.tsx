// DIRTY — a presentation component with NO sibling *smoke*.spec.ts covering the
// `leaderboard` wagon. Steady-state coverage gap (TESTER-SMOKE-PRES-001 / #293).
export function LeaderboardPage({ trainId }: { trainId: string }) {
  return (
    <section className="leaderboard-page">
      <h1>Leaderboard {trainId}</h1>
      <ol className="leaderboard-page__rows" />
    </section>
  )
}
