// CLEAN fixture — this convex root uses httpAction( AND has http.ts directly under
// it to mount the router. Expected: 0 violations.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response("ok")),
});

export default http;
