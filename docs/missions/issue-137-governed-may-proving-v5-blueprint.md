# May blueprint — issue #137 governed proving v5

## Binding

- Accountable seat: May
- Mission: `mission:issue-137-governed-may-proving-v5`
- Repository: `RanSolo/shield-workspace`
- Base: `602b97c5253466d4936fc64817c06ece2769b2d2`
- Branch: `agent/issue-137-governed-may-proving-v5`
- Governing plan: `docs/missions/issue-137-governed-may-proving-v5-plan.md`

## Exact writable paths

- `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`

## Implementation shape

1. Rename internal definition defaults from `measurementClass` to
   `defaultMeasurementClass` while preserving each default.
2. Validate recorded entries against one frozen four-value measurement-class
   set; pending entries retain `null`.
3. Preserve existing attribution requirements and additionally require exact
   dispatch attribution when caller/operator evidence whose default is
   `not-observable` claims `measured`.
4. Keep human evidence on its existing verified-human path and keep authority,
   readiness, requirements, ordering, and reason precedence independent from
   measurement metadata.
5. Expand the bounded tests, update only the evidence-inventory digest in the
   fixture identity, and prove the corrected frozen identity.

## Stop conditions

Stop on any non-`dispatch_ready` gate, extra path, contract inconsistency,
external fixture action, #29 action, human-evidence requirement, or material
scope/risk decision. Do not merge, deploy, release, or claim acceptance.
