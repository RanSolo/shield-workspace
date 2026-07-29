# Mission Profile Model — Follow-up to Issue #130

This is a new mission contract and does not mutate Mission #130's v2 journal.
The revised work uses a new mission identifier and carries the predecessor
journal digest as evidence.

## Frozen profiles

| Profile | Execution gates | Final acceptance |
| --- | --- | --- |
| `standard@1` | Coulson | Coulson |
| `high_assurance@1` | Coulson, Fitz | Coulson |
| `product_sensitive@1` | Coulson, Simmons | Coulson |

Coulson selects or confirms the closed profile before signing authorization.
Intake freezes the resulting requirements into the brief. Risk flags require
Coulson authorization but do not mutate the selected profile in v1. Coulson may
select a stricter profile, but no required gate may be removed after
authorization.

Authorization permits execution. Final acceptance is a separate Coulson act
bound to the exact result revision; it is never inferred from authorization or
from specialist review.

The implementation contract is `mission.profile.v1`, exported as
`@shield/team-system/mission-profile`. Mission #130 remains stopped at sequence
1 and its predecessor journal digest is:

`sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9`

