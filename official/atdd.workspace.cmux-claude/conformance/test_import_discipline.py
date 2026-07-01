"""Import-discipline conformance for atdd.workspace.cmux-claude (#16 done-when).

Proves the provider holds the core/provider boundary: the runtime adapter carries
the two-way decision channel over a concrete cmux transport WITHOUT importing core
(``no import atdd.* at runtime``). The cross-repo contract is by FIELD NAME only
(``request_id``, ``kind``, ``tool``, ``tool_input``, ``agent_id``, ``options``,
``ChannelReadiness{live, reason}`` …) — never by a Python import of ``atdd``. This
is the firebreak that lets the core-side runtime (afokapu/atdd
``mediate_worker_decisions/*``) be retired without the provider silently
re-coupling to it (the relocation tracker #16 / ext#29).

A REAL static analysis: every runtime module under ``adapter/`` is AST-parsed and
every ``import``/``from ... import`` target is inspected. Docstrings that merely
NAME core nodes (e.g. ``atdd.coach.decision_channel``) are strings, not imports, so
they are correctly ignored.
"""
from __future__ import annotations

import ast
from pathlib import Path
from typing import List, Tuple

_ADAPTER = Path(__file__).resolve().parent.parent / "adapter"

# The forbidden root: the core toolkit package. A runtime import of this (or any
# submodule) would re-couple the provider to the core tree the boundary severs.
_FORBIDDEN_ROOT = "atdd"


def _runtime_modules() -> List[Path]:
    """Every runtime adapter module (excludes __pycache__ and non-.py files)."""
    return sorted(p for p in _ADAPTER.rglob("*.py") if "__pycache__" not in p.parts)


def _core_imports(module: Path) -> List[Tuple[int, str]]:
    """(lineno, dotted-name) for every import in ``module`` rooted at ``atdd``."""
    tree = ast.parse(module.read_text(encoding="utf-8"), filename=str(module))
    hits: List[Tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _is_forbidden(alias.name):
                    hits.append((node.lineno, alias.name))
        elif isinstance(node, ast.ImportFrom):
            # level>0 is a relative import (never `atdd`); module may be None for `from . import x`
            if node.level == 0 and node.module and _is_forbidden(node.module):
                hits.append((node.lineno, node.module))
    return hits


def _is_forbidden(dotted: str) -> bool:
    """True iff ``dotted`` is the forbidden root or a submodule of it."""
    return dotted == _FORBIDDEN_ROOT or dotted.startswith(_FORBIDDEN_ROOT + ".")


def test_adapter_has_runtime_modules_to_check() -> None:
    # Guard against a silently-empty scan (a moved/renamed adapter dir would make the
    # discipline test vacuously pass).
    modules = _runtime_modules()
    assert modules, f"no runtime adapter modules discovered under {_ADAPTER}"


def test_no_core_imports_in_runtime_adapter() -> None:
    offenders = {
        module.name: hits
        for module in _runtime_modules()
        if (hits := _core_imports(module))
    }
    assert not offenders, (
        "provider runtime must not import core (`atdd.*`) — the boundary is by "
        f"field name only. Offending imports: {offenders}"
    )
