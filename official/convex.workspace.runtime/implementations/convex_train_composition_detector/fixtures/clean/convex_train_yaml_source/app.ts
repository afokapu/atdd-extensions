// URN: component:station-master:router:presentation:backend:assembly
// Runtime: convex
// Clean: the Station Master maps an action to a train id and delegates to the
// TrainRunner — the train definition owns the wagon order (single source of truth).
import { TrainRunner } from './trains/runner'

const JOURNEY_MAP: Record<string, string> = {
  start_quiz: '1006-quiz-workflow-adaptive',
  start_match: '3001-solo-match-complete',
}

export async function handleAction(action: string, inputs: Record<string, unknown>) {
  const trainId = JOURNEY_MAP[action]
  const runner = new TrainRunner(`plan/_trains/${trainId}.yaml`)
  return runner.execute(inputs)
}
