// URN: test:votes:submit:P002-INPUT-002-happy-only
// @vitest-environment edge-runtime
//
// INPUT harness test for `submitVote` — but it ONLY submits a well-formed payload
// and checks it succeeds. It never asserts that malformed or adversarial input is
// refused, so the input-validation obligation it claims to cover is never proven.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, test } from 'vitest'
import schema from '../schema'

describe('submitVote (INPUT-002)', () => {
  test('accepts a well-formed vote', async () => {
    const t = convexTest(schema)
    const res = await t.mutation(anyApi.votes.submitVote, { cell: 1, sessionId: 's1' })
    expect(res.accepted).toBe(true)
    expect(res.cell).toBe(1)
  })
})
