"""GitHub release worker — drains core's neutral ``version_decided`` signal.

Realizes ``github.release.version-decided-drains-to-tag-and-publish`` — the
consumer half of core #1172 step 5.

Core (the ``atdd`` repo) decides the *number* and stops there: on a bump it
enqueues a **provider-neutral** ``version_decided`` outbox message carrying only
``{version, change_class}`` (see ``atdd.state.version.bump``). Core writes **no**
git tag and **no** ``external_ref`` — by design (version-source-of-truth-design
§2: "the git-tag external_ref + publish action live entirely in the extension").

THIS module is that extension. It drains the signal, creates an annotated git
tag ``vX.Y.Z``, publishes to PyPI (the side-effect), and writes the tag back as
an ``external_ref`` (``provider=github, ref_kind=tag, ref_value=vX.Y.Z``) so the
local store learns the provider-side identity of the release core decided.

Separation discipline (the 4.0.0 full core/extension split). This module
**never imports** ``atdd``:

- It drains against a *duck-typed* store exposing core's already-shipped sync
  API — ``store.sync.pending_outbox()/mark_sent()`` and
  ``store.external_refs.resolve()/link()`` (see ``atdd.state.store``). At runtime
  the real ``atdd.state.StateStore`` is injected; tests inject a real in-memory
  sqlite mirror of core's schema.
- :class:`GithubReleaseProvider` conforms *structurally* to core's
  ``atdd.state.sync_engine.SyncProvider`` Protocol
  (``name`` + ``push(operation, payload) -> PushOutcome``), so the side-effect
  also composes with core's own ``push_outbox()`` engine — proven by shape, with
  zero import coupling.

Honesty: the real PyPI publish is the *only* genuinely external effect. It is
double-gated — a ``dry_run`` / ``--no-publish`` flag **and** the
``ATDD_RELEASE_ALLOW_PUBLISH`` env guard — so a test (or an accidental run) can
never reach real PyPI. Tests inject a fake publisher; the real one is exercised
only when an operator explicitly opts in.
"""
from __future__ import annotations

import logging
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

_log = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Contract constants — MUST mirror core (atdd.state.version / atdd.state.store).
# Duplicated by value (not imported) to keep the extension import-decoupled from
# core; the conformance tests pin these against core's published names.
# --------------------------------------------------------------------------- #
#: core's ``VERSION_DECIDED_OPERATION`` — the neutral decision signal we drain.
VERSION_DECIDED_OPERATION = "version_decided"
#: core's ``DEFAULT_PROVIDER`` — the outbox routing key this worker claims.
DEFAULT_PROVIDER = "github"
#: the singleton ``release`` object core seeds (migration v2); the tag ref hangs
#: off it.
RELEASE_OBJECT_UID = "release"
#: ``external_ref.ref_kind`` for the published git tag.
TAG_REF_KIND = "tag"
#: env guard for the real publish side-effect; must equal ``"1"`` to arm it.
PUBLISH_ENV_GUARD = "ATDD_RELEASE_ALLOW_PUBLISH"
#: publisher outcomes — a fresh upload vs. an idempotent skip of a version that
#: already exists on the index (``twine upload --skip-existing`` succeeds either
#: way; the drain accounting needs to tell them apart).
PUBLISHED = "published"
SKIPPED_EXISTING = "skipped_existing"


class ReleaseError(Exception):
    """Base for release-worker failures."""


class PublishError(ReleaseError):
    """The publish/tag side-effect failed. Raising this leaves the outbox message
    **pending** (undrained) so the next drain retries — never a silent green."""


# --------------------------------------------------------------------------- #
# Outcome — structurally identical to atdd.state.sync_engine.PushOutcome so core's
# push_outbox() can consume what GithubReleaseProvider.push() returns.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class PushOutcome:
    """An external ref for the drain engine to record (mirror of core's type)."""

    object_uid: Optional[str] = None
    ref_kind: Optional[str] = None
    ref_value: Optional[str] = None
    ref_data: Dict[str, Any] = field(default_factory=dict)

    @property
    def records_ref(self) -> bool:
        return bool(self.object_uid and self.ref_kind and self.ref_value)


