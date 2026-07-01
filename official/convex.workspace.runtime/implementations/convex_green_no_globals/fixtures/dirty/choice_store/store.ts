// URN: component:resolve-dilemmas:choose-option:ChoiceStore:backend:integration
// Tested-By:
// - test:resolve-dilemmas:choose-option:WMBT-CONVEX-010-persists-choice
// Runtime: convex
// Purpose: Persist chosen options

import { PgClient } from './pg'

// GR-NOGLOBALS violation: a module-level DB singleton wires infrastructure at
// import time and cannot be substituted in a test.
export const db = new PgClient(process.env.DATABASE_URL)

export async function saveChoice(id: string): Promise<void> {
  await db.insert('choices', { id })
}
