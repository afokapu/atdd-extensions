// DIRTY fixture — this convex root defines an httpAction( handler but has NO
// http.ts directly under it to route it. Expected: exactly 1 violation (the
// handler is never mounted because convex/http.ts is missing).
import { httpAction } from "./_generated/server";

export const stripeWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  return new Response(body, { status: 200 });
});
