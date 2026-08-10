# Schema-9 operator workflow

This is the supported routine path for preparing a new profile-aware mission
for governed May dispatch. It records authority only; it does not invoke May,
run an external fixture, merge, deploy, or release.

## One-time signer setup

Provision the configured Coulson signer once on the operator host:

```bash
shield mission signer setup --seat coulson --root .
```

The passcode is entered at the prompt. Do not place passcodes or private keys in
mission JSON, shell history, logs, commits, or pull requests.

## Begin and authorize the mission

The profile-aware brief is schema 2 content without a caller-supplied
`revisionId`. Begin computes the revision, freezes trusted human bindings and
profile requirements, and creates a new schema-9 journal:

```bash
shield mission begin --profile-aware --brief mission-brief.json --root .
shield mission authorize --mission-id mission:issue-N --root .
```

The second command prompts for the passcode and signs mission authorization at
the exact next journal sequence. It does not imply Wheels Up.

## Record Wheels Up

Create a closed work-scope file. It must contain exactly these fields; arrays
must use the canonical sorted, unique form required by the authority contract:

```json
{
  "baseRevision": "0123456789abcdef0123456789abcdef01234567",
  "modelId": "model:local-may",
  "approvedRelativePaths": ["packages/example"],
  "approvedActionIds": ["action:implement"],
  "approvedEffectClasses": ["behavioral_implementation", "verification"],
  "approvedEffectKeys": ["effect:implementation", "effect:validation"],
  "approvedCapabilities": ["filesystem_write"],
  "validationCommandIds": ["validation:test"]
}
```

`baseRevision` must exist and be an ancestor of the current HEAD; it must not be
the current HEAD. The model identity must differ from May and every mission
participant.

```bash
shield mission wheels-up --mission-id mission:issue-N --input wheels-up.json --root .
```

The CLI observes and signs the canonical real root, attached branch, current
HEAD, repository ID, exact scope, and next sequence. It rechecks the journal and
Git observation after signing and fails closed if either changed.

## Bind May execution identities

Create a second closed file containing only the independently observed runtime
and tool-executor identities:

```json
{
  "reasoningRuntimeId": "runtime:lm-studio",
  "toolExecutorId": "executor:shield-host"
}
```

```bash
shield mission bind --mission-id mission:issue-N --input may-binding.json --root .
shield mission status --mission-id mission:issue-N --root .
```

This third passcode prompt signs the active May binding. May, reasoning runtime,
model, and tool executor must be mutually distinct, and the latter three cannot
be mission participants. The command copies the exact active Wheels Up scope;
it cannot widen paths, actions, effects, capabilities, or validation commands.

## Failure and recovery

Wrong order, bad passcode, stale sequence, changed root/branch/HEAD, non-ancestor
base, duplicate journal, mixed schema, malformed or extra JSON fields, forged
signatures, and identity collisions fail closed. Inspect `mission status` or
`mission report`; do not edit or translate signed journal entries. A
`recovery_required` result means the durable state is uncertain and requires a
separate recovery procedure before retrying.
