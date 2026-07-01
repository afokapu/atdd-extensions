// URN: test:resolve-dilemmas:selection:M001-TELEMETRY-001-selection-emitted
// @vitest-environment edge-runtime
//
// TELEMETRY harness test for the dilemma selection signal. It PROVES the signal
// reached the configured sink by asserting the sink spy was called with the
// expected event payload — not merely that the mutation returned.
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, test, vi } from 'vitest'
import schema from '../schema'

describe('selectDilemma telemetry (TELEMETRY-001)', () => {
  test('emits a selection event to the sink', async () => {
    const sink = { capture: vi.fn() }
    const t = convexTest(schema).withSink(sink)
    await t.mutation(anyApi.dilemmas.selectDilemma, { sessionId: 's1', cell: 4 })
    // The real obligation: assert the signal was EMITTED to the sink.
    expect(sink.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'dilemma.selected', cell: 4 }),
    )
  })
})
