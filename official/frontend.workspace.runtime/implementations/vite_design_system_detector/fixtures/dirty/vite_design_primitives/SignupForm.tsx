// VIOLATION: a raw interactive <button> element in app code where the
// design-system <Button> primitive should be composed instead.
export function SignupForm() {
  return (
    <form>
      <button type="submit">create account</button>
    </form>
  )
}
