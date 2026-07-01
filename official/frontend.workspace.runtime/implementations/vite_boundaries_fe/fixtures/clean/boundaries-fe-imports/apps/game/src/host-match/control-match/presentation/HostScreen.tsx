// URN: component:host-match:control-match:HostScreen:frontend:presentation
// Runtime: vite
import { useHost } from '../application/useHost'

export function HostScreen() {
  const { match } = useHost()
  return <main>{match.name}</main>
}
