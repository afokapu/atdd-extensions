// A correctly named layer file, present to prove the detector is selective: it
// flags ONLY the mis-named sibling (`helpers.ts`), not this one.
export type Vote = { choice: "yes" | "no" };

export function tallyAllowed(votes: Vote[]): boolean {
  return votes.length > 0;
}
