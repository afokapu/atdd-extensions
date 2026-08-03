"""Controlled-language detector for the two planner.controlled-language.* conventions.

PURE detector, stdlib + PyYAML only. Walks the YAML under ``ATDD_SCAN_ROOTS`` (minus
``ATDD_SCAN_EXCLUDES``), extracts every PROSE_KEYS value, and POSTs each string to
``ATDD_STE_URL``; each checker finding becomes one RAW v1.1 violation. Implements no STE rule,
decides no disposition, and FAILS CLOSED. Full design: ../../README.md.
"""
from __future__ import annotations

import fnmatch
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

RULE_STE = "planner.controlled-language.ste-conformance"
RULE_VOCABULARY = "planner.controlled-language.approved-vocabulary"
ALL_RULE_IDS = frozenset({RULE_STE, RULE_VOCABULARY})

CONTRACT_VERSION = "1.1.0"
DEFAULT_STE_URL = "http://127.0.0.1:8081/v2/check"
DEFAULT_TIMEOUT = 15.0
LANGUAGE = "en-US"

ENV_STE_URL = "ATDD_STE_URL"
ENV_SCAN_ROOTS = "ATDD_SCAN_ROOTS"
ENV_SCAN_EXCLUDES = "ATDD_SCAN_EXCLUDES"
ENV_REPORT = "ATDD_VIOLATIONS_REPORT"

# The authored keys whose values are PROSE. Anything else is structure, never checked.
PROSE_KEYS = frozenset({
    "abstract", "action", "context", "context_clarifier", "description", "goal", "message",
    "notes", "outcome", "purpose", "rationale", "statement", "text", "title"})

# The seam between the two rule_ids, keyed on the checker's OWN taxonomy: a finding whose
# rule/category id carries one of these tokens is word choice, everything else is a writing rule.
# The project-terms XML prefixes every rule id ATDD_TERM_ so its findings land here.
VOCABULARY_TOKENS = ("DICT", "VOCAB", "TERM", "UNAPPROVED", "NOT_APPROVED", "RULE_1_")

_STR_TAG = "tag:yaml.org,2002:str"
_YAML_SUFFIXES = (".yaml", ".yml")


class CheckerUnavailable(RuntimeError):
    """The STE checker could not be consulted. Its text becomes the fail-closed evidence."""


def _json_env(name: str, env: dict | None = None) -> list[str]:
    try:
        value = json.loads((env or os.environ).get(name) or "[]")
    except json.JSONDecodeError:
        return []
    return [str(v) for v in value] if isinstance(value, list) else []


def ste_url(env: dict | None = None) -> str:
    return (env or os.environ).get(ENV_STE_URL) or DEFAULT_STE_URL


def scan_roots_from_env(base: Path, env: dict | None = None) -> list[Path]:
    """Resolve ``ATDD_SCAN_ROOTS``; a relative entry resolves against *base* (§2)."""
    return [p if p.is_absolute() else base / p
            for p in (Path(n) for n in _json_env(ENV_SCAN_ROOTS, env))]


def excludes_from_env(env: dict | None = None) -> list[str]:
    return _json_env(ENV_SCAN_EXCLUDES, env)


def _is_str(node) -> bool:
    return isinstance(node, yaml.ScalarNode) and node.tag == _STR_TAG


# A prose key's value: string -> check; list -> each string; mapping -> its strings.
def _collect(node, path: tuple, out: list) -> None:
    if _is_str(node):
        out.append((".".join(path), node))
    elif isinstance(node, yaml.SequenceNode):
        out.extend((".".join(path + (str(i),)), n)
                   for i, n in enumerate(node.value) if _is_str(n))
    elif isinstance(node, yaml.MappingNode):
        out.extend((".".join(path + (str(k.value),)), v) for k, v in node.value
                   if isinstance(k, yaml.ScalarNode) and _is_str(v))


# Walk the whole document, but only a PROSE_KEYS value becomes checkable text.
def _walk(node, path: tuple, out: list) -> None:
    if isinstance(node, yaml.MappingNode):
        for key, value in node.value:
            if isinstance(key, yaml.ScalarNode):
                child = path + (str(key.value),)
                (_collect if key.value in PROSE_KEYS else _walk)(value, child, out)
    elif isinstance(node, yaml.SequenceNode):
        for i, item in enumerate(node.value):
            _walk(item, path + (str(i),), out)


def prose_fields(text: str) -> list:
    """(dotted prose path, scalar node) per prose string. Composed, not loaded, so each string
    keeps its line/column; an artifact that does not parse carries no prose."""
    out: list = []
    try:
        for doc in yaml.compose_all(text):
            if doc is not None:
                _walk(doc, (), out)
    except yaml.YAMLError:
        return []
    return out


def _excluded(rel: str, globs) -> bool:
    return any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch("/" + rel, g) for g in globs)


