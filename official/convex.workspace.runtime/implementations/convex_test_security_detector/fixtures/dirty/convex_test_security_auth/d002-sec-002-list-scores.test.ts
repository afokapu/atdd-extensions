// URN: test:scores:leaderboard:D002-SEC-002-list-scores
// @vitest-environment edge-runtime
//
// SEC harness test for the `listScores` query — but it ONLY exercises the happy
// path. It never proves the endpoint refuses an unauthenticated caller, so the
// security obligation this test claims to cover is never actually asserted.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, test } from 'vitest'
import schema from '../schema'

describe('listScores (SEC-002)', () => {
  test('returns the ranked score rows', async () => {
    const t = convexTest(schema)
    const rows = await t.query(anyApi.scores.listScores, { limit: 3 })
    expect(rows).toHaveLength(3)
    expect(rows[0].points).toBeGreaterThan(rows[1].points)
  })
})
