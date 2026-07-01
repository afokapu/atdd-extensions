// domain/scoring — imports only the domain layer's own root types (same layer,
// via the layer barrel). No framework, no application/integration, no sibling feature.
import type { Score, Team } from "../types";

export function winner(scores: Score[]): Team | null {
  const red = scores.filter((s) => s.team === "red").length;
  const blue = scores.filter((s) => s.team === "blue").length;
  if (red === blue) return null;
  return red > blue ? "red" : "blue";
}
