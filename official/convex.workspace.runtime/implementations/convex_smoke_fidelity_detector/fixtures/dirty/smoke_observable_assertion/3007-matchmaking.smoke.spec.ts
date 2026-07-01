// URN: test:train:3007-matchmaking:E2E-002-seek-smoke
// Train: train:3007-matchmaking
// Phase: SMOKE
// Layer: assembly
// Runtime: convex
// Smoke: true
// Purpose: DIRTY — mutates state but only asserts the HTTP response (no DB read-back).
import { test, expect } from 'vitest'
import { matchmakingClient } from '../../convex/matchmaking'

test('E2E-002 seeking a match returns 200', async () => {
  // VIOLATION: a state-mutating POST with no observable/DB assertion — response-only.
  const resp = await matchmakingClient.post('/matchmaking/seek', { playerId: 'p1' })
  expect(resp.status).toBe(200)
  expect(resp.matchId).toBeDefined()
})
