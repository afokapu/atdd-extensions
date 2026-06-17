# atdd.workspace.cmux-claude

Official ATDD **workspace provider** for the cmux + Claude agent runtime. It
**orchestrates** agent sessions (spawn / deliver / signal a Claude worker inside
a cmux pane) and **transports** commands and events between the coach and its
workers over a durable feed.

This is a *provider*, not a use-case extension, and it is **not a runner**. It
owns no execution capability and no isolation boundary — those belong to
`atdd.workspace.python-pytest` and `atdd.workspace.git-worktree`. It owns no
conventions, scopes, or GitHub semantics.

## Capabilities

| capability | domain | contract |
|------------|--------|----------|
| `orchestration.agent-session` | `orchestration` | `atdd.workspace.capability.orchestration.agent-session.v1` |
| `transport.command-feed` | `transport` | `atdd.workspace.capability.transport.command-feed.v1` |

### orchestration.agent-session

Manage the lifecycle of an agent session: `open` (spawn the agent process),
`deliver` (a prompt to it), `signal` (interrupt / terminate), `close`. In
production the agent is a Claude worker launched inside a **cmux pane** (one
persistent pane per issue). The launch **command is injectable** (`adapter/
session.py::open_session(command, …)`), so the mechanics are exercisable with any
process — production wires the cmux+claude argv; conformance injects a trivial
local process. The provider owns session *lifecycle*, never the agent's behavior.

### transport.command-feed

A durable, append-only, **ordered** feed carrying commands/events between the
coach and its workers (`adapter/feed.py::CommandFeed`). Backed by JSONL where the
line number **is** the sequence, so readers `poll(since=…)` and the feed
**survives a restart**. This owns the mechanism only — message schemas belong to
the coach/extensions that use the feed.

## Contract

- **id:** `atdd.workspace.cmux-claude` (scope segment `workspace`)
- **contract_version:** `1.0.0` — versions the two capability contracts as a set.

## How it composes

The coach drives the lifecycle inside a `git-worktree` isolation boundary, runs
validators through the `python-pytest` provider, and uses **this** provider to
spawn the worker that does the work and to carry the two-way coach↔worker
channel. Each provider owns one slice of the runtime; none reaches into another.

## Layout

```text
atdd.workspace.cmux-claude/
  atdd.workspace.yaml   # provider manifest (id, contract_version, capabilities)
  adapter/              # session.py + feed.py — the capability mechanics
  conformance/          # REAL suite: subprocess round-trip + durable feed
```
