// URN: test:orders:checkout:E040-SMOKE-001-asserts-fragment
// Acceptance: acc:orders:E040-SMOKE-001-asserts-fragment
// Phase: SMOKE
// Layer: integration
import { describe, it, expect } from "bun:test";

describe("orders fragment", () => {
  // @covers acc:orders:E040-SMOKE-001-asserts-fragment
  it("returns a swappable row carrying its id", async () => {
    const res = await fetch("http://localhost:3000/orders/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="order-1"');
  });
});
