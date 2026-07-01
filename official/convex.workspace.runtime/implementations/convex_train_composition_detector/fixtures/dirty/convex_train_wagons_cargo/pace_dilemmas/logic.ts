// URN: component:pace-dilemmas:reducer:domain:backend:domain
// Runtime: convex
// VIOLATION: a domain module reaching directly into two OTHER wagons instead of
// receiving their output as cargo from the composition root.
import { resolveDilemma } from '../resolve_dilemmas/application/resolve'
import { scoreRound } from '@score-grid/wagon'

export function pace(fragments: string[]) {
  const resolved = resolveDilemma(fragments)
  return scoreRound(resolved)
}
