// DIRTY — the route test drives a MockInterlockingRunner instead of the production runner: a
// descriptive green that proves nothing about production route control.
import { MockInterlockingRunner } from "../../../test/mocks";

test("nominal resolves the standard train (against a fake)", () => {
  const resolution = new MockInterlockingRunner().resolveTrain("resolve_match", { allPlayersVoted: true });
  expect(resolution.routeId).toBe("nominal-all-voted");
  expect(resolution.trainId).toBe("3007-match-resolution-standard");
});