# A publisher takes (version, tag) and performs the ecosystem publish, raising
# PublishError on failure. It returns ``SKIPPED_EXISTING`` when the version was
# already on the index (idempotent skip), ``PUBLISHED`` (or ``None``, treated as
# published) otherwise. Injectable so tests never touch PyPI/network.
Publisher = Callable[[str, str], Optional[str]]
#: A tag-existence probe (the idempotency oracle for the store-less provider).
TagExists = Callable[[str], bool]


# --------------------------------------------------------------------------- #
# Tag naming / version validation (mirrors core's semver-core parse)
# --------------------------------------------------------------------------- #
def parse_semver(version: str) -> Tuple[int, int, int]:
    """Parse the ``X.Y.Z`` core of a version, ignoring a PEP 440 local/pre suffix.

    Mirrors ``atdd.state.version.parse`` so the tag we cut matches the number
    core decided. Raises :class:`ReleaseError` on a non-semver value.
    """
    core = version.strip().split("+", 1)[0].split("-", 1)[0]
    parts = core.split(".")
    if len(parts) < 3:
        raise ReleaseError(f"not a semver version: {version!r}")
    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError as exc:
        raise ReleaseError(f"not a semver version: {version!r}") from exc


def tag_name(version: str) -> str:
    """The annotated-tag name ``vX.Y.Z`` for a decided version (validates semver)."""
    parse_semver(version)  # raises on a malformed version
    return f"v{version.strip()}"


# --------------------------------------------------------------------------- #
# Real side-effects — gated; NEVER run in tests.
# --------------------------------------------------------------------------- #
def git_tag_exists(tag: str, *, cwd: Optional[str] = None) -> bool:
    """True if an annotated/lightweight tag ``tag`` already exists in the repo."""
    proc = subprocess.run(
        ["git", "tag", "--list", tag],
        cwd=cwd, capture_output=True, text=True, check=False,
    )
    return tag in proc.stdout.split()


#: substrings twine emits when ``--skip-existing`` skips an already-present file
#: (both the modern "skipping ... already exist" and older phrasings).
_TWINE_SKIP_MARKERS = ("skipping", "already exist")


def _twine_skipped(stdout: str, stderr: str) -> bool:
    """True if twine's output shows it SKIPPED an already-present version.

    ``twine upload --skip-existing`` exits 0 whether it uploaded or skipped, so
    the only signal that a version was already on the index is in its output.
    """
    blob = f"{stdout or ''}\n{stderr or ''}".lower()
    return any(marker in blob for marker in _TWINE_SKIP_MARKERS)


def _format_publish_error(tag: str, exc: subprocess.CalledProcessError) -> str:
    """Compose a *diagnosable* PublishError message from a failed subprocess.

    The CI incident (run 28564058581) surfaced only ``exc.stderr`` — but twine
    prints its 403 / "File already exists" to **stdout**, so the recorded error
    was an empty ``exited N: ``. We include BOTH streams (and a non-empty
    fallback) so the next failure can always be told apart.
    """
    parts = [s for s in ((exc.stdout or "").strip(), (exc.stderr or "").strip()) if s]
    detail = " | ".join(parts) if parts else "(no output captured)"
    return f"publish of {tag} failed: {exc.cmd} exited {exc.returncode}: {detail}"


def _local_tag_exists(runner: Callable, tag: str, cwd: Optional[str]) -> bool:
    """True if ``tag`` already exists locally (via the injected ``runner``).

    Uses the same runner as :func:`real_publish` so retry-safety is testable
    without spawning git; parallels the store-less :func:`git_tag_exists`.
    """
    proc = runner(["git", "tag", "--list", tag],
                  cwd=cwd, capture_output=True, text=True, check=False)
    return tag in (getattr(proc, "stdout", "") or "").split()


