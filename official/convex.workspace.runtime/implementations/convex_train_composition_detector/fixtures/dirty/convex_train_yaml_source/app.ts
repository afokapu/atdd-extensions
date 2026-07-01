// URN: component:station-master:router:presentation:backend:assembly
// Runtime: convex
// VIOLATION: the Station Master hardcodes the wagon order inline (two wagon surfaces
// called in sequence) instead of delegating to a declarative train definition.
import { runPaceDilemmas } from '@pace-dilemmas/wagon'
import { runResolveDilemmas } from '@resolve-dilemmas/wagon'

export async function handleAction(action: string, inputs: Record<string, unknown>) {
  const paced = await runPaceDilemmas(inputs)
  const resolved = await runResolveDilemmas(paced)
  return { success: true, artifacts: resolved }
}
