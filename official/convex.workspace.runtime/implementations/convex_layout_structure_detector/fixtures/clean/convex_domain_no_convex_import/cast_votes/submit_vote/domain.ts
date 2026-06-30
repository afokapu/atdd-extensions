// A pure domain module: business rules and types only. No Convex runtime import,
// no generated client code, no request context — the domain layer stays at the
// inside of the dependency graph.
export type Vote = { choice: "yes" | "no"; weight: number };

export function isQuorum(votes: Vote[], threshold: number): boolean {
  const total = votes.reduce((sum, vote) => sum + vote.weight, 0);
  return total >= threshold;
}

export function winningChoice(votes: Vote[]): "yes" | "no" | null {
  let yes = 0;
  let no = 0;
  for (const vote of votes) {
    if (vote.choice === "yes") yes += vote.weight;
    else no += vote.weight;
  }
  if (yes === no) return null;
  return yes > no ? "yes" : "no";
}
