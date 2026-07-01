// URN: component:host-match:control-match:HostScreen:frontend:presentation
// Runtime: vite
import { storage } from '@game/shared/integration/storage'

export function HostScreen() {
  return <main>{storage.read('match')}</main>
}
