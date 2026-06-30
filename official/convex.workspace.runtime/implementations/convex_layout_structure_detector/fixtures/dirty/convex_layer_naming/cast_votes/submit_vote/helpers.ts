// A feature module that is NOT named after any Convex layer. Its logic belongs in
// one of the layer files (domain.ts for pure rules, integration.ts for db access);
// as `helpers.ts` it hides where it sits in the layering.
export function normalize(choice: string): string {
  return choice.trim().toLowerCase();
}