def _github_release_exists(runner: Callable, tag: str, cwd: Optional[str]) -> bool:
    """True if a GitHub Release already exists for ``tag`` (idempotency oracle).

    ``gh release view`` exits 0 when the release exists and non-zero otherwise,
    so the returncode alone answers the question without parsing output.
    """
    proc = runner(["gh", "release", "view", tag],
                  cwd=cwd, capture_output=True, text=True, check=False)
    return getattr(proc, "returncode", 1) == 0


def _ensure_github_release(runner: Callable, tag: str, cwd: Optional[str]) -> None:
    """Create the GitHub Release for ``tag`` if it does not exist yet.

    The git tag + PyPI upload make a version *installable*; the GitHub Release is
    the human-facing announcement — the "Latest" version surfaced on the repo's
    Releases page. The original flow tagged + published but never created the
    Release object, so GitHub's Releases page froze at the last version cut by the
    retired pre-4.0 pipeline while tags/PyPI marched on (the 3.150.0-vs-4.x drift).

    Idempotent by the same discipline as the tag/upload above: skip when the
    Release already exists (so a retry after a mid-flight failure re-enters here
    cleanly), and let a genuine ``gh`` failure raise ``CalledProcessError`` — the
    caller converts it to :class:`PublishError`, leaving the outbox message
    pending for the next drain. ``--verify-tag`` asserts the just-pushed tag is
    visible server-side; ``--generate-notes`` fills the body from the PRs merged
    since the previous release. Auth is the ``GH_TOKEN``/``GITHUB_TOKEN`` in the
    inherited process env (same channel twine's creds use).
    """
    if _github_release_exists(runner, tag, cwd):
        _log.info("github release already exists; idempotent skip",
                  extra={"tag": tag})
        return
    runner(
        ["gh", "release", "create", tag, "--verify-tag",
         "--generate-notes", "--title", tag],
        cwd=cwd, check=True, capture_output=True, text=True,
    )


def real_publish(version: str, tag: str, *, env: Optional[Dict[str, str]] = None,
                 cwd: Optional[str] = None, remote: str = "origin",
                 runner: Callable = subprocess.run) -> str:
    """Create the annotated git tag and upload to PyPI. **Double-gated.**

    Refuses to run unless ``ATDD_RELEASE_ALLOW_PUBLISH=1`` — so this can never be
    reached from a test or an un-opted-in invocation. Ordering: publish to PyPI
    *before* the caller records the ``external_ref`` (the ref is the durable
    completion marker), so a failed upload leaves nothing recorded and the next
    drain retries cleanly.

    Idempotent by construction: ``twine upload --skip-existing`` succeeds (rather
    than 403-ing) when the version is already on the index, and returns
    :data:`SKIPPED_EXISTING` so the caller can account for it as an idempotent
    skip instead of a fresh publish. The annotated tag is created only if absent
    (a leftover local tag from a prior failed run would otherwise crash a re-run)
    and is **pushed** to ``remote`` — the original flow created the tag but never
    pushed it, so the provider-side ref never became visible. Ordering mirrors
    core's ``publish.yml``: tag → push → build → upload → github-release. The
    trailing GitHub Release (:func:`_ensure_github_release`) is the human-facing
    announcement that keeps the repo's Releases page in step with tags/PyPI; it is
    idempotent (skipped when already present) so it never breaks a retry.

    ``runner`` (default :func:`subprocess.run`) is injectable so the command
    orchestration and its error surfacing can be exercised without spawning a
    real process/network/git — the double-gate stays honest either way.
    """
    env = os.environ if env is None else env
    if env.get(PUBLISH_ENV_GUARD) != "1":
        raise PublishError(
            f"real publish disabled; set {PUBLISH_ENV_GUARD}=1 to arm the side-effect "
            f"(refusing to tag/publish {tag} without an explicit opt-in)"
        )
    try:
        if not _local_tag_exists(runner, tag, cwd):
            runner(
                ["git", "tag", "-a", tag, "-m", f"Release {tag}"],
                cwd=cwd, check=True, capture_output=True, text=True,
            )
        runner(
            ["git", "push", remote, tag],
            cwd=cwd, check=True, capture_output=True, text=True,
        )
        # Build BOTH the sdist and the wheel FROM SOURCE. `python -m build` with
        # NO flags builds the sdist, then builds the wheel FROM the unpacked
        # sdist in a temp dir. Core's dynamic version (#1172) resolves from the
        # git-ignored `.atdd/state/state.sqlite`, which is NOT shipped in the
        # sdist — so the temp-dir wheel build finds no store and falls back to
        # `0.0.0+local`, which PyPI rejects with a 400 (publish run 28587233528).
        # `--sdist --wheel` builds each artifact in-tree at `cwd`, where the
        # store resolves, so the wheel carries the real version_decided value.
        runner(
            ["python", "-m", "build", "--sdist", "--wheel"],
            cwd=cwd, check=True, capture_output=True, text=True,
        )
        upload = runner(
            ["python", "-m", "twine", "upload", "--skip-existing", "dist/*"],
            cwd=cwd, check=True, capture_output=True, text=True,
        )
        # Announce the GitHub Release from the just-pushed tag. Idempotent, and
        # last in the chain: the release is only cut once the artifact is actually
        # on PyPI, so the Releases page never advertises a version that failed to
        # publish.
        _ensure_github_release(runner, tag, cwd)
    except subprocess.CalledProcessError as exc:
        raise PublishError(_format_publish_error(tag, exc)) from exc

    if _twine_skipped(getattr(upload, "stdout", "") or "",
                      getattr(upload, "stderr", "") or ""):
        return SKIPPED_EXISTING
    return PUBLISHED


