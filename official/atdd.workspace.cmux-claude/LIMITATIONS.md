# Known limitations — atdd.workspace.cmux-claude

## Dangerous-permission live conformance is not inducible under cmux auto-mode (#13)

**Status:** documented limitation — not a code defect. This is the resolution of #13.

### The requirement (owned by core)
The safety property *dangerous action ⇒ escalate, never auto-execute* is a **core**
requirement (`atdd.coach.decision_channel`, afokapu/atdd). It is covered by core
unit/integration tests against a fake channel, and does not depend on cmux.

### The limitation (this provider)
The cmux **live** harness cannot induce a *blocked* dangerous permission decision, so the
dangerous⇒escalate property has no genuine cmux live coverage. A toolkit-spawned worker
runs with `--permission-mode acceptEdits` + a scoped `--allowedTools` (no
`--dangerously-skip-permissions`; E014-guarded). Under this posture, a dangerous `Bash`
use executes as `toolUse` **telemetry** rather than blocking as a *pending permission
decision* on the Feed — so there is nothing for the safety gate to escalate, and the live
smokes (`c003`/`c004`/`c005`) skip with *"no blocked dangerous permission inducible under
cmux auto-mode."*

This is a property of the cmux + Claude runtime, not of the adapter: the adapter never
sees a dangerous decision to escalate because the environment never surfaces one as a
blocking decision.

### Where the safety guarantee actually lives
1. **Core** unit/integration: dangerous⇒escalate against a fake channel (the authority).
2. **Provider boundary** (`conformance/test_safety_escalation.py`): once a dangerous
   decision *is* escalated it is terminal — the adapter can never auto-resolve it
   afterward (`deliver_reply` refuses a terminal request), and escalate/resolve are
   mutually exclusive. So a dangerous decision that takes the safe path can never be
   silently auto-approved.

### Revisit-when
If cmux exposes a mode that surfaces a dangerous tool use as a **blocking** permission
decision on the Feed (rather than after-the-fact `toolUse` telemetry), add the live
harness that induces it and promote `c003`/`c004`/`c005` from skip to a real assertion.
Until then, the two layers above are the authority and #13 is closed as a documented
limitation.
