# cmux-claude runtime ownership — the agnostic-core model

> **Status:** architecture decision of record. Supersedes the "move-and-invoke" /
> "core-daemon-runner" framing of core tracker `afokapu/atdd#1327`. Produced after a
> three-way investigation (substrate loader, `coach_runtime`, decide-brain) that showed
> the earlier framing would overfit core to cmux.

## 0. The decision, in one paragraph

Core (`afokapu/atdd`) is an **agnostic substrate**. Anything cmux/Claude-specific —
including the *decision-mediation daemon and its spawn trigger* — belongs to a
**workspace extension** (`atdd.workspace.cmux-claude`), which owns that runtime
**end-to-end**. Core defines only an **agnostic obligation/hook** ("worker decisions
must be mediated live; something must supervise them"); the extension **satisfies** it.
**Core never imports, spawns, or otherwise invokes the provider.** The provider never
imports `atdd.*`. They meet only at an agnostic seam expressed as data/contract.

## 1. The correct model

Three roles, one direction of dependency:

| Role | Owns | Home |
|---|---|---|
| **Core `atdd`** | the *agnostic obligation*: "worker decisions must be mediated live," expressed as a convention node + a transport-neutral hook. No cmux, no daemon, no spawn. | `afokapu/atdd` |
| **Workspace extension `atdd.workspace.cmux-claude`** | the *whole cmux runtime end-to-end*: the decision channel, the feed-daemon supervision loop, **and the spawn trigger that starts/attaches the daemon in production**. | this package |
| **The seam** | an **agnostic** contract: core states the obligation; the extension registers a satisfier and self-triggers its own runtime. Core learns *that* the obligation is satisfied, never *how*. | core hook ⇄ extension satisfier |

The obligation core already owns (LANDED) is
`coach.execution.dispatch-verifies-channel-live` — the extension declares it `realizes`
that node (`atdd.workspace.yaml::realizes`). The correct extension of this model is: the
same agnostic-satisfier mechanism that lets the extension answer "is the channel live?"
also lets the extension **own the trigger** that makes it live — i.e. spawn/attach the
daemon. The trigger is extension runtime, not a core call.

### What "extension owns the spawn trigger" means concretely

- Core dispatch reaches an **agnostic hook** ("a worker is being launched into this
  workspace; the mediation obligation applies"). Core does not know cmux exists.
- The **extension** observes/receives that agnostic signal and runs its own supervision
  spawn (the cmux-surface feed daemon) using its own adapters — `adapter/daemon.py`,
  `adapter/decision_channel.py`, `adapter/feed.py`, `adapter/session.py`,
  `adapter/durable.py`. All of this already lives here (see §2).
- The decision **policy** (safety gate: dangerous ⇒ escalate) is core-agnostic and
  crosses the process boundary as **serialized config/contract** (see §3), never as a
  live Python object handed from core into the provider.

## 2. Reusable foundation — already landed here (ext PR #41)

The correct implementation does **not** start from zero. The extension already holds the
runtime mechanics, merged and conformance-green:

| Piece | File | Role in the target model |
|---|---|---|
| `FeedDaemon` (poll loop, idempotency, escalation-never-auto-answered, single-instance lock, graceful stop) — **decide brain injected, not imported** | `adapter/daemon.py` | the supervision loop the extension spawns |
| `append_jsonl` / `read_request_ids` / `JsonlLedger` (durable audit ledgers, separate from the transport feed) | `adapter/durable.py` | the daemon's verdict/escalation ledgers |
| `DecisionChannelAdapter` (surface_pending / deliver_reply select+submit / escalate) | `adapter/decision_channel.py` | the two-way channel the daemon drives |
| `CommandFeed` (durable append-only JSONL, seq = line) | `adapter/feed.py` | transport.command-feed |
| `open_session` / `signal_session` | `adapter/session.py` | orchestration.agent-session |
| `cmux_channel_readiness` | `adapter/readiness.py` | the readiness satisfier of `dispatch-verifies-channel-live` |
| conformance approach (real adapter + on-disk feed + real ledgers; injected worker stands in for cmux+Claude; import-discipline AST scan proves no `import atdd.*`) | `conformance/*` | the hermetic proof pattern the target implementation reuses |

`FeedDaemon`'s **brain-injected** design (`decide: Callable[[decision], Decision]`) is the
right shape: the loop is transport/supervision; the decide policy is supplied. In the
target model the extension builds that `decide` inside its own daemon process from the
core-agnostic policy **config** (§3), so the injection stays literal without core ever
handing the extension a callable.

## 3. Key findings (carry forward)

1. **The daemon is out-of-process.** Production launches the supervisor as a detached
   subprocess (`python -m … --workspace/--lock/--escalations/--verdicts`) inside a cmux
   surface. Therefore **core policy must cross as SERIALIZED CONFIG, not a live
   callable.** The safety gate (danger ruleset, governance patterns) is data the
   extension consumes; the evaluation runs extension-side. This is *good* for
   agnostic-core: the obligation crosses as contract, not code.

2. **The open question was "who owns the spawn trigger in production" — and the answer is
   the EXTENSION.** Driven by an agnostic core hook, never by core importing/invoking the
   provider. This is the crux of the whole re-scope.

3. **Core's substrate binder is test-runner-only.** `binder.provider_spawn` is hardwired
   to the `execution.*` contract (`import run; run.run_implementation(impl_id,
   test_path)`), strictly out-of-process, config-only, and invoked **only from tests** —
   there is no agnostic production-invocation seam. That is a **core gap**, to be filled
   by an **agnostic hook** (obligation + satisfier), **not** a cmux-specific invocation
   path. The gap is core's to close agnostically; the cmux runtime is the extension's.

4. **The decide brain is cleanly separable** (verified): four pure safety/governance
   gates run first, and only the fall-through `NEEDS_LLM` case calls the provider's
   `claude -p` coach. So the agnostic policy (gate/escalate) and the cmux-specific answer
   picking (LLM) are already decoupled — the policy config can be agnostic; the LLM stays
   extension transport.

## 4. Why "move-and-invoke" / "core-daemon-runner" is REJECTED

The earlier `#1327` framing proposed core resolve the provider's installed adapter and
either (a) invoke it through an extended binder, or (b) run a **core** daemon-runner
module that dynamically imports the provider `FeedDaemon` and injects a core `decide`.
**Both are rejected:**

- **They overfit core to cmux (the "Phoenix").** A core daemon-runner that knows how to
  find, import, and drive the cmux provider's `FeedDaemon`/feed/session bakes
  cmux-shaped runtime assumptions into core. The next transport (tmux/zellij, another
  agent) would have to fit that core-embedded shape — the opposite of a substrate.
- **They violate agnostic-core.** Core would import/spawn a specific provider's Python
  runtime. Core must depend only on an agnostic obligation; the direction of knowledge is
  extension→obligation, never core→provider.
- **Extending the binder into a generic "call any provider entrypoint" seam** re-creates
  the same coupling one level up and carries the highest blast radius on core substrate
  internals, for a need that is really "core states an obligation; the extension
  self-triggers." The agnostic hook is smaller *and* correct.

The firebreak: **core owns the obligation; the extension owns the runtime and its
trigger.** Runtime never migrates into core, not even as a "runner."

## 5. What this doc changes

- Core tracker `afokapu/atdd#1327` ("Cutover Cmux Runtime Provider Seam") keeps its
  *goal* (core stops carrying cmux runtime) but its **move-and-invoke framing is
  superseded** by this agnostic model. The cut-over is realized by an **agnostic core
  hook + extension-owned trigger**, not by core resolving/invoking the provider.
- The implementation is scoped as a **workspace-extension issue in `afokapu/atdd-extensions`**
  (see the linked issue), building on the ext PR #41 foundation (§2) and the findings
  (§3).
