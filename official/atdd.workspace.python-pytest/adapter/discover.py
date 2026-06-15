"""Discovery half of the python-pytest provider contract (contract_version 1.0.0).

Given a resolved workspace instance, locate the validator implementations an
extension ships (``**/atdd.implementation.yaml``) and return the ones whose
declared ``contract_version`` is compatible with this provider. The resolver
calls this before ``run`` materializes the instance.

This is a contract stub — the executable adapter lands with the provider's
runtime wagon. It is versioned WITH the provider so a contract bump is a single,
reviewable change.
"""
from __future__ import annotations

CONTRACT_VERSION = "1.0.0"
IMPLEMENTATION_GLOB = "**/atdd.implementation.yaml"
