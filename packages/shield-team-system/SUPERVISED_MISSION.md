# Bounded supervised mission

V0.3-4 provides one local, durable mission workflow. It proves governance,
execution, readiness, communication, and execution-effect replay as separate
projections. The `mission step` CLI remains a journal-only fixture transition;
it performs no model invocation, seat dispatch, tool or executor call, network
access, host-adapter behavior, or external effect. The separate `/runner`
contract can produce a non-authoritative effect candidate for this journal.

## Pre-initialization Coulson signer bootstrap

Before a repository has been initialized, create a fresh encrypted Coulson
signer candidate in protected host storage and retain its credential-free public
binding packet for later repository-policy review:

```sh
printf '%s\n' "$PASSCODE" | npx shield mission signer bootstrap \
  --seat coulson \
  --binding-id binding:coulson \
  --human-principal-id human:maintainer-1 \
  --passcode-stdin \
  --json
```

This command has no `--root`, does not inspect or mutate a repository, and does
not create `.shield/config.json`, a trusted binding registry, a journal, or Git
state. Each successful invocation creates a distinct candidate; it never finds,
reuses, repairs, or overwrites an existing signer. Its output contains only the
seat, exact binding and human-principal identifiers, signing-key reference, and
public SPKI needed for later review. SHIELD does not emit or store plaintext
private key material: the encrypted schema-1 signer record is stored only in
host-local protected signer storage, and neither its path nor its encryption
fields appear in bootstrap output.

The confinement guarantee assumes no other process running as the same OS user
concurrently mutates `.shield`, `signers`, or the destination signer path.
Pre-existing symlinks and non-directories are rejected, but this JavaScript
implementation does not claim race-free ancestor confinement against malicious
or accidental concurrent same-user replacement.

Signer generation is authority-neutral. It does not accept a person into
repository policy, authorize a mission, grant Wheels Up, satisfy Fitz or
Simmons, or permit publication, merge, deployment, release, or final
acceptance. Issue #216 owns the later Coulson-only repository profile and
initialization contract; Fitz remains GitHub platform review and conditional
Simmons feedback remains external evidence for #216 or later adapters.

## Trust setup

Human evidence uses Ed25519 signatures. SHIELD does not emit or store plaintext
private key material. For each human seat, export the public key as SPKI DER,
encode it as base64, and compute its configured reference with:

```js
import { computeEd25519SigningKeyRef } from "@shield/team-system/supervision";

const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiDer.toString("base64"));
```

Use that exact reference during `shield init`. Provision the public, closed
binding registry at `.shield/trusted-human-bindings.json`:

```json
{
  "schemaVersion": 1,
  "bindings": [{
    "schemaVersion": 1,
    "bindingId": "binding:coulson",
    "humanPrincipalId": "human:maintainer-1",
    "seatId": "coulson",
    "missionScope": "*",
    "signingKeyRef": "ed25519:sha256:<spki-digest>",
    "publicKeySpkiBase64": "<spki-der-base64>",
    "validFromSequence": 0,
    "validThroughSequence": null,
    "attestedBy": "repository-policy:maintainers",
    "provenanceRef": "repository-config:coulson"
  }]
}
```

Under `signed_human_gates`, include one exact binding for Fitz and, only when
required, Simmons. Under `coulson_only_platform_review`, include exactly the
Coulson binding shown above. Repository configuration is the trust root:
signature verification proves key possession, while authorization requires an
exact configured seat binding. An unsigned file, username, GitHub review, Jira
comment, issue status, branch-protection observation, flag, prompt, or
unverified text has no SHIELD authority.

The Coulson-only profile admits only a canonical profile-aware `standard@1`
brief with `requireSimmons: false`. Its sequence-0 journal freezes exactly the
Coulson trusted binding and Coulson authorization/final-acceptance requirements.
Fitz remains GitHub-required external review, Simmons remains conditional
external feedback, and neither is represented as a requirement or admitted as
SHIELD evidence. Legacy supervised, `high_assurance@1`, and
`product_sensitive@1` admission fail before journal creation under this
repository profile. Signed-human repositories preserve their existing legacy
and all three profile-aware admission paths.

