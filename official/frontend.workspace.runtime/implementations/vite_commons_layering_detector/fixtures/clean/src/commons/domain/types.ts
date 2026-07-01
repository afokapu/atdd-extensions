// commons domain layer — pure types, framework-agnostic, no outbound edges.
export type Team = "red" | "blue";

export interface Score {
  team: Team;
  points: number;
}
