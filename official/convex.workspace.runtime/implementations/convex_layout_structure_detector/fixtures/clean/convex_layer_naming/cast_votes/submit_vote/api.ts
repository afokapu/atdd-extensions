// URN: component:cast-votes:submit-vote:api:backend:presentation
// Presentation layer, correctly rendered as `api.ts`.
import { mutation } from "../../_generated/server";

export const submitVote = mutation({
  args: {},
  handler: async () => ({ ok: true }),
});
