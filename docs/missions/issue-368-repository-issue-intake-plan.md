# Issue #368 — repository issue to profile-aware mission intake

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base and HEAD: `c2adf6a189bf0f04641bd454547f75b42b6f2df6`
- Parent proving loop: #341
- Authority: none
- Observed edge: a fresh Hill can prepare and diagnose a worktree and read #341,
  but `mission begin --profile-aware` stops at `Missing required option: --brief`.
- Exclusions: mission authorization, Wheels Up, model invocation, implementation
  outside this plan, publication, merge, deployment, release, and final acceptance.

## Bounded outcome

Add one authority-neutral issue-intake route:

```text
shield mission begin --profile-aware \
  --issue github:RanSolo/shield-workspace/issues/341 \
  --profile standard \
  --root <prepared-worktree> \
  --json
```

The command performs one bounded read through the configured GitHub host adapter,
compiles a closed profile-aware brief, validates it through the existing profile-
aware intake contract, and creates the same single `mission.begun` entry as the
existing `--brief` route. It accepts no caller-authored brief, mission ID, subject
ID, timestamp, participant list, gate list, risk JSON, or repository observation.

`--brief` and `--issue` are mutually exclusive. The existing `--brief` surface and
journal bytes remain backward compatible.

## Frozen decisions

### Host observation

The GitHub adapter owns network/process observation. Team System receives only a
closed observation produced by an injected runner. The production adapter invokes
`gh issue view` once with explicit repository and JSON fields. It uses the existing
strict bounded JSON parser rather than raw `JSON.parse`.

The observation contains exactly:

- repository ID;
- issue number, canonical URL, title, body, state, labels, and host update time;
- a stable issue revision derived from canonical validated fields;
- host-trusted observation time and source reference.

The observer rejects malformed references, cross-repository observations, closed
or unavailable issues, duplicate JSON keys, oversized/deep payloads, unknown
fields, invalid UTF-8, authentication/rate-limit/process failures, and response
identity mismatch. Observation is authority-none and has no write capability.

### Deterministic compilation

The compiler is pure and versioned. It consumes configured repository identity,
the validated issue observation, the explicit profile ID, current attached branch
and exact HEAD, and the trusted binding registry already used by profile-aware
admission.

It derives:

- `missionId`: `mission:github:<owner>:<repo>:issue-<number>` using the canonical
  repository/issue identity;
- `subjectId`: `github:<owner>/<repo>/issue/<number>`;
- objective: the validated issue title, preserving exact normalized text;
- created time: the host-trusted observation time;
- profile/version and required human gates from the existing profile registry;
- participants: Hill, Fury, May, required human seats, de-duplicated in canonical
  order;
- Delivery Mode activation for Hill;
- `requireSimmons` from the selected existing profile;
- predecessor fields from the repository's existing canonical genesis convention.

Risk flags are explicitly a conservative intake assumption, not issue truth:

- `hillHighRisk: true` so Fury must inspect scope/risk before implementation;
- all effect-specific flags default false because semantic inference from prose is
  not deterministic;
- the human projection states that these are unverified assumptions and that Fury
  or the human gate must revise/rescope when the issue indicates production,
  destructive, migration, credential/security, external communication, deploy,
  merge, or release risk.

The explicit `--profile` is the only operator/Hill judgment required in V1. There
is no silent profile default and no keyword/LLM classification.

The compiled brief is passed through `profileAwareMissionIntakeV1`; the new route
does not duplicate profile, binding, participant, mode, brief, or journal
validation.

### State and replay

All issue observation, repository/HEAD reobservation, config/binding validation,
brief compilation, and profile-aware intake validation complete before journal
creation. HEAD, branch, issue revision, worktree receipt, config, or binding drift
before append fails with no journal mutation.

The first valid call creates exactly the existing schema-9 `mission.begun` entry.
An exact replay resolves the same mission and returns the existing projection
without appending. A replay whose issue revision, profile, repository, branch,
HEAD, compiler version, or compiled brief differs fails as `conflicting_replay`.
Uncertain append/readback uses the existing recovery-required behavior; it never
blindly retries.

## Acceptance matrix

| Criterion | Proof |
| --- | --- |
| No caller-authored brief JSON | real CLI `--issue` happy path |
| One bounded GitHub read | injected-runner adapter test with exact argv/call count |
| Strict closed response | duplicate key, unknown field, oversized, malformed, foreign repo tests |
| Existing admission reused | compiler output accepted by `profileAwareMissionIntakeV1`; no parallel validator |
| Exact repository binding | wrong root/repository/branch/HEAD and drift tests append zero |
| Explicit profile judgment | missing/unknown profile fails before observation or journal mutation |
| Risk assumptions visible | stable human projection snapshot and all flags asserted |
| One authority-none effect | one `mission.begun`; authorization remains waiting |
| Replay safety | exact replay appends zero; conflicting issue/profile/revision fails closed |
| Normal successor | resulting mission is consumable by `mission status` and `mission prepare-next` |
| Backward compatibility | existing `--brief` CLI vectors and journal bytes remain unchanged |

## Implementation packets

### Packet A — GitHub issue observer

- Add the closed observation type, validator, injected-runner observer, strict JSON
  parsing, and package export.
- Test exact argv, stable canonical revision, failure precedence, and no write
  commands.

### Packet B — issue-to-brief compiler

- Add a pure versioned compiler adjacent to mission intake.
- Reuse profile registry and `profileAwareMissionIntakeV1`.
- Emit canonical brief plus concise human projection and provenance bindings.
- Test all three profiles, participant/gate derivation, risk assumptions, and
  deterministic identity.

### Packet C — CLI composition and replay

- Add mutually exclusive `--issue`/`--brief` forms to profile-aware begin.
- Inject the issue observer through `runMissionCli` for deterministic tests.
- Reobserve repository/worktree state before append and compose the existing
  journal initializer.
- Test happy path, exact replay, conflict, drift, zero-mutation failures, and
  handoff into status/prepare-next.

Packets may be implemented sequentially by one May because B depends on A's closed
observation and C depends on both. They are review packets, not independent
missions or artificial lanes.

## Smallest authorized path set

- `docs/missions/issue-368-repository-issue-intake-plan.md`
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-intake-v1.mts`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/github-adapter-v1.test.mjs`
- `packages/shield-team-system/tests/mission-intake-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

If existing public package tests require an export assertion, add only
`packages/shield-team-system/tests/package-surface.test.mjs`; otherwise it remains
outside scope.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- focused existing/new Nx targets where present; otherwise the exact repository-
  declared Team System test target with a Node name pattern for issue intake
- `npm exec -- nx affected -t build,test --base=c2adf6a189bf0f04641bd454547f75b42b6f2df6 --head=<exact-candidate-head> --exclude=@shield/multiband`
- `git diff --check c2adf6a189bf0f04641bd454547f75b42b6f2df6..<exact-candidate-head>`

Nx cache remains enabled. Do not use `--skipNxCache`.

## Terminal sequence

Fury plan PASS → Coulson implementation key turn → May implementation → Mack
exact-head validation → Fury conformance review → draft publication → human merge
decision → genuinely fresh #341 Hill replay.