## Begin

Create a closed brief with `createSupervisedMissionBrief(...)` so its
`revisionId` is the SHA-256 digest of canonical brief content, then write it as
JSON and run:

```sh
npx shield mission begin --brief mission-brief.json
npx shield mission status --mission-id mission:example
```

Begin appends an explicit `mission.begun` event containing the immutable brief
revision, trusted public bindings, Coulson authorization requirement, Fitz
technical-review requirement, and optional Simmons product/domain requirement.
For profile-aware admission use `--profile-aware`; repository trust compatibility
and canonical `profileId`/`requireSimmons` consistency are checked before any
journal is created.

## Which path do I use?

- Use the supervised signer path here when you need fresh Coulson approval for a
  proposed mission.
- Use [WHEELS_OFF.md](./WHEELS_OFF.md) when the mission already qualifies for
  bounded delegated initiation.
- Use `review.publish` only for bounded review publication; it does not replace
  mission approval.
- Use Wheels Up only when the mission explicitly needs implementation plus
  bounded draft-review publication.

## Common local routine

Treat signer setup as one-time host setup. After that, the common supervised
path is just:

```sh
npx shield mission begin --brief mission-brief.json
npx shield mission status --mission-id mission:example
printf '%s\n' "$PASSCODE" | npx shield mission authorize --mission-id mission:example --passcode-stdin
```

## One-passcode mission authorization and Wheels Up

For a fresh schema-9 mission that is still waiting for Coulson authorization,
`authorize-wheels-up` combines the initial mission decision, Wheels Up
implementation authority, initial May runtime binding, and initial draft-review
publication authority. It prompts once and records four separately signed,
independently replayable existing events in one atomic journal replacement:

```sh
npx shield mission authorize-wheels-up \
  --mission-id mission:example \
  --input .shield/tmp/authorize-wheels-up.json
```

The normal interactive view shows only the decision: what May may do, what is
excluded, and which human gates remain. Use `--human --passcode-stdin` for the
same concise output with piped passcode input. Automation can use
`--json --passcode-stdin` to retain the complete framed manifest and structured
receipt; `--human` and `--json` are mutually exclusive.

The input is closed and contains only these fields. Every array must be
non-empty, sorted, and duplicate-free:

```json
{
  "baseRevision": "<exact base commit>",
  "modelId": "model:bounded-may",
  "approvedRelativePaths": ["packages/example"],
  "approvedActionIds": ["action:implement"],
  "approvedEffectClasses": ["behavioral_implementation", "verification"],
  "approvedEffectKeys": ["effect:implementation", "effect:validation"],
  "approvedCapabilities": ["filesystem_write"],
  "validationCommandIds": ["validation:test"],
  "reasoningRuntimeId": "runtime:reasoner",
  "toolExecutorId": "executor:tools",
  "publicationPaths": ["packages/example/file.mts"]
}
```

The host derives the mission, subject, revision, repository, canonical root,
branch, HEAD, human binding, contiguous sequences, authority identifiers,
digests, timestamp, remaining gates, and exclusions. `publicationPaths` must
exactly equal the clean base-to-HEAD changed-path set. Symlink and gitlink paths
are rejected. Initial publication effects are fixed to
`review.branch.push` and `review.pull_request.create_draft`; the input cannot
request effects.

Before reading the passcode, the command displays a complete
`shield.wheels-up-authorization-manifest.v1`. With `--json` or
`--passcode-stdin`, a deterministically framed canonical preview is written to
stderr so stdout remains empty until the one final
`shield.wheels-up-authorization-receipt.v1` JSON document. Interactive human
mode prints the complete manifest before `Passcode:`.

