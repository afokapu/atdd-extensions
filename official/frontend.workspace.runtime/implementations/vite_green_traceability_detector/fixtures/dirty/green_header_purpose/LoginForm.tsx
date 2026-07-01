// URN: component:manage-users:authenticate-user:LoginForm:frontend:presentation
// Tested-By:
// - test:manage-users:authenticate-user:WMBT-VITE-001-renders-form
// Runtime: vite
// Purpose: Validate a chosen option against the currently open dilemma and additionally persist a full audit-trail record for later replay

import { Button } from '@/design/primitives'

export function LoginForm() {
  return <Button type="submit">Sign in</Button>
}
