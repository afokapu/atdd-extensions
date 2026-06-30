// VIOLATION: a color-bearing style property set to a raw color literal ('tomato')
// instead of a design-token reference — forks the palette away from the theme.
export function Pill({ label }: { label: string }) {
  const style = { color: 'tomato' }
  return <span style={style}>{label}</span>
}