def _default_publisher(env: Optional[Dict[str, str]] = None,
                       cwd: Optional[str] = None) -> Publisher:
    return lambda version, tag: real_publish(version, tag, env=env, cwd=cwd)


# --------------------------------------------------------------------------- #
# (A) Store-aware drain — the primary standalone entry.
# --------------------------------------------------------------------------- #
@dataclass
class DrainResult:
    pending: int = 0          # version_decided messages for this provider seen
    published: int = 0        # newly tagged+published (or dry-run recorded)
    skipped_idempotent: int = 0   # already had the tag ref → no side-effect
    failed: int = 0           # publish raised → left undrained
    drained_ids: List[int] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def drain_version_decided(
    store: Any,
    *,
    provider: str = DEFAULT_PROVIDER,
    dry_run: bool = False,
    publisher: Optional[Publisher] = None,
    env: Optional[Dict[str, str]] = None,
    cwd: Optional[str] = None,
) -> DrainResult:
    """Drain pending ``version_decided`` outbox messages → tag + publish + ref.

    Store-aware idempotency: the ``external_ref`` (provider, ``tag``, ``vX.Y.Z``)
    is the durable completion marker, written **only after** a successful publish.
    So:

    - ref already present → no side-effect, just mark drained (re-drain no-op);
    - publish raises :class:`PublishError` → message left **pending**, logged loud,
      counted as ``failed`` (never marked drained / never a fake green);
    - otherwise → publish, ``external_refs.link(...)``, ``sync.mark_sent(id)``.

    Only messages whose ``operation == version_decided`` **and**
    ``provider == provider`` are touched; anything else is left for its own worker.
    """
    publisher = publisher or _default_publisher(env=env, cwd=cwd)
    result = DrainResult()

    for msg in store.sync.pending_outbox():
        if msg.operation != VERSION_DECIDED_OPERATION or msg.provider != provider:
            continue
        result.pending += 1
        version = msg.payload.get("version")
        if not version:
            result.failed += 1
            result.errors.append(f"outbox#{msg.id}: version_decided with no version")
            _log.error("version_decided message carries no version",
                       extra={"outbox_id": msg.id})
            continue
        try:
            tag = tag_name(version)
        except ReleaseError as exc:
            result.failed += 1
            result.errors.append(f"outbox#{msg.id}: {exc}")
            _log.error("version_decided carries a non-semver version",
                       extra={"outbox_id": msg.id, "error": str(exc)})
            continue

        existing = store.external_refs.resolve(provider, TAG_REF_KIND, tag)
        if existing is not None:
            # Idempotent: a prior drain already published + recorded this tag.
            store.sync.mark_sent(msg.id)
            result.skipped_idempotent += 1
            result.drained_ids.append(msg.id)
            result.tags.append(tag)
            _log.info("version_decided already published; idempotent drain",
                      extra={"outbox_id": msg.id, "tag": tag})
            continue

        status = PUBLISHED
        try:
            if not dry_run:
                # raises PublishError → left pending below; may return
                # SKIPPED_EXISTING when the version was already on the index.
                status = publisher(version, tag) or PUBLISHED
        except PublishError as exc:
            result.failed += 1
            result.errors.append(f"outbox#{msg.id} {tag}: {exc}")
            _log.error("release publish failed; leaving outbox message pending",
                       extra={"outbox_id": msg.id, "tag": tag, "error": str(exc)})
            continue

        skipped = status == SKIPPED_EXISTING
        store.external_refs.link(
            RELEASE_OBJECT_UID, provider, TAG_REF_KIND, tag,
            data={"version": version, "change_class": msg.payload.get("change_class"),
                  "dry_run": dry_run, "idempotent": skipped},
        )
        store.sync.mark_sent(msg.id)
        result.drained_ids.append(msg.id)
        result.tags.append(tag)
        if skipped:
            result.skipped_idempotent += 1
            _log.info("release version already on index; idempotent skip drained",
                      extra={"outbox_id": msg.id, "tag": tag, "dry_run": dry_run})
        else:
            result.published += 1
            _log.info("release published; tag ref recorded and outbox drained",
                      extra={"outbox_id": msg.id, "tag": tag, "dry_run": dry_run})

    return result


