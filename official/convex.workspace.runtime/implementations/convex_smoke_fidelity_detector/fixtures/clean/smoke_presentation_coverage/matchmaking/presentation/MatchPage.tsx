// CLEAN — a presentation component WITH a sibling *smoke*.spec.ts under the same
// `matchmaking` wagon tree (see ../e2e/match-page.smoke.spec.ts).
export function MatchPage({ matchId }: { matchId: string }) {
  return (
    <section className="match-page">
      <h1>Match {matchId}</h1>
      <p>Waiting for opponent…</p>
    </section>
  )
}
