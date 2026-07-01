// URN: component:play-grid:join-tournament:JoinButton:frontend:presentation
// Runtime: vite
import { useJoin } from '../application/useJoin'

export function JoinButton({ label }: { label: string }) {
  const { join } = useJoin()
  return <button type="button" onClick={join}>{label}</button>
}
