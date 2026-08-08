# Feature Flight control tools

Use these tools after preflight and throughout a multi-mission flight. They
replace repeated chat reasoning about dependencies and lane availability with
small deterministic computations over durable files.

## Initialize observed state

`shield-ops flight state-init` creates one non-authoritative, create-only state
snapshot with every mission planned and every authority reference explicitly
null. The host or controlling Hill may later write new state observations, but
a status string never substitutes for journal evidence or human authority.

## Compute legal routing

`shield-ops flight route` reads the resolved plan and current observation,
then reports unmet dependencies, the current activation wave, lane occupancy,
and legal next-action candidates. It fails closed on unknown states, missing
missions, premature execution, and multiple active missions in one lane.

The routing report is advice for Feature Hill. It does not dispatch a seat,
authorize a mission, mutate the state file, or append a journal entry.

For ownership changes, integration, and recovery, continue with
[Feature Flight convergence tools](./feature-flight-convergence-tools.md).
