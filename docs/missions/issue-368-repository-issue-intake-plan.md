# Issue #368 — repository issue to profile-aware mission intake

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base: `c2adf6a189bf0f04641bd454547f75b42b6f2df6`
- Exact plan commit and plan SHA-256: supplied and verified by each review packet;
  intentionally not embedded in the plan because both identities change when this
  file is committed.
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

The command performs bounded reads through the configured GitHub host adapter,
compiles a closed profile-aware brief and durable issue-intake source binding,
validates them through the shared profile-aware intake contract, and creates one
schema-9 `mission.begun` entry. It accepts no caller-authored brief, mission ID,
subject ID, timestamp, participant list, gate list, risk JSON, or repository
observation.

`--brief` and `--issue` are mutually exclusive. The existing `--brief` surface and
journal bytes remain backward compatible.

## Frozen decisions

### Host observation

The GitHub adapter owns network/process observation. Team System receives only a
closed observation produced by an injected byte runner. Each production observation
invokes one frozen `gh api graphql` query that returns repository and issue host IDs
in the same response. The runner uses `shell: false`, no stdin, a closed environment,
frozen timeout and stdout/stderr bounds, fatal UTF-8 decoding, and then the existing
strict bounded JSON parser rather than raw `JSON.parse`.

The observation contains exactly:

- repository host ID and canonical `nameWithOwner`;
- issue host ID, number, canonical URL, title, body, state, labels, and host
  `updatedAt`;
- a stable issue revision derived from canonical validated fields;
- process-local `observedAt` and source reference, excluded from replay identity.

The observer rejects malformed references, cross-repository observations, closed
or unavailable issues, duplicate JSON keys, oversized/deep payloads, unknown
fields, invalid UTF-8, authentication/rate-limit/process failures, malformed URLs,
and repository/issue response identity mismatch. Labels are bytewise sorted before
hashing. Observation is authority-none and has no write capability.

### Acceptance-criteria extraction

The compiler extracts exactly one second-level Markdown section whose normalized
heading is `Acceptance criteria`. It accepts a bounded non-empty sequence of
checkbox or bullet items, preserves their normalized text and order, and binds a
canonical criteria digest into the issue revision/source binding. Missing,
duplicate, empty, malformed, nested-ambiguous, oversized, or over-count sections
fail before journal access. The criteria and digest appear in the concise human
projection; they do not widen the closed profile-aware brief schema.

### Deterministic compilation

The compiler is pure and versioned. It consumes configured repository identity,
the validated issue observation and criteria, explicit profile ID, current attached
branch and exact HEAD, prepared-worktree receipt, exact configuration bytes, and
exact trusted-binding-registry bytes already used by profile-aware admission.

It derives:

- `missionId`: `mission:issue-intake:<base64url-sha256>` where the digest is over a
  domain-separated canonical tuple of repository host ID and issue host ID. The
  fixed format stays inside the existing mission-store filename bound even when
  configured owner/repository names are maximal;
- `subjectId`: `github:<owner>/<repo>/issue/<number>`;
- objective: the validated issue title, preserving exact normalized text;
- created time: stable GitHub `updatedAt` with `hostTrusted` provenance;
- profile/version and required human gates from the existing profile registry;
- participants: Hill, Fury, May, required human seats, de-duplicated in canonical
  order;
- Delivery Mode activation for Hill;
- `requireSimmons` from the selected existing profile;
- predecessor fields from the repository's existing canonical genesis convention.

It also emits a closed `IssueIntakeSourceBindingV1`, persisted in the sequence-zero
`mission.begun` entry, containing:

- binding/compiler contract version;
- configured repository identity plus host repository ID/`nameWithOwner`;
- issue host ID, number, URL, canonical issue revision, `updatedAt`, and criteria
  digest;
- selected profile ID/version;
- attached branch and exact HEAD;
- prepared-worktree receipt digest;
- exact config-byte and binding-registry-byte digests;
- compiled profile-aware brief revision.

Schema-9 admits two closed begin-entry variants: the unchanged legacy `--brief`
entry and the issue-intake entry carrying this binding. The binding is durable
identity evidence only; it grants no authority.

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

The compiled brief is passed through a strengthened shared
`profileAwareMissionIntakeV1`. Its legacy-compatible shared validator enforces
closed risk flags, participant uniqueness and required membership, profile/gate
consistency, and `requireSimmons` consistency for both routes. It continues to
accept every currently valid legacy mode array, including empty and non-Hill mode
arrays. The issue compiler plus closed issue-intake begin variant separately require
the exact canonical Hill Delivery activation. Existing valid `--brief` journal
bytes remain unchanged; no issue-only duplicate general validator is added.

