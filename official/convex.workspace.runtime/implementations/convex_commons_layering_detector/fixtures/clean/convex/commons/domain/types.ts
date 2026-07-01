// commons domain layer — pure types, no outbound edges, no infrastructure.
export type Team = "red" | "blue";

export interface Score {
  team: Team;
  points: number;
}
