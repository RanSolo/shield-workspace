# Issue #384 — production Fury tool-policy correction plan

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base: `a93ab6c406bc4315eb5f1f5bd32f13c970aadbca`
- Parent proving loop: #341
- Blocked mission: #383
- Failed production receipt: `receipt:sVgAqsU53kRLIUKg4frtNEzHy9vOqU3c`
- Failure: `COPILOT_EXECUTION_FAILED / Copilot session identity or policy drifted.`
- Observed flags: model change false, agent substitution false, unauthorized tool/effect true

## Objective

Correct the production Copilot Fury executor so the exact registered,
host-backed immutable `read` and `search` tools remain usable across the
SDK's real pre-tool and permission callback sequence, while every other tool or
effect remains fail-closed. Preserve bounded policy diagnostics in terminal
failure evidence so a denied legal call can be distinguished from a genuinely
forbidden attempt.

## Smallest implementation

1. First preserve a redacted callback transcript from the pinned
   `@github/copilot-sdk@1.0.11` integration seam while retaining the current
   deny policy. The transcript records callback order, callback surface,
   permission kind, bare tool identity or `unknown`, argument-shape digest,
   expected-session match, managed-approval state, decision, and closed reason
   code. It records no raw paths, queries, file bytes, prompts, credentials, or
   unrestricted arguments. If the observed sequence contradicts the pinned SDK
   types or this plan, stop before widening policy and return the transcript to
   Fury.
2. Treat `custom:read` and `custom:search` only as session tool-filter
   qualifiers. Do not strip or normalize a `custom:` prefix from callback
   identities. The pre-tool hook and `PermissionRequestCustomTool` both use
   the exact bare names `read` and `search`; every other name is
   `unknown` and denied.
3. Add one internal surface-discriminated closed classifier with separate
   inputs and predicates:

   - **Pre-tool:** validate the sequence prefix, expected versus actual child
     session ID, exact bare `read | search` name, and map-valid arguments.
     This surface supplies no permission envelope or managed-settings evidence;
     do not require or synthesize either.
   - **Permission:** additionally require
     `managedSettingsEnabled === false`,
     `managedApprovalRequired !== true`, an exact
     `kind: "custom-tool"` envelope with no mixed-kind fields, an exact bare
     `toolName: "read" | "search"`, and present map-valid arguments.

4. Freeze deterministic transitions from the captured pinned-SDK transcript.
   Keep the argument-shape digest only in persisted diagnostics. In memory,
   correlate each transition with a domain-separated digest of the complete
   canonical validated arguments; never persist that digest or the arguments.
   Capture whether a stable SDK `toolCallId` spans permission and handler
   callbacks. When present, require and consume it exactly once together with
   session, bare tool identity, and the full-argument digest. When absent,
   permit correlation only if the captured sequence proves one unambiguous
   immediately-associated transition with matching full validated arguments.
   If the pinned sequence provides no reliable discriminator, stop before
   widening policy and return to Fury.

   Duplicate, out-of-order, unmatched, replayed, handler-ID-mismatched, or
   handler-argument-mismatched callbacks deny and set the sticky terminal flag.
   An exact valid permission callback returns only
   `{ kind: "approve-once" }`. Never return session, location, permanent,
   managed-policy, or generic approval. Missing arguments, wrong session,
   managed approval, unknown envelopes, namespace substitution, and every
   non-custom permission kind are denied.
5. Define `shield.copilot-fury.tool-policy-observation.v1` as a closed
   diagnostic structure:

   - closed callback-surface enum;
   - tool identity `read | search | unknown`;
   - decision `allow | deny`;
   - closed reason-code enum;
   - argument-shape digest only;
   - expected-session match and managed-approval booleans;
   - fixed maximum of 32 ordered records;
   - deterministic safe-integer, saturating total-count/truncated metadata.

   Reserve slot 32 for the first denial. Retain the first 31 observations; if
   any denial occurs, slot 32 contains that first denial. If no denial occurs,
   retain the first 32 observations. A first denial arriving after 32 allowed
   observations deterministically displaces the previously retained slot 32.
   Ignore later records for retention while incrementing `totalCount` until
   `Number.MAX_SAFE_INTEGER`, where it saturates. Set `truncated` whenever
   an observed record is not retained. Keep
   `unauthorizedToolOrEffectObserved` sticky independently of diagnostics.
   Validate the structure before completed or failed observations are
   persisted.
6. Keep a denied attempt terminal: output from a session with any forbidden or
   malformed call remains unusable.
7. Replace the current independent callback mocks with a pinned-SDK sequence
   harness that replays the captured order through pre-tool, permission, and
   handler. Cover valid read/search; wrong session; managed settings and
   `managedApprovalRequired`; mixed-kind and unknown envelopes; missing or
   malformed arguments; `custom:` callback-name substitution; out-of-map
   paths; every non-custom permission kind; MCP; different valid arguments
   having identical shapes; duplicate, out-of-order, unmatched, and replayed
   callback IDs; absent-ID ambiguity; handler ID or full-argument mismatch;
   exact slot-32 displacement; safe-integer saturation; cap/truncation;
   first-denial retention; and terminal denied-attempt behavior.
8. Preserve historical compatibility explicitly. Existing V1/V2/V3 evidence
   does not require the new diagnostic field. Add fixed pre-change
   evidence/receipt byte-and-digest fixtures proving replay performs no
   executor/tool effect and neither mutates nor reinterprets historical
   observations.
9. Revalidate the existing immutable artifact-map, model/agent identity,
   exact-revision, persistence, execute-once, recovery, and replay tests.

## Expected paths

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- this plan

Expand only if exact SDK types prove a separate small contract module is
required.

## Validation

- Focused node-test files through the Team System Nx target.
- Pinned-SDK callback-sequence capture and deterministic replay harness.
- `npm exec nx affected -t build,test --base=a93ab6c406bc4315eb5f1f5bd32f13c970aadbca --head=<candidate> --exclude=@shield/multiband`
- Warm-cache rerun.
- `git diff --check a93ab6c406bc4315eb5f1f5bd32f13c970aadbca..<candidate>`
- Fresh #383 production Fury successor proving PASS or REVISE without opaque
  policy drift.

## Exclusions

No generic callback-name normalization; no broader repository tools,
shell/process execution, filesystem writes, Git mutation, network/MCP access,
managed-policy override, persistent permission approval, new authority, Fury
rubric change, #383 implementation, publication, merge, deployment, release,
or final acceptance.
