# Feature Flight control tools

Use these observational tools after preflight and throughout a multi-mission
flight. They compute routing advice over durable snapshots. They do not provide
an authority class, dispatch a seat, mutate a journal, or perform an external
effect.

## Initialize closed observed state

```bash
npx shield-ops flight state-init \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --output /absolute/path/to/new-flight-state.json
```

The create-only producer emits closed flight-state version 2. Every state binds
the exact resolved-plan path, byte count, and SHA-256; flight ID; sequence;
predecessor digest; repository root, base ref/revision, and integration branch;
current wave; lane occupancy; and each mission's planned lane, activation wave,
status, exact revision or null, and null authority evidence. Unknown or missing
fields are rejected at every object level. Genesis is sequence `0` and is the
only state allowed to use a null predecessor digest.

Producer identity is sequence-specific. `flight-state-init` produces only
sequence `0`; every sequence greater than `0` identifies the distinct closed
`flight-state-successor-recorder` producer. A genesis producer on a successor,
or a successor producer on genesis, is rejected.

State is non-authoritative with `authority:none`. A lifecycle status string or
an `authorityEvidence` value never substitutes for trusted journal replay or
human authority.

## Compute advisory routing

```bash
npx shield-ops flight route \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --state /absolute/path/to/flight-state-1.json \
  --expected-state-sha256 STATE_SHA256 \
  --expected-state-sequence 1 \
  --predecessor-state /absolute/path/to/flight-state-0.json \
  --expected-predecessor-sha256 PREDECESSOR_SHA256 \
  --output /absolute/path/to/new-routing-report.json
```

The router snapshots each supplied artifact once. It requires an externally
expected digest and sequence for the current state. After genesis it also
requires a predecessor snapshot and its externally expected digest, then checks
the current predecessor binding, same exact flight and plan identity, and exact
sequence minus one. Genesis rejects predecessor inputs. Missing, malformed,
stale, or conflicting evidence fails closed.

For every successor, the router compares predecessor and current mission tuples
in exact plan order. The closed transition table is:

| From | Allowed current status |
| --- | --- |
| `planned` | `planned`, `authorized`, `cancelled`, `superseded` |
| `authorized` | `authorized`, `active`, `blocked`, `failed`, `cancelled`, `superseded` |
| `active` | `active`, `blocked`, `failed`, `complete`, `cancelled`, `superseded` |
| `blocked` | `blocked`, `active`, `failed`, `cancelled`, `superseded` |
| `failed` | `failed`, `blocked`, `cancelled`, `superseded` |
| `complete` | `complete`, `integrated`, `cancelled`, `superseded` |
| `integrated` | `integrated` |
| `cancelled` | `cancelled` |
| `superseded` | `superseded` |

Mission removal or reordering, lifecycle rollback, lane or activation-wave
identity drift, wave regression, and clearing or substituting an established
revision are rejected.

Expected current-state SHA-256 and sequence prove only that the supplied
snapshot matches those expectations. They do not prove that it is the latest
flight state; the report says this explicitly.

The report uses `advisoryCandidates`, never `legalActions`. Because this tool
has no trusted journal verifier, any routing derived from `authorized`,
`active`, `complete`, `integrated`, `cancelled`, or `superseded` observation in
either the current or predecessor state emits only
`requires-authority-verification`; it never emits an activate, continue,
complete, or integrate candidate. Cancelled and superseded observations cannot
advance lane or wave routing without trusted verification.

Routing Advice Report version 1 is closed at the report, tool, artifact
identity, expectation, mission, and advisory record levels. Its fixed top-level
fields are `schemaVersion`, `reportType`, `authority`, `notice`,
`freshnessNotice`, `tool`, `flightId`, `sequence`, `currentWave`, `plan`,
`state`, `predecessor`, `stateExpectation`, `missions`, and `advisories`.
Legacy `legalActions` and `events` fields are rejected. The report remains
advice for Feature Hill and performs no authority decision, dispatch, state
write, journal mutation, merge, deployment, release, or other external effect.
