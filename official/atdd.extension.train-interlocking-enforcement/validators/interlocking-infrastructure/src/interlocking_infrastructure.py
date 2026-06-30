"""Interlocking runtime-infrastructure detector — SCAFFOLD STUB (#25).

afokapu/atdd-extensions#24 ships this skeleton; afokapu/atdd-extensions#25
implements the pure decision core.

Obligation (realizes ``coder.interlocking.runner-infrastructure``): when a
consumer interlocking declares guarded routes, the consumer runtime MUST ship an
``InterlockingRunner`` route-control layer that is called by the Station Master
entrypoint and delegates to ``TrainRunner.execute(...)`` (core afokapu/atdd#1251).

The detector is a PURE decision function: the caller supplies the facts (the
discovered interlocking ids, the runtime module symbols, the Station Master call
graph) and it returns RAW violations in the ATDD violation-output contract
(``rule_id`` + ``location`` + ``evidence``). It NEVER decides disposition; the
strict verdict is a downstream consumer concern.

Scope selectors it consumes (scopes/interlocking-targets.scope.yaml):
``python_runtime`` + ``station_master`` + ``interlocking_yaml``.
"""

RULE_ID = "coder.interlocking.runner-infrastructure"


def detect(*args, **kwargs):
    """Return RAW violations for missing/unwired InterlockingRunner infrastructure.

    SCAFFOLD: implemented by afokapu/atdd-extensions#25.
    """
    raise NotImplementedError(
        "coder.interlocking.runner-infrastructure detector is a scaffold stub; "
        "afokapu/atdd-extensions#25 implements it."
    )
