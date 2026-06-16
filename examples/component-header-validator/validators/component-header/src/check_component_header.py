# Component: component:component-header-validator:validate-source-surface:check:backend:application
"""Validator implementation for `coder.source.component-header-required`.

Runs inside the `atdd.workspace.python-pytest` provider (contract_version 1.0.0).
Emits a violation carrying the rule_id when a source file omits its component
header. This is an example stub — the real check + tests land with the extension.
"""
from __future__ import annotations

RULE_ID = "coder.source.component-header-required"
HEADER_PREFIX = "# Component: component:"


def has_component_header(first_line: str) -> bool:
    """A source file satisfies the rule when its first line is a component header."""
    return first_line.startswith(HEADER_PREFIX)
