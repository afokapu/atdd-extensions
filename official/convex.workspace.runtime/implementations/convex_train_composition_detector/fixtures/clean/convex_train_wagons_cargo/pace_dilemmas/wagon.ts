// URN: component:pace-dilemmas:wagon:entrypoint:backend:assembly
// Runtime: convex
// Clean: the composition root is the ONE sanctioned place to reach across a wagon
// boundary — it wires another wagon's surface in as cargo. Exempt from the rule.
import { resolveDilemma } from '@resolve-dilemmas/wagon'
import { pace } from './logic'

export function runPaceDilemmas(inputs: Record<string, unknown>) {
  const paced = pace(inputs as never)
  return resolveDilemma(paced as never)
}
