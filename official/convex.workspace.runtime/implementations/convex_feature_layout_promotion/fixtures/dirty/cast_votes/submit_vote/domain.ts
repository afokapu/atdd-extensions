// A single-file domain layer that has outgrown one file: 4 exported entities
// (> 3). It should be promoted to a `domain/` directory (index.ts + per-entity
// files) so the feature stays discoverable without scrolling one large module.
export type Vote = { choice: "yes" | "no" };

export function isYes(vote: Vote): boolean {
  return vote.choice === "yes";
}

export function isNo(vote: Vote): boolean {
  return vote.choice === "no";
}

export function countYes(votes: Vote[]): number {
  return votes.filter(isYes).length;
}
