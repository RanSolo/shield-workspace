# Hill Plan — QA Mode v0

## Required handoff

```text
Validation scope
- scenarios and lanes selected
- changed behavior covered

Results
- passed
- failed
- unavailable, misconfigured, or environment-blocked

Findings
- production defect
- test/fixture defect
- environment limitation
- advisory coverage gap

Evidence
- exact HEAD
- command or lane IDs
- test counts and references

Recommended route
- May / Mack / Daisy / Fury / Coulson / advance
```

## Proving mission

Use one small reversible behavioral defect with a regression gap. Require happy path, boundary/null, mismatch, state-refresh, non-applicable, old-implementation regression, and exact-head evidence.

## Dependencies

- #95 formalizes Mack’s seat and validation ownership.
- #76 supplies discovered pipeline lanes.
- #67 supplies Hill-controlled iteration and routing.
- #54 preserves the Fury architecture gate.

## Implementation result

The bounded `qa.mode.v0` slice consumes the approved packet without executing
commands or creating authority. The proving fixture is bound to
`RanSolo/shield-workspace@50afdc9de3f71f6f83deb6c2f00ace2c991fcee5` and covers
the six required scenario kinds. Mack remains the independent validator and
May remains the production implementation owner.
