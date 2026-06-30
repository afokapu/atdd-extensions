// A design-system primitive. Imported and rendered by App.tsx below, so it is
// connected to the rendered UI surface — not an orphan.
export function Button({ label }: { label: string }) {
  return <span className="btn">{label}</span>
}
