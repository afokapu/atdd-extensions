# Conformance — atdd.workspace.cmux-claude

A **real** pytest run proving the provider's two capability halves satisfy their
contracts. No cmux binary and no Claude API are required: the agent launch
command is **injected** (per the `command_injectable` contract), so the suite
spawns a trivial local subprocess as the agent.

Run it:

```bash
pip install pytest
pytest official/atdd.workspace.cmux-claude/conformance/
```

`test_runtime_contract.py` covers:

## transport.command-feed.v1

- appends are ordered by monotonic sequence; `poll(since=N)` returns only newer
- the feed is **durable** — a fresh handle on the same path sees prior messages
  (survives a restart) and continues the sequence
- polling an empty feed is empty

## orchestration.agent-session.v1

- `open_session` spawns a real subprocess, delivers a prompt to its stdin, and
  collects its output
- a session timeout is **reported** (`SessionResult.timed_out`), never raised
  past the boundary

## two-way channel (integration)

- a feed message is routed into a session and the agent's response is appended
  back onto the same feed — the coach↔worker round-trip, end to end.

A different runtime claiming these contracts (a different agent host, a different
feed backing) proves equivalence by passing an equivalent suite. Conformance
stays **with the provider**.
