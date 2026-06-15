"""Run half of the python-pytest provider contract (contract_version 1.0.0).

Execute the discovered implementations inside the materialized workspace instance
with the provider command (``pytest``) and translate results into the ATDD
violation-output contract (``rule_id`` + location). Contract stub — see
``discover.py``.
"""
from __future__ import annotations

CONTRACT_VERSION = "1.0.0"
RUN_COMMAND = ("pytest",)
