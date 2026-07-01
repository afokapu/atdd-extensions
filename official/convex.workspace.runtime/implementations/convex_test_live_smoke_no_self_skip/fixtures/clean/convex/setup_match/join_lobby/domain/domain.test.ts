// URN: test:setup-match:join-lobby:D001-UNIT-001-domain
// Acceptance: acc:setup-match:D001-UNIT-001
// Train: train:setup-match
// Phase: GREEN
// Layer: domain
//
// An ORDINARY unit test (Phase: GREEN, not a live-smoke). It legitimately uses
// it.skip / describe.skip for work-in-progress cases — this is out of scope for the
// live-smoke self-skip rule, so this file has 0 violations even though it skips.
import { describe, it, test, expect } from "vitest";
import { seatPlayer, isLobbyFull } from "./lobby";

describe("join-lobby domain", () => {
  it("seats a player into an open lobby", () => {
    expect(seatPlayer({ seats: [] }, "p1").seats).toHaveLength(1);
  });

  it.skip("rebalances teams on late join", () => {
    // WIP: rebalancing not implemented yet — legitimately skipped in a unit suite.
    expect(true).toBe(true);
  });

  test.todo("evicts idle players after timeout");
});

describe.skip("join-lobby experimental matchmaking", () => {
  it("pairs by elo", () => {
    expect(isLobbyFull({ seats: [1, 2] }, 2)).toBe(true);
  });
});
