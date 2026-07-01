// URN: test:resolve-dilemmas:pairing:M002-TELEMETRY-002-no-emit-assert
// @vitest-environment edge-runtime
//
// TELEMETRY harness test for the dilemma pairing signal — but it ONLY checks the
// mutation's return value. It sets up no sink assertion, so it never proves the
// pairing signal was emitted to the configured sink: a silent green gap.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, test } from 'vitest'
import schema from '../schema'

describe('pairDilemmas telemetry (TELEMETRY-002)', () => {
  test('pairs two dilemmas', async () => {
    const t = convexTest(schema)
    const res = await t.mutation(anyApi.dilemmas.pairDilemmas, { sessionId: 's1' })
    expect(res.pairs).toHaveLength(1)
    expect(res.pairs[0].a).not.toBe(res.pairs[0].b)
  })
})
