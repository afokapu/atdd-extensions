// URN: test:votes:submit:P001-INPUT-001-reject-malformed
// @vitest-environment edge-runtime
//
// INPUT harness test for `submitVote` — it asserts the mutation REFUSES malformed
// and adversarial payloads, not just that a valid one succeeds.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { ConvexError } from 'convex/values'
import { describe, expect, test } from 'vitest'
import schema from '../schema'

describe('submitVote (INPUT-001)', () => {
  test('rejects an out-of-range cell code', async () => {
    const t = convexTest(schema)
    await expect(
      t.mutation(anyApi.votes.submitVote, { cell: 999, sessionId: 's1' }),
    ).rejects.toThrow(/invalid cell code/i)
  })

  test('rejects an empty session id', async () => {
    const t = convexTest(schema)
    await expect(
      t.mutation(anyApi.votes.submitVote, { cell: 1, sessionId: '' }),
    ).rejects.toThrow(ConvexError)
  })

  test('accepts a well-formed vote', async () => {
    const t = convexTest(schema)
    const res = await t.mutation(anyApi.votes.submitVote, { cell: 1, sessionId: 's1' })
    expect(res.accepted).toBe(true)
  })
})
