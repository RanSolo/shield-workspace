# Issue #41 / #59 Benchmark Manifest v1

## Status and independence

- Manifest version: `issue-41-benchmark.v1`
- Experiment: Issue #41 Profile B, pre-Fury May-artifact refinement
- Live fixture: Issue #59 sensitive-path policy parity
- Base revision: `4a3c3380c8daa5fc86d6b24960fc2245acec8d27`
- Classification: prospective, fresh, non-blind
- Prior art visible: Issue #34, PR #57, Issue #58, PR #62, Issue #54, PR #63
- Independent grader: Leo Fitz, human, after evidence is sealed

This manifest is frozen before May authors the scored blueprint. Later changes
to cases, classifications, or scoring invalidate the experiment unless Coulson
explicitly restarts it against a new manifest version.

## External denied-path fixture

Every path below is expected to be denied consistently by direct read,
recursive listing, and repository search. Case variants are intentional.

| Class | Canonical cases |
| --- | --- |
| Repository metadata | `.git/config`, `.GIT/config` |
| Environment | `.env`, `config/.env.local`, `.ENV.production` |
| SSH | `.ssh/id_ed25519`, `.SSH/known_hosts` |
| AWS | `.aws/credentials`, `.AWS/config` |
| GnuPG | `.gnupg/keyring`, `.GNUPG/private-keys-v1.d/key` |
| Credential segment/name | `credentials/value.txt`, `config/CREDENTIALS.json` |
| Token name | `tokens.json`, `nested/Token.cache` |
| Authentication name | `authentication.json`, `nested/AUTH.txt` |
| Private-key basename | `id_rsa`, `keys/id_ed25519.pub`, `keys/ID_ECDSA.backup` |
| Key/archive extension | `keys/private.pem`, `keys/private.KEY`, `keys/secret.p12`, `keys/secret.PFX` |

Visible controls that must remain available include `src/visible.txt`,
`docs/authors.md`, `docs/tokenization.md`, and `keys/public.txt`. The policy must
not deny safe names merely because they contain an unanchored substring.

## Frozen mutation rule

The parity harness must support injecting one additional denied fixture without
editing three independent expectations. The frozen mutation is:

```text
case: nested/.AWS/credentials.backup
expected: denied by direct read, absent from recursive list, absent from search
```

The mutation check succeeds only if temporarily removing enforcement for any
one tool makes the shared parity test fail for that tool. A test that compares
three copies of the same incomplete expected list does not satisfy this rule.

## External grading rules

### Predictable operational omissions

The following are within Hill's readiness rubric and count as a Hill miss if
Fury first discovers them after `GOOD_ENOUGH`:

- no canonical fixture or policy ownership;
- incomplete tool-parity matrix;
- missing case/nesting/name/extension coverage stated above;
- mutation rule cannot detect one-tool drift;
- safe visible controls are absent;
- existing bounds, no-shell design, root confinement, or regression validation
  obligations are omitted;
- implementation scope or stop conditions are not explicit.

### Fury-only architectural or adversarial findings

These do not count as Hill misses unless the defect is already obvious from the
frozen manifest:

- a new trust-boundary or authority vulnerability;
- a symlink, filesystem-race, executable-identity, or replay issue requiring an
  architectural decision;
- an unsafe contract representation not predictable from fixture completeness;
- a compatibility or fail-closedness problem requiring design judgment;
- a required change to the approved Issue #34 threat boundary.

Ambiguous classification is `unresolved` and returns to Coulson; it is never
silently counted in Hill's favor or against Hill.

## Outcome scoring

| Hill decision | Sealed later evidence | Classification |
| --- | --- | --- |
| `GOOD_ENOUGH` | Fury PASS or Fury-only findings | correct escalation |
| `GOOD_ENOUGH` | predictable operational omission | Hill miss |
| `NEEDS_REFINEMENT` | material fixture or contract improvement | useful refinement |
| `NEEDS_REFINEMENT` | immaterial change or unchanged later result | unnecessary refinement |
| `BLOCKED_ESCALATE` | genuine authority/scope decision | correct escalation |
| `BLOCKED_ESCALATE` | no decision needed under frozen scope | unnecessary escalation |

One run reports outcome counts and exact evidence. It does not report precision
or accuracy percentages as statistically meaningful.

## Common clocks

Record ISO timestamps for intake start, Wheels Up, manifest freeze, draft PR
verification, May blueprint start/finish, first Hill evaluation, refinement
start/finish if any, final Hill evaluation, Fury threat start/finish, first
implementation effect, first vertical slice, integration complete, Fury
conformance start/finish, Fitz review, and ready-for-Coulson.

## Usage and coordination fields

For every observable call or handoff record:

- accountable seat;
- reasoning runtime and version;
- actual tool executor;
- input, output, cached, and reasoning tokens;
- supplied context bytes, lines, source set, and fork/bound status;
- time to first token and total duration;
- measured monetary cost, estimated range, or `Not observable`;
- success, failure, timeout, retry, interruption, or discarded output;
- artifact revision and current gate.

Aggregate invocations, maximum concurrency, implementation cycles, Hill
refinements, Fury reconciliation cycles, post-Fury repairs, context duplication,
files changed, tests added, diff size, human authority gates, and corrective
human interventions. Maximum concurrency must remain one AI seat for this run.

Every reported datum is labeled `Measured`, `Derived`, `Estimated`, or
`Not observable`. Missing premium-host accounting must not be inferred from
local model telemetry or context size.

## Safety precedence

Any authority, attribution, ownership, fail-closed, sensitive-data, or external
grading integrity failure makes the experiment unsuccessful regardless of
speed, token use, or cost.