The resulting publication authority is only for the exact displayed base,
planning HEAD, paths, and initial draft effects. It excludes review comments,
draft updates, ready-for-review, merge, deployment, release, and final
acceptance. Any later implementation-HEAD push or draft update needs fresh
exact publication authority. Existing `authorize`, `wheels-up`, `bind`, and
`publication-authorize` commands remain available unchanged for advanced use
and recovery.

The four-entry transition uses a copy-on-write sibling journal and preserves
the original journal permission mode. If the command reports
`recovery_required`, or if a sibling matching
`<journal>.batch-<nonce>.tmp` remains after interruption, inspect the exact
journal bytes and replay before taking identity-safe recovery action. Do not
retry blindly and do not delete or replace a temporary path whose inode has not
been verified.

If the signer has not been provisioned on this host yet, run the one-time setup
first:

```sh
printf '%s\n' "$PASSCODE" | npx shield mission signer setup --seat coulson --passcode-stdin
```

## Record human authority

For local operation, prefer the passcode signer routine above. It keeps the
private key encrypted outside the repository under `~/.shield/signers` and
records the resulting Coulson-signed evidence directly in the journal flow.
Manual detached evidence remains available when the host is not using the local
signer path.

The next journal sequence and exact requirement identifiers are shown by
`mission status --json`. Construct a closed evidence payload for that exact
sequence and sign `canonicalJson(payload)` with the corresponding Ed25519
private key outside SHIELD. Store the detached base64 signature beside the
payload:

```json
{
  "payload": {
    "schemaVersion": 1,
    "evidenceId": "evidence:coulson:1",
    "requirementId": "<exact requirement ID>",
    "missionId": "mission:example",
    "subjectKind": "mission_plan",
    "subjectId": "mission-plan:example",
    "revisionId": "sha256:<exact brief digest>",
    "seatId": "coulson",
    "evidenceKind": "mission_authorization",
    "decision": "approved",
    "governanceTarget": "approved",
    "humanPrincipalId": "human:maintainer-1",
    "bindingId": "binding:coulson",
    "signingKeyRef": "ed25519:sha256:<spki-digest>",
    "sourceRef": "manual-signature:coulson-1",
    "timestamp": { "value": "2026-07-18T20:00:00Z", "provenance": "humanRecorded" },
    "journalSequence": 1
  },
  "signatureBase64": "<detached-ed25519-signature>"
}
```

```sh
npx shield mission approve --mission-id mission:example --evidence coulson-approval.json
npx shield mission pause --mission-id mission:example --evidence coulson-pause.json
npx shield mission resume --mission-id mission:example --resume-state approved --evidence coulson-resume.json
npx shield mission cancel --mission-id mission:example --evidence coulson-cancel.json
npx shield evidence record --mission-id mission:example --evidence fitz-review.json
```

The local signer updates the configured Coulson public binding for future
missions. Run setup before beginning new missions; existing mission journals
retain the binding captured at begin and must continue using their original
signer. Use `--passcode-stdin` for automation so the passcode is not exposed in
process arguments:

```sh
printf '%s\n' "$PASSCODE" | npx shield mission signer setup --seat coulson --passcode-stdin
printf '%s\n' "$PASSCODE" | npx shield mission authorize --mission-id mission:example --passcode-stdin
```

Every governance command requires fresh Coulson-signed evidence bound to its
intended sequence, exact brief revision, and exact resulting governance state.
For example, signed `resumed` evidence must name `governanceTarget` as either
`proposed` or `approved`, and `--resume-state` must match it. Non-governance
Fitz and Simmons evidence uses `governanceTarget: null`. Prior records remain
append-only history.

## Troubleshooting

- `shield mission authorize` says no local signer was found:
  run `shield mission signer setup --seat coulson` on this host before starting
  a new supervised mission, or use detached signed evidence for missions bound
  to a different key.
