// Composed entirely from design-system primitives (<Input>, <Button>) — no raw
// interactive HTML element, so the surface stays themed and accessible.
import { Input, Button } from './primitives'

export function LoginForm() {
  return (
    <form>
      <Input name="email" />
      <Button type="submit">sign in</Button>
    </form>
  )
}
