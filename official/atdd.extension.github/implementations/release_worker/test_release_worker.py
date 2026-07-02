"""Real-behavior tests for the github release worker.

The worker drains core's neutral ``version_decided`` outbox signal into a git tag
+ PyPI publish + tag ``external_ref`` writeback (core #1172 step 5, consumer
half). These tests run everything that *can* run in this extensions repo:

- a **real in-memory sqlite** store mirroring core's exact schema
  (``atdd.state.migrations`` v1+v2: ``objects``/``outbox``/``external_refs``/…)
  with a minimal ``StateStore``-shaped adapter (the API the worker duck-types
  against; at runtime the real ``atdd.state.StateStore`` is injected);
- a **fake publisher** spy so no test ever touches PyPI/network/git.

Two things genuinely cannot run here and are honest ``pytest.skip``s, never faked
green: an end-to-end against the *real* ``atdd.state.StateStore`` (``atdd`` is not
importable in this repo) and a *real* PyPI publish (no-network policy).
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import release_worker as rw  # noqa: E402


# --------------------------------------------------------------------------- #
# Real-sqlite store mirroring core's schema + the StateStore-shaped surface the
# worker duck-types against. Faithful to atdd.state.migrations / atdd.state.store.
# --------------------------------------------------------------------------- #
# Core schema, copied verbatim from atdd.state.migrations._CORE_TABLES_SQL (the
# subset the worker touches). Mirrored, not imported — that IS the separation.
_SCHEMA = """
CREATE TABLE objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    state TEXT, data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE external_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, object_uid TEXT NOT NULL, provider TEXT NOT NULL,
    ref_kind TEXT NOT NULL, ref_value TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, ref_kind, ref_value)
);
CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, operation TEXT NOT NULL,
    payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT
);
"""


class _SyncMessage:
    """Mirror of atdd.state.store.SyncMessage (the fields the worker reads)."""

    def __init__(self, id, provider, payload, status, operation=None):
        self.id, self.provider, self.payload = id, provider, payload
        self.status, self.operation = status, operation


class _ExternalRef:
    def __init__(self, object_uid, provider, ref_kind, ref_value, data):
        self.object_uid, self.provider = object_uid, provider
        self.ref_kind, self.ref_value, self.data = ref_kind, ref_value, data


class _SyncStore:
    def __init__(self, conn):
        self._conn = conn

    def enqueue_outbox(self, provider, operation, payload):
        with self._conn:
            cur = self._conn.execute(
                "INSERT INTO outbox (provider, operation, payload) VALUES (?, ?, ?)",
                (provider, operation, json.dumps(payload, sort_keys=True)),
            )
        return int(cur.lastrowid)

    def pending_outbox(self):
        rows = self._conn.execute(
            "SELECT * FROM outbox WHERE status='pending' ORDER BY id"
        ).fetchall()
        return [_SyncMessage(r["id"], r["provider"], json.loads(r["payload"]),
                             r["status"], r["operation"]) for r in rows]

    def mark_sent(self, outbox_id):
        with self._conn:
            self._conn.execute(
                "UPDATE outbox SET status='sent', sent_at=datetime('now') WHERE id=?",
                (outbox_id,),
            )


class _ExternalRefStore:
    def __init__(self, conn):
        self._conn = conn

    def link(self, object_uid, provider, ref_kind, ref_value, *, data=None):
        with self._conn:
            self._conn.execute(
                """INSERT INTO external_refs (object_uid, provider, ref_kind, ref_value, data)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(provider, ref_kind, ref_value) DO UPDATE SET
                       object_uid=excluded.object_uid, data=excluded.data""",
                (object_uid, provider, ref_kind, ref_value, json.dumps(data or {}, sort_keys=True)),
            )
        return _ExternalRef(object_uid, provider, ref_kind, ref_value, data or {})

    def resolve(self, provider, ref_kind, ref_value):
        row = self._conn.execute(
            "SELECT * FROM external_refs WHERE provider=? AND ref_kind=? AND ref_value=?",
            (provider, ref_kind, ref_value),
        ).fetchone()
        return _ExternalRef(row["object_uid"], row["provider"], row["ref_kind"],
                            row["ref_value"], json.loads(row["data"])) if row else None


class _Store:
    """StateStore-shaped facade (the duck-typed surface the worker drains)."""

    def __init__(self, conn):
        self.conn = conn
        self.sync = _SyncStore(conn)
        self.external_refs = _ExternalRefStore(conn)


@pytest.fixture()
def store():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    # mirror migration v2: seed the singleton release object
    conn.execute("INSERT INTO objects (uid, kind, data) VALUES ('release','release','{}')")
    conn.commit()
    return _Store(conn)


class _SpyPublisher:
    """A publisher that records calls and never touches the network."""

    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def __call__(self, version, tag):
        self.calls.append((version, tag))
        if self.fail:
            raise rw.PublishError(f"simulated publish failure for {tag}")


def _enqueue(store, version, change_class="MINOR", provider="github",
             operation=rw.VERSION_DECIDED_OPERATION):
    return store.sync.enqueue_outbox(provider, operation,
                                     {"version": version, "change_class": change_class})


# --------------------------------------------------------------------------- #
# tag_name / version parsing
# --------------------------------------------------------------------------- #
def test_tag_name_prefixes_v():
    assert rw.tag_name("3.150.0") == "v3.150.0"


def test_tag_name_tolerates_local_suffix():
    # mirrors core's parse: the X.Y.Z core must be valid; suffix is ignored
    assert rw.tag_name("3.150.0+local") == "v3.150.0+local"


@pytest.mark.parametrize("bad", ["3.150", "x.y.z", "", "v3.150.0"])
def test_tag_name_rejects_non_semver(bad):
    with pytest.raises(rw.ReleaseError):
        rw.tag_name(bad)


# --------------------------------------------------------------------------- #
# (A) store-aware drain — the core proofs
# --------------------------------------------------------------------------- #
def test_dry_run_produces_tag_ref_and_marks_drained(store):
    _enqueue(store, "3.150.0", change_class="MINOR")
    pub = _SpyPublisher()

    res = rw.drain_version_decided(store, dry_run=True, publisher=pub)

    assert res.pending == 1 and res.published == 1 and res.failed == 0
    assert res.tags == ["v3.150.0"]
    # dry-run: the side-effect publisher is NOT invoked...
    assert pub.calls == []
    # ...but the inbox external_ref IS written (provider-side identity recorded)
    ref = store.external_refs.resolve("github", "tag", "v3.150.0")
    assert ref is not None and ref.object_uid == "release"
    assert ref.data["version"] == "3.150.0" and ref.data["dry_run"] is True
    # ...and the outbox message is drained (no longer pending)
    assert store.sync.pending_outbox() == []


def test_publish_path_invokes_publisher_and_records_real_ref(store):
    _enqueue(store, "3.150.0")
    pub = _SpyPublisher()

    res = rw.drain_version_decided(store, dry_run=False, publisher=pub)

    assert res.published == 1
    assert pub.calls == [("3.150.0", "v3.150.0")]  # the real side-effect ran (fake)
    ref = store.external_refs.resolve("github", "tag", "v3.150.0")
    assert ref is not None and ref.data["dry_run"] is False
    assert store.sync.pending_outbox() == []


def test_idempotent_redrain_is_a_noop(store):
    _enqueue(store, "3.150.0")
    pub = _SpyPublisher()
    rw.drain_version_decided(store, publisher=pub)
    assert len(pub.calls) == 1

    # re-enqueue the same decided version (e.g. a replay) and drain again
    _enqueue(store, "3.150.0")
    res = rw.drain_version_decided(store, publisher=pub)

    assert res.skipped_idempotent == 1 and res.published == 0
    assert len(pub.calls) == 1  # NO second publish — the tag ref is the marker
    assert store.sync.pending_outbox() == []  # still drained


def test_publish_failure_leaves_message_undrained(store):
    mid = _enqueue(store, "3.150.0")
    pub = _SpyPublisher(fail=True)

    res = rw.drain_version_decided(store, dry_run=False, publisher=pub)

    assert res.failed == 1 and res.published == 0
    assert res.errors and "simulated publish failure" in res.errors[0]
    # fail-loud: no ref recorded, message STILL pending (will retry) — not faked green
    assert store.external_refs.resolve("github", "tag", "v3.150.0") is None
    pending = store.sync.pending_outbox()
    assert [m.id for m in pending] == [mid]


def test_failed_then_recovered_drains_on_retry(store):
    _enqueue(store, "3.150.0")
    failing = _SpyPublisher(fail=True)
    rw.drain_version_decided(store, publisher=failing)
    assert store.sync.pending_outbox()  # still pending after failure

    ok = _SpyPublisher()
    res = rw.drain_version_decided(store, publisher=ok)
    assert res.published == 1
    assert store.external_refs.resolve("github", "tag", "v3.150.0") is not None
    assert store.sync.pending_outbox() == []


def test_only_version_decided_for_this_provider_is_touched(store):
    _enqueue(store, "3.150.0", provider="github")
    _enqueue(store, "9.9.9", provider="gitlab")            # other provider
    _enqueue(store, "1.0.0", operation="promote_trace")    # other operation
    pub = _SpyPublisher()

    res = rw.drain_version_decided(store, provider="github", publisher=pub)

    assert res.pending == 1 and res.tags == ["v3.150.0"]
    # the foreign messages remain pending, untouched
    remaining = {(m.provider, m.operation) for m in store.sync.pending_outbox()}
    assert remaining == {("gitlab", rw.VERSION_DECIDED_OPERATION),
                         ("github", "promote_trace")}


def test_non_semver_version_fails_loud_without_draining(store):
    mid = _enqueue(store, "not-a-version")
    pub = _SpyPublisher()

    res = rw.drain_version_decided(store, publisher=pub)

    assert res.failed == 1 and res.published == 0 and pub.calls == []
    assert [m.id for m in store.sync.pending_outbox()] == [mid]


# --------------------------------------------------------------------------- #
# (B) SyncProvider structural conformance to core's seam
# --------------------------------------------------------------------------- #
def test_provider_push_returns_recordable_outcome():
    pub = _SpyPublisher()
    prov = rw.GithubReleaseProvider(publisher=pub, tag_exists=lambda tag: False)
    out = prov.push(rw.VERSION_DECIDED_OPERATION, {"version": "3.150.0", "change_class": "MINOR"})
    assert out is not None and out.records_ref
    assert (out.object_uid, out.ref_kind, out.ref_value) == ("release", "tag", "v3.150.0")
    assert pub.calls == [("3.150.0", "v3.150.0")]


def test_provider_ignores_foreign_operations():
    prov = rw.GithubReleaseProvider(publisher=_SpyPublisher(), tag_exists=lambda t: False)
    assert prov.push("promote_trace", {"trace": {}}) is None


def test_provider_push_idempotent_when_tag_exists():
    pub = _SpyPublisher()
    prov = rw.GithubReleaseProvider(publisher=pub, tag_exists=lambda tag: True)
    out = prov.push(rw.VERSION_DECIDED_OPERATION, {"version": "3.150.0"})
    assert out.records_ref and out.ref_data.get("idempotent") is True
    assert pub.calls == []  # tag already exists → no publish


def test_provider_push_raises_on_publish_failure():
    prov = rw.GithubReleaseProvider(publisher=_SpyPublisher(fail=True), tag_exists=lambda t: False)
    with pytest.raises(rw.PublishError):
        prov.push(rw.VERSION_DECIDED_OPERATION, {"version": "3.150.0"})


def _mirror_push_outbox(store, providers):
    """Faithful in-test mirror of atdd.state.sync_engine.push_outbox (which cannot
    be imported here). Proves GithubReleaseProvider's PushOutcome slots into core's
    engine shape: dispatch by provider, record the ref, mark sent; a raised
    exception leaves the message pending. (The real engine is exercised only when
    atdd is installed — see the skipped E2E test below.)"""
    pushed = failed = 0
    for msg in store.sync.pending_outbox():
        provider = providers.get(msg.provider)
        if provider is None:
            continue
        try:
            outcome = provider.push(msg.operation, msg.payload)
        except Exception:  # noqa: BLE001 — per-message isolation, mirrors core
            failed += 1
            continue
        if outcome is not None and outcome.records_ref:
            store.external_refs.link(outcome.object_uid, msg.provider,
                                     outcome.ref_kind, outcome.ref_value, data=outcome.ref_data)
        store.sync.mark_sent(msg.id)
        pushed += 1
    return pushed, failed


def test_provider_composes_with_core_push_outbox_shape(store):
    _enqueue(store, "3.150.0")
    pub = _SpyPublisher()
    prov = rw.GithubReleaseProvider(publisher=pub, tag_exists=lambda tag: False)

    pushed, failed = _mirror_push_outbox(store, {"github": prov})

    assert (pushed, failed) == (1, 0)
    assert store.external_refs.resolve("github", "tag", "v3.150.0") is not None
    assert store.sync.pending_outbox() == []


# --------------------------------------------------------------------------- #
# Real side-effect gate (no network) — proves the double-gate refuses by default
# --------------------------------------------------------------------------- #
def test_real_publish_refuses_without_env_guard():
    with pytest.raises(rw.PublishError) as exc:
        rw.real_publish("3.150.0", "v3.150.0", env={})  # guard absent
    assert rw.PUBLISH_ENV_GUARD in str(exc.value)


# --------------------------------------------------------------------------- #
# real_publish — driven with an INJECTED runner so no real process/network/git
# is ever spawned (the double-gate stays honest). These prove the hardening the
# CI incident (run 28564058581) demanded: a diagnosable, idempotent, tag-pushing
# publish.
# --------------------------------------------------------------------------- #
class _FakeProc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout, self.stderr, self.returncode = stdout, stderr, returncode


def _classify(cmd):
    """Bucket a command so the fake runner can key canned responses off it."""
    if "build" in cmd:
        return "build"
    if "upload" in cmd:
        return "upload"
    if "tag" in cmd and "--list" in cmd:
        return "taglist"
    if cmd[:2] == ["git", "tag"]:
        return "tag"
    if cmd[:2] == ["git", "push"]:
        return "push"
    return "other"


class _RecordingRunner:
    """A subprocess.run stand-in: records commands, returns canned procs, and can
    raise a CalledProcessError on a chosen command class — never spawns a real
    process, so the no-network / no-git honesty is preserved."""

    def __init__(self, raise_on=None, cpe=None, procs=None):
        self.commands = []
        self._raise_on = raise_on
        self._cpe = cpe
        self._procs = procs or {}

    def __call__(self, cmd, **kwargs):
        self.commands.append(list(cmd))
        tok = _classify(cmd)
        if self._raise_on == tok:
            raise self._cpe
        return self._procs.get(tok, _FakeProc())

    def classes(self):
        return [_classify(c) for c in self.commands]


_ARMED = {rw.PUBLISH_ENV_GUARD: "1"}  # arms the gate; runner is still fake


# --- Fix #1: surface BOTH stdout and stderr ------------------------------- #
def test_format_publish_error_combines_both_streams():
    cpe = subprocess.CalledProcessError(2, ["c"], output="out-msg", stderr="err-msg")
    m = rw._format_publish_error("v1.2.3", cpe)
    assert "out-msg" in m and "err-msg" in m and "exited 2" in m


def test_format_publish_error_handles_empty_output():
    cpe = subprocess.CalledProcessError(1, ["c"], output="", stderr="")
    m = rw._format_publish_error("v1.2.3", cpe)
    assert "no output" in m.lower()  # never a bare, silent "exited N: "


def test_publish_error_surfaces_stdout_the_incident_hid():
    # twine prints "File already exists" / 403 to STDOUT; the failed CI run
    # surfaced only stderr → an EMPTY error nobody could diagnose.
    cpe = subprocess.CalledProcessError(
        returncode=1, cmd=["python", "-m", "twine", "upload", "dist/*"],
        output="ERROR: HTTPError: 403 Forbidden / File already exists", stderr="")
    runner = _RecordingRunner(raise_on="upload", cpe=cpe)
    with pytest.raises(rw.PublishError) as ei:
        rw.real_publish("3.152.0", "v3.152.0", env=_ARMED, runner=runner)
    msg = str(ei.value)
    assert "File already exists" in msg and "403" in msg
    assert "exited 1" in msg


# --- Fix #2: --skip-existing + skipped_idempotent ------------------------- #
def test_upload_command_uses_skip_existing():
    runner = _RecordingRunner()
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    upload = [c for c in runner.commands if "upload" in c][0]
    assert "--skip-existing" in upload  # never hard-fails on an existing version


@pytest.mark.parametrize("stdout,stderr,expected", [
    ("Skipping v3.150.0 because it appears to already exist", "", True),
    ("Uploading dist/atdd-3.150.0-py3-none-any.whl\nView at ...", "", False),
    ("", "some file already exists on the index", True),
])
def test_twine_skipped_detection(stdout, stderr, expected):
    assert rw._twine_skipped(stdout, stderr) is expected


def test_real_publish_reports_skipped_when_twine_skips():
    runner = _RecordingRunner(procs={
        "upload": _FakeProc(stdout="Skipping v3.152.0 because it already exists")})
    assert rw.real_publish("3.152.0", "v3.152.0", env=_ARMED,
                           runner=runner) == rw.SKIPPED_EXISTING


def test_real_publish_reports_published_on_fresh_upload():
    runner = _RecordingRunner(procs={
        "upload": _FakeProc(stdout="Uploading atdd-3.153.0.tar.gz")})
    assert rw.real_publish("3.153.0", "v3.153.0", env=_ARMED,
                           runner=runner) == rw.PUBLISHED


def test_drain_maps_skipped_existing_to_skipped_idempotent(store):
    # A version published out-of-band (manually, like 3.152.0 in the incident):
    # the store has NO external_ref, but PyPI already has it. --skip-existing
    # makes twine SUCCEED-by-skipping; the drain must count it skipped_idempotent,
    # NOT published and NOT failed, while still recording the ref + draining.
    mid = _enqueue(store, "3.152.0")

    def skipping_publisher(version, tag):
        return rw.SKIPPED_EXISTING

    res = rw.drain_version_decided(store, dry_run=False, publisher=skipping_publisher)

    assert res.skipped_idempotent == 1 and res.published == 0 and res.failed == 0
    assert res.tags == ["v3.152.0"]
    assert store.external_refs.resolve("github", "tag", "v3.152.0") is not None
    assert store.sync.pending_outbox() == []  # drained, not left pending
    _ = mid


# --- Fix #3: build BOTH sdist and wheel; upload glob covers both ---------- #
def test_build_produces_both_sdist_and_wheel():
    # `python -m build` with NO --wheel/--sdist flag emits BOTH; regression lock
    # against the wheel-only builds that #1310 had to graft an sdist shim for.
    runner = _RecordingRunner()
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    build = [c for c in runner.commands if "build" in c][0]
    assert build == ["python", "-m", "build"]  # no --wheel → sdist + wheel


def test_upload_glob_covers_sdist_and_wheel():
    runner = _RecordingRunner()
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    upload = [c for c in runner.commands if "upload" in c][0]
    assert "dist/*" in upload  # not dist/*.whl — the sdist ships too


def test_provider_push_marks_idempotent_when_publisher_skips():
    def skipping_publisher(version, tag):
        return rw.SKIPPED_EXISTING

    prov = rw.GithubReleaseProvider(publisher=skipping_publisher,
                                    tag_exists=lambda t: False)
    out = prov.push(rw.VERSION_DECIDED_OPERATION, {"version": "3.152.0"})
    assert out.records_ref and out.ref_data.get("idempotent") is True


# --- Fix #4: the annotated tag is actually PUSHED (was created but orphaned) - #
def test_real_publish_pushes_the_tag():
    runner = _RecordingRunner()
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    pushes = [c for c in runner.commands if c[:2] == ["git", "push"]]
    assert pushes == [["git", "push", "origin", "v3.150.0"]]


def test_real_publish_pushes_to_configured_remote():
    runner = _RecordingRunner()
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, remote="upstream", runner=runner)
    assert ["git", "push", "upstream", "v3.150.0"] in runner.commands


def test_real_publish_reuses_existing_local_tag_and_still_pushes():
    # Retry after a prior failed run left the local tag behind: creating it again
    # would 'already exists'-crash and mask the real error. Skip create, push.
    runner = _RecordingRunner(procs={"taglist": _FakeProc(stdout="v3.150.0\n")})
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    creates = [c for c in runner.commands if c[:2] == ["git", "tag"] and "-a" in c]
    pushes = [c for c in runner.commands if c[:2] == ["git", "push"]]
    assert creates == []                       # not re-created (idempotent)
    assert pushes == [["git", "push", "origin", "v3.150.0"]]  # still pushed


def test_real_publish_creates_tag_when_absent():
    runner = _RecordingRunner()  # taglist returns empty → tag absent
    rw.real_publish("3.150.0", "v3.150.0", env=_ARMED, runner=runner)
    creates = [c for c in runner.commands if c[:2] == ["git", "tag"] and "-a" in c]
    assert creates == [["git", "tag", "-a", "v3.150.0", "-m", "Release v3.150.0"]]


# --------------------------------------------------------------------------- #
# Honest skips — what genuinely cannot run in this repo (never faked green)
# --------------------------------------------------------------------------- #
def test_e2e_against_real_atdd_state_store():
    pytest.importorskip(
        "atdd.state",
        reason="atdd is not importable in the extensions repo (core/extension "
               "separation); E2E against the real StateStore + version.bump runs "
               "only where atdd is installed.",
    )
    # If atdd ever becomes importable here, wire: bump() -> drain_version_decided
    # against the real StateStore and assert the tag external_ref lands.
    pytest.skip("atdd importable but real E2E wiring intentionally deferred to core-side CI")


@pytest.mark.skip(reason="real PyPI publish hits the network (twine upload) and is "
                         "forbidden in tests; gated behind ATDD_RELEASE_ALLOW_PUBLISH=1 "
                         "for operator-driven release runs only.")
def test_real_pypi_publish():
    ...
