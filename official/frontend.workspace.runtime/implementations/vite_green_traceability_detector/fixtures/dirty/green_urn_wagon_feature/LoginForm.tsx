// URN: component:ManageUsers:authenticate-user:LoginForm:frontend:presentation
// Tested-By:
// - test:manage-users:authenticate-user:WMBT-VITE-001-renders-form
// Runtime: vite
// Purpose: Presentational login form wired to the authenticate-user use case

import { Button } from '@/design/primitives'

export function LoginForm() {
  return <Button type="submit">Sign in</Button>
}
