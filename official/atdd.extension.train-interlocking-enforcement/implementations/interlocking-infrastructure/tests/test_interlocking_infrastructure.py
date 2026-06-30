"""Provider-collected report test — SCAFFOLD STUB (#25).

afokapu/atdd-extensions#24 ships this skeleton. The python-pytest provider CLI
collects this module, scans ``ATDD_SCAN_ROOTS`` and writes the RAW v1.1 violation
report to ``ATDD_VIOLATIONS_REPORT``. afokapu/atdd-extensions#25 implements the
real scan + report emission and the clean/dirty fixture assertions.
"""

import pytest


@pytest.mark.skip(reason="scaffold stub (#24); detector + report implemented by #25")
def test_interlocking_infrastructure_report():
    raise NotImplementedError(
        "afokapu/atdd-extensions#25 implements the InterlockingRunner "
        "infrastructure detector, fixtures, and v1.1 report emission."
    )
