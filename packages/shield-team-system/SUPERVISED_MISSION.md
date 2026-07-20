# Bounded supervised mission

V0.3-4 provides one local, durable mission workflow. It proves governance,
execution, readiness, communication, and execution-effect replay as separate
projections. The `mission step` CLI remains a journal-only fixture transition;
it performs no model invocation, seat dispatch, tool or executor call, network
access, host-adapter behavior, or external effect. The separate `/runner`
contract can produce a non-authoritative effect candidate for this journal.

## Trust setup

Human evidence uses Ed25519 signatures. SHIELD never reads or stores private
keys. For each human seat, export the public key as SPKI DER, encode it as base64,
and compute its configured reference with:

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

## Record human authority

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

Every governance command requires fresh Coulson-signed evidence bound to its
intended sequence, exact brief revision, and exact resulting governance state.
For example, signed `resumed` evidence must name `governanceTarget` as either
`proposed` or `approved`, and `--resume-state` must match it. Non-governance
Fitz and Simmons evidence uses `governanceTarget: null`. Prior records remain
append-only history.

## Step, status, and report

```sh
npx shield mission step --mission-id mission:example
npx shield mission status --mission-id mission:example --json
npx shield mission report --mission-id mission:example --json
```

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

Journal v1 replay remains available through the existing `/journal` contract.
Adapter workflows create journal v4 explicitly and runner workflows create
journal v5 explicitly. Neither path mixes versions, migrates, or rewrites prior
v2/v3 journal evidence.
