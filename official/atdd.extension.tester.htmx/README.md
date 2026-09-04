# `atdd.extension.tester.htmx`

Tester-role convention for **htmx endpoint tests**. One rule node, realized by
`htmx_tester_detector` in `atdd.workspace.bun`.

## `tester.htmx.fragment-asserts-markup`

A test case that performs an HTTP request and asserts on the response status MUST
also assert on the response **body**.

```ts
expect(res.status).toBe(200);                 // route exists — proves nothing else
const html = await res.text();
expect(html).toContain('id="order-1"');       // the id a later oob swap targets
```

No other stack's tester extension carries this rule, because no other stack puts the
response contract in the markup. htmx swaps the body into the live DOM, so the
hx-attributes, the element ids subsequent out-of-band swaps target, and the
structure itself *are* the interface. A status-only test will not notice when a
refactor drops the `id` that a sibling fragment's `hx-swap-oob` needs — which fails
silently at runtime, exactly as `coder.htmx.oob-swap-carries-id` describes from the
source side. The two rules are one defect seen from both personas.

A single-node package is deliberate, not a stub: this obligation belongs to htmx and
to the tester persona, and both axes are kept orthogonal across the four extensions.
