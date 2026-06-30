// Colors come from the design-token set (a `colors.` reference), not an inline
// literal — a re-theme flows through automatically. `transparent` is a tolerated
// keyword, not a forked palette color.
import { colors } from './theme'

export function Badge({ label }: { label: string }) {
  const style = { color: colors.accent, backgroundColor: 'transparent' }
  return <span style={style}>{label}</span>
}