- The signer cannot be unlocked:
  check the passcode and confirm the host still has the matching signer record
  under `~/.shield/signers`.
- The mission still shows `proposed` after an approval-looking artifact exists:
  only journal-appended signed evidence changes mission governance. Regenerate
  the approval through `shield mission authorize` or `shield mission approve`.
- The mission should have been lighter-weight from the start:
  if it qualifies for delegated bounded initiation, begin it through Wheels Off
  instead of inventing an unsigned supervised shortcut.

## Step, status, and report

```sh
npx shield mission step --mission-id mission:example
npx shield mission status --mission-id mission:example --json
npx shield mission report --mission-id mission:example --json
```

`status` and `report` are read-only and select replay by journal schema. Legacy
schema 2–8 journals use supervised replay; canonical schema 9 journals use
profile-aware replay. A journal that mixes schema 9 with a legacy schema fails
closed, and neither format is reinterpreted through the other replay contract.
Repository trust profiles are CLI admission policy only and are not journal
fields. Later configuration changes therefore cannot reinterpret an existing
schema-9 journal.
`step` remains the supervised journal transition command.

The first step records `not-started → running`; the second records
`running → completed`; further steps are deterministic no-ops. Execution may be
complete while acceptance readiness remains `waiting` for Fitz or conditional
Simmons. Existing journal v2/v3 missions keep communication `not-configured`.
Journal v4 records a communication request before an adapter effect and then
records its correlated `delivered`, `failed`, or `unknown` result. Those states
never satisfy evidence or alter governance, execution, or readiness.

Repository configuration schema 3 may admit GitHub and Atlassian concurrently,
but review publication remains the existing GitHub-specific operation. Request
construction freezes the validated repository configuration, requires `github`,
emits `adapterId: "github"`, and rereads the same configuration immediately
before journal append. Byte, identity, meaning, or membership drift fails before
the request is queued. Configured Atlassian identity alone creates no operation,
credential lookup, external call, delivery behavior, or publication authority.

Journal v5 carries the v4 communication contract forward and adds
`execution.effect_recorded`. The runner candidate is bound to the exact mission,
subject, revision, prior sequence, cycle, seat, action, authorization decision,
effect class, and effect key. `createExecutionEffectEntry(...)` supplies the
trusted entry ID and timestamp only after rechecking that binding against the
current projection. Replay exposes both `completed` and `uncertain` records;
either outcome blocks the same effect key from another runner dispatch until a
future explicitly authorized recovery contract exists.

GitHub and manual signed evidence enter through the same
`createHumanEvidenceEntryFromAdapterCandidate` Kernel boundary. The adapter
envelope must preserve the signed evidence's exact mission, subject, revision,
principal, binding, evidence identifier, and source reference. A rejected
candidate produces no journal entry.

Journal v6 carries v5 behavior forward and adds separately
Coulson-authorized runtime-binding records and atomic binding supersession.

Journal v7 carries v6 behavior forward and adds a distinct
`repository_artifact` review subject without changing the immutable
mission-plan revision. `createMissionBegunEntry(...)` requires the initial
review subject for v7. `createReviewSubjectSupersessionEntry(...)` records an
explicit A→B transition, preserves A as stale history, and creates B-bound Fitz
and optional Simmons requirements that name the exact superseded A
requirements.

`createFuryReviewEntry(...)` records exactly one final
`changes_requested` or `approved` Fury verdict for the current review revision.
A stale, duplicate, or contradictory verdict fails closed. Fitz and Simmons
evidence cannot be recorded until the current revision has an unambiguous Fury
approval. Superseding the review subject makes prior review evidence and Fury
records stale without deleting them, returns the Fitz route to `waiting`, and
requires a fresh current-revision Fury record.

Journal v1 replay remains available through the existing `/journal` contract.
Adapter workflows create journal v4 explicitly and runner workflows create
journal v5 or later explicitly. No path mixes versions, migrates, or rewrites
prior journal evidence.
