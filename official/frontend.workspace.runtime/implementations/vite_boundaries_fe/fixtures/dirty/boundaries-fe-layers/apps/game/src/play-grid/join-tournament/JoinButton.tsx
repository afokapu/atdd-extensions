// URN: component:play-grid:join-tournament:JoinButton:frontend:presentation
// Runtime: vite
import { Team } from './domain/Team'

export function JoinButton({ team }: { team: Team }) {
  return <button type="button">Join {team.name}</button>
}
