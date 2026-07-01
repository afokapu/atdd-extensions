// URN: component:cast-votes:submit-vote:api:backend:presentation
// A normal feature module on the Convex API surface: its path contains no
// underscore-prefixed directory, so `api.cast_votes.submit_vote.api.submitVote`
// is a reachable, callable function.
import { mutation } from "../../_generated/server";

export const submitVote = mutation({
  args: {},
  handler: async () => {
    return { ok: true };
  },
});
