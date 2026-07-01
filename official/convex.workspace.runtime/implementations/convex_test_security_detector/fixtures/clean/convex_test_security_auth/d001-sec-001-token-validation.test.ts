// URN: test:auth:sessions:D001-SEC-001-token-validation
// @vitest-environment edge-runtime
//
// SEC harness test for the authenticated `me` query. It PROVES the endpoint
// rejects an unauthenticated caller — a real auth assertion, not a happy path.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, test } from 'vitest'
import schema from '../schema'

describe('me (SEC-001)', () => {
  test('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema)
    // No identity supplied -> the query must refuse.
    await expect(t.query(anyApi.users.me, {})).rejects.toThrow(/unauthenticated/i)
  })

  test('returns the profile for the authenticated identity', async () => {
    const t = convexTest(schema)
    const as = t.withIdentity({ subject: 'user-1' })
    const profile = await as.query(anyApi.users.me, {})
    expect(profile.subject).toBe('user-1')
  })
})
