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

Include one exact binding for Fitz and, only when required, Simmons. Repository
configuration is the trust root: signature verification proves key possession,
while authorization requires an exact configured seat binding. An unsigned
file, username, flag, prompt, or unverified text has no authority.

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
`step` remains the supervised journal transition command.

The first step records `not-started → running`; the second records
`running → completed`; further steps are deterministic no-ops. Execution may be
complete while acceptance readiness remains `waiting` for Fitz or conditional
Simmons. Existing journal v2/v3 missions keep communication `not-configured`.
Journal v4 records a communication request before an adapter effect and then
records its correlated `delivered`, `failed`, or `unknown` result. Those states
never satisfy evidence or alter governance, execution, or readiness.

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
