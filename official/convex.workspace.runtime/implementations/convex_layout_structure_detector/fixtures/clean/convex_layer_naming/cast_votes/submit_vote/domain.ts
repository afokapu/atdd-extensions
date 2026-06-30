// Domain layer, correctly rendered as `domain.ts`: pure rules, no Convex imports.
export type Vote = { choice: "yes" | "no" };

export function tallyAllowed(votes: Vote[]): boolean {
  return votes.length > 0;
}
