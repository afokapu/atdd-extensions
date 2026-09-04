# `atdd.extension.coder.htmx`

Coder-role conventions for **htmx hypermedia markup**. 6 rule nodes, realized by
`htmx_hypermedia_detector` in `atdd.workspace.bun`.

Layered **on top of** `atdd.extension.coder.bun`, never instead of it: htmx is a
library, Bun is the runtime underneath.

| rule | catches |
|---|---|
| `fragment-interpolation-escaped` | raw `${value}` in an HTML fragment — stored XSS (carries the shared `SECURITY-XSS-001` alias) |
| `oob-swap-carries-id` | `hx-swap-oob` with no `id` — htmx drops it silently |
| `destructive-verb-confirms` | `hx-delete` with no `hx-confirm` |
| `mutation-signals-progress` | a mutating request with no `hx-indicator` / `hx-disabled-elt` |
| `no-inline-event-handler` | `onclick="…"` in htmx markup — dies on swap |
| `endpoint-not-absolute-url` | a verb attribute hardcoding a foreign origin |

Three of these exist because **htmx removes the place the obligation used to live**:
a component framework escapes interpolation automatically, a handler is where the
confirmation used to sit, and a page navigation gave progress feedback for free.
The migration loses all three silently.
