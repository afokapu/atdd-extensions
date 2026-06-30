"""Provider-collected report test — SCAFFOLD STUB (#26).

afokapu/atdd-extensions#24 ships this skeleton. The python-pytest provider CLI
collects this module, scans ``ATDD_SCAN_ROOTS`` and writes the RAW v1.1 violation
report to ``ATDD_VIOLATIONS_REPORT``. afokapu/atdd-extensions#26 implements the
real scan + report emission and the clean/dirty fixture assertions.
"""

import pytest


@pytest.mark.skip(reason="scaffold stub (#24); detector + report implemented by #26")
def test_interlocking_coverage_report():
    raise NotImplementedError(
        "afokapu/atdd-extensions#26 implements the interlocking route-coverage "
        "detector, fixtures, and v1.1 report emission."
    )