def yaml_files(root: Path, excludes: list[str] | None = None) -> list[Path]:
    globs = excludes or []
    return [p for p in sorted(Path(root).rglob("*"))
            if p.suffix in _YAML_SUFFIXES and p.is_file()
            and not _excluded(p.relative_to(root).as_posix(), globs)]


def _urlopen(url: str, body: bytes, timeout: float):
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310 - operator-supplied URL


def check_text(text: str, url: str, *, timeout: float = DEFAULT_TIMEOUT, opener=_urlopen) -> list:
    """POST one prose string to the checker and return its matches. Fails closed."""
    body = urllib.parse.urlencode({"language": LANGUAGE, "text": text}).encode("utf-8")
    try:
        with opener(url, body, timeout) as response:
            status = getattr(response, "status", None) or response.getcode()
            payload = response.read()
    except urllib.error.HTTPError as exc:
        raise CheckerUnavailable(f"checker answered HTTP {exc.code} at {url}") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise CheckerUnavailable(f"checker unreachable at {url}: {exc}") from exc
    if not 200 <= int(status) < 300:
        raise CheckerUnavailable(f"checker answered HTTP {status} at {url}")
    try:
        data = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CheckerUnavailable(f"checker answered unparseable JSON at {url}: {exc}") from exc
    if not isinstance(data, dict):
        raise CheckerUnavailable(f"checker answer is not a JSON object at {url}")
    # A truncated answer is a PARTIAL answer, and accepting it silently would under-report — the
    # fail-open this rule exists to prevent. The live round trip surfaced this field; the server
    # sets it when it stops early. Treat it as the checker being unable to answer.
    if (data.get("warnings") or {}).get("incompleteResults"):
        raise CheckerUnavailable(f"checker reported incompleteResults (truncated answer) at {url}")
    matches = data.get("matches")
    if not isinstance(matches, list):
        raise CheckerUnavailable(f"checker answer carries no 'matches' list at {url}")
    return [m for m in matches if isinstance(m, dict)]


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def rule_for(match: dict) -> str:
    """Route one checker finding to the rule that owns it (word choice vs. writing rule)."""
    rule = _dict(match.get("rule"))
    taxonomy = f"{rule.get('id', '')} {_dict(rule.get('category')).get('id', '')}".upper()
    return RULE_VOCABULARY if any(t in taxonomy for t in VOCABULARY_TOKENS) else RULE_STE


def evidence_for(match: dict) -> str:
    """The checker's own finding, verbatim and machine-readable."""
    replacements = [r["value"] for r in (match.get("replacements") or [])[:5]
                    if isinstance(r, dict) and r.get("value")]
    return (f"offset={match.get('offset', 0)} length={match.get('length', 0)} "
            f"lt_rule={_dict(match.get('rule')).get('id') or 'UNKNOWN'} "
            f"msg={json.dumps(str(match.get('message', '')))} "
            f"replacements={json.dumps(replacements)}")


def _violation(rule_id: str, rel: str, dotted: str, node, lines: list, evidence: str) -> dict:
    """``location`` is `<file>:<dotted prose path>`; the decomposed file/line/col/source_line
    keys are what run.py::_read_report requires, so one record satisfies both readers."""
    line = node.start_mark.line + 1
    return {
        "rule_id": rule_id, "location": f"{rel}:{dotted}", "evidence": evidence,
        "file": rel, "line": line, "col": node.start_mark.column,
        "source_line": lines[line - 1].strip() if 0 < line <= len(lines) else "",
    }


def scan_root(root: Path, *, url: str, excludes=None, timeout=DEFAULT_TIMEOUT, opener=_urlopen):
    """Scan one root and return RAW violations. Stops at the first checker failure, after
    appending the fail-closed violation: one unavailable checker is one defect, not one per
    field, and the findings gathered before it are still facts."""
    root = Path(root)
    violations: list[dict] = []
    for path in yaml_files(root, excludes):
        rel = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        lines = text.splitlines()
        for dotted, node in prose_fields(text):
            if not node.value.strip():
                continue
            try:
                matches = check_text(node.value, url, timeout=timeout, opener=opener)
            except CheckerUnavailable as exc:
                violations.append(
                    _violation(RULE_STE, rel, dotted, node, lines, f"checker-unavailable: {exc}"))
                return violations
            violations.extend(_violation(rule_for(m), rel, dotted, node, lines, evidence_for(m))
                              for m in matches)
    return violations


def scan_roots(roots, *, url: str, excludes=None, timeout=DEFAULT_TIMEOUT, opener=_urlopen):
    return [v for r in roots for v in
            scan_root(Path(r), url=url, excludes=excludes, timeout=timeout, opener=opener)]


def write_report(report_path, roots, violations: list) -> None:
    """Write the PROVIDER-CONTRACT-v1.1 §3.1 report the provider's run.py reads back."""
    payload = {"contract_version": CONTRACT_VERSION,
               "scan_roots": [str(r) for r in roots], "violations": violations}
    Path(report_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
