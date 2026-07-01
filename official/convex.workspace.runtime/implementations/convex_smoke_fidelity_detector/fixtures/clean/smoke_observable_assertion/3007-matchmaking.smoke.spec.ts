// URN: test:train:3007-matchmaking:E2E-002-seek-smoke
// Train: train:3007-matchmaking
// Phase: SMOKE
// Layer: assembly
// Runtime: convex
// Smoke: true
// Purpose: CLEAN — mutates state AND asserts the persisted row via a real query.
import { test, expect } from 'vitest'
import { matchmakingClient } from '../../convex/matchmaking'

test('E2E-002 seeking a match persists a match row', async () => {
  const resp = await matchmakingClient.post('/matchmaking/seek', { playerId: 'p1' })
  expect(resp.status).toBe(200)

  // Observable assertion: the mutation is verified by reading the real row back.
  const row = await matchmakingClient.query('matches:byId', { id: resp.matchId })
  expect(row.playerIds).toContain('p1')
})
