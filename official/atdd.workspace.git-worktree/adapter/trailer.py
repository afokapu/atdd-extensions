"""Commit-trailer half of the git-worktree provider contract (contract_version 1.0.0).

The ``source_control.commit-trailers`` capability owns the MECHANISM for adding
machine-readable trailers to commit messages — idempotent insertion into the
message footer via ``git interpret-trailers``. It owns no trailer SCHEMA: which
trailers are required is policy owned by the consuming extension. Contract stub
— see ``isolate.py``.
"""
from __future__ import annotations

CONTRACT_VERSION = "1.0.0"
VCS = "git"

# Canonical trailer insertion. ``--if-exists addIfDifferent`` keeps the operation
# idempotent: re-applying the same key/value never duplicates a trailer.
APPLY_TEMPLATE = (
    "git", "interpret-trailers", "--if-exists", "addIfDifferent",
    "--trailer", "<key>: <value>",
)

# Trailers occupy the final paragraph (footer) of the commit message.
PLACEMENT = "message-footer"
IDEMPOTENT = True
