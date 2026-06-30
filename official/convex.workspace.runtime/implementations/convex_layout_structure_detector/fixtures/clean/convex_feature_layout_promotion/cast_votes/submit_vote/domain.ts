// A single-file domain layer that is still small: 3 exported entities, well under
// 150 lines. No promotion needed — it stays a single `domain.ts`.
export type Vote = { choice: "yes" | "no" };

export function isYes(vote: Vote): boolean {
  return vote.choice === "yes";
}

export function countYes(votes: Vote[]): number {
  return votes.filter(isYes).length;
}
