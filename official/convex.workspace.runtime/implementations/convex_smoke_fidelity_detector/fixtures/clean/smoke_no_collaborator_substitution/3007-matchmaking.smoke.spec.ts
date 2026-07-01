// URN: test:train:3007-matchmaking:E2E-001-paired-smoke
// Train: train:3007-matchmaking
// Phase: SMOKE
// Layer: assembly
// Runtime: convex
// Smoke: true
// Purpose: CLEAN — a SMOKE test that drives the REAL client and asserts real DB state.
import { test, expect } from 'vitest'
import { matchmakingClient } from '../../convex/matchmaking'

test('E2E-001 paired match is created', async () => {
  // GIVEN two authenticated players against the real deployed backend.
  const resp = await matchmakingClient.post('/matchmaking/seek', { playerId: 'p1' })
  expect(resp.status).toBe(200)

  // AND the row is verified by querying real state back — no fakes, no substitution.
  const row = await matchmakingClient.query('matches:byId', { id: resp.matchId })
  expect(row.playerIds).toContain('p1')
})
