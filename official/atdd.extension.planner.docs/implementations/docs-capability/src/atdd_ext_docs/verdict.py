"""The verdict vocabulary at the documentation capability seam (spec 2 §3).

REUSE THE MEANINGS, DO NOT RE-DECLARE THEM. The four values below are the ones
shipped by #1719 and they carry #1719's meanings exactly:

    PASS              obligation discharged                              permits
    FAIL              declared and demonstrably not discharged, or the
                      capability crashed / timed out / raised            BLOCKS
    NOT_APPLICABLE    genuinely nothing to check                         permits
    COULD_NOT_CHECK   ran to completion but could not answer             BLOCKS

They are plain strings and not an enum ON PURPOSE. Spec 2 §3 forbids importing
``GateVerdict`` from ``atdd.coach.gate`` into the documentation domain AND forbids
defining a second enum (#1772 Decisions 16-18, #1774). A string vocabulary in one
module satisfies both: nothing here can drift from core's meanings, because nothing
here re-implements them.

>>> OPEN SEAM — CROSS-CHECK WITH THE CORE UNIT. If core exposes a shared vocabulary
>>> module, this module must DELEGATE to it rather than keep its own copies. The
>>> wire values must be these four literals either way; that is the part the two
>>> units agree on and the part a drift would break.

THE DISTINCTION THAT MATTERS. ``NOT_APPLICABLE`` and ``COULD_NOT_CHECK`` must never
collapse into one another. *There is no obligation here* and *I could not see
whether the obligation was met* are different facts, and this repository has already
merged them in at least three places: #1745 (a lookup failure reported as a pass),
#1774 ("no mirror found" read as "nothing to lose"), #1716 (checks that pass when
they cannot observe). An unresolvable lookup stays DATA — named, reportable, and
reaching the report — never an empty clean result.
"""
from __future__ import annotations

from typing import Final

PASS: Final = "PASS"
FAIL: Final = "FAIL"
NOT_APPLICABLE: Final = "NOT_APPLICABLE"
COULD_NOT_CHECK: Final = "COULD_NOT_CHECK"

VOCABULARY: Final = (PASS, FAIL, NOT_APPLICABLE, COULD_NOT_CHECK)

#: Verdicts that stop COMPLETE. COULD_NOT_CHECK is in here, and that is the whole point.
BLOCKING: Final = frozenset({FAIL, COULD_NOT_CHECK})

#: Verdicts that let COMPLETE proceed.
PERMITTING: Final = frozenset({PASS, NOT_APPLICABLE})


def blocks(verdict: str) -> bool:
    """True when this verdict stops COMPLETE.

    An unknown verdict blocks. A vocabulary this code does not recognise is exactly
    the "could not answer" case, and guessing that it permits is the #1745 defect.
    """
    return verdict not in PERMITTING
