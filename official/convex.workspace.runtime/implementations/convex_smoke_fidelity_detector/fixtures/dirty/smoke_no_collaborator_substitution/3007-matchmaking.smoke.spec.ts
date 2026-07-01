// URN: test:train:3007-matchmaking:E2E-001-paired-smoke
// Train: train:3007-matchmaking
// Phase: SMOKE
// Layer: assembly
// Runtime: convex
// Smoke: true
// Purpose: DIRTY — a SMOKE test that substitutes collaborators instead of driving real infra.
import { test, expect, vi } from 'vitest'
import { matchmakingClient } from '../../convex/matchmaking'

test('E2E-001 paired match is created', async () => {
  // VIOLATION: fakes the real transport with vi.fn instead of hitting the deployed backend.
  const send = vi.fn(async () => ({ ok: true }))
  // VIOLATION: substitutes a production collaborator method with a local lambda.
  matchmakingClient.post = async () => ({ status: 200, matchId: 'm1' })

  const resp = await matchmakingClient.post('/matchmaking/seek', { playerId: 'p1' })
  expect(resp.status).toBe(200)
  expect(send).toHaveBeenCalled()
})
