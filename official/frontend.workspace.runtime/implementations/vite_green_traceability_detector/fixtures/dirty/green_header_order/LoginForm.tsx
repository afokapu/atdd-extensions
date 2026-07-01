// URN: component:manage-users:authenticate-user:LoginForm:frontend:presentation
// Runtime: vite
// Tested-By:
// - test:manage-users:authenticate-user:WMBT-VITE-001-renders-form
// Purpose: Presentational login form wired to the authenticate-user use case

import { Button } from '@/design/primitives'

export function LoginForm() {
  return <Button type="submit">Sign in</Button>
}
