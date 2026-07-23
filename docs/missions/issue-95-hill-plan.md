# Hill Plan — Mack v0 Architecture and Proving Mission

## Handoff contract

```text
Validation scope
- scenarios and lanes selected
- changed behavior covered

Results
- pass / fail / blocked / inconclusive / invalid_handoff

Findings
- production defect
- test/fixture defect
- environment limitation
- coverage gap

Evidence
- exact repository and HEAD
- approved command or lane IDs
- test counts and references

Recommended route
- May / Mack / Daisy / Fury / Simmons / Fitz / Coulson / advance
```

## Bounded proving mission

Use one small reversible production change with one known regression gap. Mack must derive scenarios from the approved behavior, inspect existing conventions, add or repair only an approved test surface, execute the selected lanes, prove the old implementation fails where practical, and return an exact-head report.

## Success criteria

- Mack detects the behavioral gap independently of May’s implementation reasoning.
- Test-only edits remain within the approved surface.
- All five closed outcomes are exercised or explicitly shown to be unavailable.
- Production defects route to May; test defects remain with Mack.
- Fitz and Simmons receive evidence without their gates being replaced.

