// CLEAN fixture — a plain helper. It exports no Convex function, so it is NOT a
// root, but `messages.ts` (a root) imports it → reachable, alive.
export function formatBody(body: string): string {
  return body.trim();
}
