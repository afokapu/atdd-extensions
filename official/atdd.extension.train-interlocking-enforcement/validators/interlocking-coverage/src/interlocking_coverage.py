"""Interlocking route-coverage detector — SCAFFOLD STUB (#26).

afokapu/atdd-extensions#24 ships this skeleton; afokapu/atdd-extensions#26
implements the pure decision core.

Obligation (realizes ``tester.interlocking.route-coverage``): every admissible
route in an interlocking's guarded route space (core afokapu/atdd#1248) MUST have
a production / e2e test that exercises it.

The detector is a PURE decision function: the caller supplies the facts (the
route ids parsed from the interlocking YAML, the e2e tests + the routes they
cover) and it returns RAW violations in the ATDD violation-output contract. It
NEVER decides disposition; severity is set by #26's convention node.

Scope selectors it consumes (scopes/interlocking-targets.scope.yaml):
``interlocking_yaml`` + ``e2e_tests``.
"""

RULE_ID = "tester.interlocking.route-coverage"


def detect(*args, **kwargs):
    """Return RAW violations for interlocking routes lacking e2e coverage.

    SCAFFOLD: implemented by afokapu/atdd-extensions#26.
    """
    raise NotImplementedError(
        "tester.interlocking.route-coverage detector is a scaffold stub; "
        "afokapu/atdd-extensions#26 implements it."
    )