# --------------------------------------------------------------------------- #
# (B) SyncProvider wrapper — structural conformance to core's seam.
# --------------------------------------------------------------------------- #
class GithubReleaseProvider:
    """The release side-effect as a core-compatible ``SyncProvider``.

    Conforms *by shape* to ``atdd.state.sync_engine.SyncProvider`` (``name`` +
    ``push(operation, payload) -> Optional[PushOutcome]``), so core's own
    ``push_outbox()`` can drive it without this module importing ``atdd``. The
    Protocol hands ``push`` no store, so idempotency here keys off a tag-existence
    probe (default: ``git tag --list``) rather than the ``external_ref``; the
    store-aware :func:`drain_version_decided` is the richer standalone entry.
    """

    def __init__(
        self,
        *,
        provider: str = DEFAULT_PROVIDER,
        dry_run: bool = False,
        publisher: Optional[Publisher] = None,
        tag_exists: Optional[TagExists] = None,
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None,
    ) -> None:
        self.name = provider
        self.dry_run = dry_run
        self._publisher = publisher or _default_publisher(env=env, cwd=cwd)
        self._tag_exists = tag_exists or (lambda tag: git_tag_exists(tag, cwd=cwd))

    def push(self, operation: str, payload: Dict[str, Any]) -> Optional[PushOutcome]:
        """One ``version_decided`` → tag + publish; returns the tag ref to record.

        Returns ``None`` for any other operation (not ours — core leaves it
        pending). Raises :class:`PublishError` on a publish failure so core's
        engine leaves the message pending (no ``mark_sent``).
        """
        if operation != VERSION_DECIDED_OPERATION:
            return None
        version = payload.get("version")
        if not version:
            raise PublishError("version_decided payload carries no version")
        tag = tag_name(version)
        if self._tag_exists(tag):
            _log.info("tag already exists; idempotent push no-op", extra={"tag": tag})
            return PushOutcome(RELEASE_OBJECT_UID, TAG_REF_KIND, tag, {"idempotent": True})
        status = PUBLISHED
        if not self.dry_run:
            status = self._publisher(version, tag) or PUBLISHED
        return PushOutcome(
            RELEASE_OBJECT_UID, TAG_REF_KIND, tag,
            {"version": version, "change_class": payload.get("change_class"),
             "dry_run": self.dry_run, "idempotent": status == SKIPPED_EXISTING},
        )