### Result projection

Successful creation and exact replay return the existing mission projection plus a
closed next-action projection:

```json
{
  "nextAction": {
    "command": "shield mission prepare-next",
    "missionId": "<derived-mission-id>"
  }
}
```

Human output prints the same copy-safe command using the explicit canonical root.
The next action is guidance, not authority, and is derived only after the mission
projection is valid.

### State and replay

Option grammar/exclusivity is validated before network or journal access. The route
then snapshots prepared-worktree, repository, branch/HEAD, config, and binding
state; performs observation A; compiles/validates the brief and durable binding;
and checks the journal under the existing lock.

- Existing byte-/contract-identical issue-intake entry: return its projection,
  `replayed: true`, one host observation, zero writes.
- Existing valid but nonidentical entry: `conflicting_replay`, zero writes.
- Existing malformed/incomplete/unreadable/uncertain state: `recovery_required`.
- No journal: revalidate all local snapshots, perform observation B, require A/B
  repository ID, issue ID/number/URL, issue revision, `updatedAt`, and criteria
  digest equality, then initialize exactly one entry.

The replay-aware initializer is opt-in for issue intake and runs under the journal
lock. Concurrent exact callers create one journal and receive equivalent
projections. It never changes legacy initializer behavior. Uncertain append or
readback remains `recovery_required`; it never blindly retries.

## Acceptance matrix

| Criterion | Proof |
| --- | --- |
| No caller-authored brief JSON | real CLI `--issue` happy path |
| Bounded GitHub reads | exactly two on first creation; one on exact replay |
| Strict closed response | duplicate key, unknown field, oversized, malformed, foreign repo tests |
| Existing admission reused | compiler output accepted by `profileAwareMissionIntakeV1`; no parallel validator |
| Exact repository binding | wrong root/repository/branch/HEAD and drift tests append zero |
| Explicit profile judgment | missing/unknown profile fails before observation or journal mutation |
| Risk assumptions visible | stable human projection snapshot and all flags asserted |
| One authority-none effect | one issue-bound `mission.begun`; authorization remains waiting |
| Replay safety | durable binding; exact/concurrent replay appends zero; each binding dimension conflicts |
| Bounded mission identity | maximum owner/repo/issue identities initialize, status, and replay safely |
| Legacy mode compatibility | empty/non-Hill legacy modes remain valid; issue variant requires Hill Delivery |
| Directional output | JSON and human output include the exact `prepare-next` successor |
| Normal successor | resulting mission is consumable by `mission status` and `mission prepare-next` |
| Backward compatibility | existing `--brief` CLI vectors and journal bytes remain unchanged |

## Implementation packets

### Packet A — GitHub issue observer

- Add the closed observation type, byte-runner observer, fatal UTF-8 plus strict
  JSON parsing, GraphQL identity validation, deterministic criteria extraction,
  and paired runtime/type exports.
- Test exact argv/call count, stable revision/criteria digest, malformed bytes and
  response failure precedence, and absence of write commands/network in fixtures.

### Packet B — issue-to-brief compiler

- Add the pure versioned compiler and closed durable source binding adjacent to
  mission intake.
- Strengthen the shared profile-aware validator once and reuse it for both routes.
- Extend the closed schema-9 begun entry with an issue-intake variant.
- Test all profiles, participant/gate/risk consistency, deterministic identity,
  maximum identity lengths, durable binding admission, issue-only Hill activation,
  and unchanged valid legacy empty/non-Hill mode brief bytes.

### Packet C — CLI composition and replay

- Add mutually exclusive `--issue`/`--brief` forms to profile-aware begin.
- Inject the byte observer through `runMissionCli`; use a hermetic fake `gh` first
  on `PATH` for real subprocess CLI coverage.
- Add opt-in replay-aware initialization under the existing journal lock.
- Reobserve local state and issue B only for first creation.
- Test happy path, exact/concurrent replay, every binding conflict, A/B drift,
  recovery-required states, zero-mutation failures, JSON/human next-action output,
  and status/prepare-next.

Packets may be implemented sequentially by one May because B depends on A's closed
observation and C depends on both. They are review packets, not independent
missions or artificial lanes.

## Smallest authorized path set

- `docs/missions/issue-368-repository-issue-intake-plan.md`
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-intake-v1.mts`
- `packages/shield-team-system/src/mission-store.mts`
- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/github-adapter-v1.test.mjs`
- `packages/shield-team-system/tests/mission-intake-v1.test.mjs`
- `packages/shield-team-system/tests/mission-store.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

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
