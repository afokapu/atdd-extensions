// NO-DESIGN-LAYER fixture (the FRG consumer case): real component code with NO
// design system anywhere in the scanned tree (no design/ or design_system/ dir, no
// tokens/foundations source). Every design-system rule is OUT OF SCOPE here, so the
// detector emits ZERO violations even though this code WOULD violate several rules
// if a design layer were present:
//   * raw <button>            → would fire coder.vite.design-primitives
//   * color: '#3a7bd5' literal → would fire coder.vite.design-token-color
export function Widget({ label }: { label: string }) {
  const style = { color: '#3a7bd5' }
  return (
    <form>
      <span style={style}>{label}</span>
      <button type="submit">go</button>
    </form>
  )
}

// Exported but imported by nothing — WOULD fire coder.vite.design-orphan-ui in scope.
export function OrphanBadge() {
  return <span className="badge" />
}
