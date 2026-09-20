# Dataset v4 Report

Status: **NOT CREATED — gate refused.** This document records the refusal and
its evidence, per the rule that Dataset v4 appears only after validation.

## Inputs

- Parent: EcoSort Dataset v3 (23,172 verified — frozen registry record).
- Pipeline: `python -m ml.build_v4` (shared `ml/quality_gates.py`, 10 gates).
- Review pool at evaluation: 1 verified candidate, 4 items pending human review.

## Gate (unchanged, not lowered)

- ≥ 200 verified candidates AND ≥ 2 classes (≥ 10 samples each).

## Result

- Considered: 1 · Accepted: 0 · v4 created: **false**.
- The single candidate was auto-rejected: exact md5 duplicate of a v3 file.
- No manifest written, no registry entry added, v3 and the test set untouched
  (verified programmatically; see `tests/test_v4.py`).

## What unblocks v4

Human review of the pending queue (explicit ACCEPT/CORRECT per item — never
automatic), continued targeted acquisition (paper/trash priority per
run-002 error analysis), and re-running `python -m ml.build_v4`. Only a
passed gate plus a documented hypothesis justifies run-003.
