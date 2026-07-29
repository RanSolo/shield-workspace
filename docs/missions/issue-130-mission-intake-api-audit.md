# Mission #130 — `missionIntake(...)` API Candidate Audit

## Audit binding

- Repository: `RanSolo/shield-workspace`
- Base revision: `68defc3fed912dda663d00438ce68c249fe39d5c`
- Mission branch: `codex/issue-130-canonical-mission-runtime`
- Issue: #130
- Audit authority: Hill-owned bootstrap artifact
- Runtime participation: none; produced through session reasoning and direct
  repository reads before `missionIntake(...)` exists

## Decision

The first executable slice should compose existing intake-safe package
functions behind a new closed `missionIntake(...)` boundary. It should not call
the runner, Helicarrier, May/Daisy tools, permission executor, or GitHub
publication adapter. Those functions belong after intake has produced a
durable proposed mission and the required human gates have advanced it.

Runtime composition should be organized primarily by responsibility and
lifecycle stage. Seat identity belongs in mission data, routing, authorization,
and receipts; it should not determine the package's infrastructure layout.

## Functions to compose in intake v1

| Function | Current responsibility | Intake use |
| --- | --- | --- |
| `validateShieldConfig(...)` | Validates repository identity, supported adapter, seats, modes, human binding references, and `.shield` paths | Required. Fail closed before creating a mission candidate. |
| `evaluateDoctor(...)` | Produces repository/package/config readiness checks | Required when host observations are available; intake should surface failed checks as blockers rather than pretending the repository is ready. |
| `classifyMissionRisk(...)` | Validates the complete closed risk-flag set and derives explicit-approval requirements | Required. Its result determines whether intake can proceed only to a Coulson gate. |
| `createSupervisedMissionBrief(...)` | Canonicalizes brief content and computes the revision digest | Required. Intake should not invent another mission-brief hash or schema. |
| `validateSupervisedMissionBrief(...)` | Revalidates the closed brief and revision identity | Required readback check before returning a candidate. |
| `createEvidenceRequirements(...)` | Derives Coulson, Fitz, and conditional Simmons requirements from the brief | Required for the Hill-ready gate summary, but not authority satisfaction. |
| `validateRepositoryBindings(...)` | Binds trusted human registry entries to configured binding refs and mission scope | Conditional. Use only when the host supplies the trusted registry; missing registry must remain an explicit blocker before journal initialization. |
| `createMissionBegunEntry(...)` | Creates the authoritative initial supervised journal entry from a validated brief and bindings | Conditional write preparation after bindings are verified. Do not use for an unbound draft. |
| `initializeSupervisedMissionJournal(...)` | Creates the confined append-only journal and verifies replay | Conditional durable commit after the begun entry exists. Intake must verify readback before claiming persistence. |
| `readSupervisedMissionJournal(...)` | Loads and replays existing durable mission state | Required for idempotent resume and duplicate-mission handling. |

## Functions that inform intake but should not be called unconditionally

| Function | Boundary | Intake relationship |
| --- | --- | --- |
| `parseShieldConfig(...)` | Parses config text | Host/file adapter helper before `validateShieldConfig(...)`. |
| `createShieldConfig(...)` / `formatShieldConfig(...)` | Repository setup | Useful to `shield init`, not mission intake. Intake may report missing config but must not silently initialize trust configuration. |
| `validateModeManifest(...)` / `createModeRegistry(...)` | Validates available mode definitions | Use when the host supplies a registry and intake needs to prove a recommendation is available. |
| `resolveSeatModeContexts(...)` | Resolves already activated modes for a mission record | Post-activation. It cannot convert a recommendation into activation. |
| `createStarterPipelineSelectionV1(...)` | Creates a starter validation profile from real package scripts | Optional repository setup evidence and useful to the Issue #76 proving mission, not required for every intake. |
| `selectPipelineModesV1(...)` | Selects validation lanes from a bound profile and request | Planning after mission identity and artifact revision are known. Return unavailable lanes honestly. |
| `evaluateWheelsOffEligibility(...)` and delegation replay functions | Determines delegated mission-initiation eligibility | Alternate activation path only when signed delegation and exact eligibility evidence are supplied. |
| `validateMissionWorkspaceInput(...)` / `generatePRBody(...)` | Creates the approved Delivery Mission Workspace plan and body | After Coulson approval and committed brief; not part of proposed intake. |
| `prepareDeliveryWorkspaceForDispatch(...)` | Publishes/verifies the draft workspace and enforces the Fury plan gate | After approval and exact committed plan. Never use to create intake authority. |
| `evaluateHillReadinessV1(...)` | Non-authoritative artifact readiness classification | May evaluate the completed intake artifact later; it does not create or approve the brief. |
| `getMissionTransition(...)` / governance constructors | Applies explicit human governance decisions | After intake has stopped at the Coulson gate. |
| `canDispatchSpecialists(...)` | Checks dispatch eligibility | Must be false/not reached during proposed intake. |

## Functions explicitly outside `missionIntake(...)`

| Function | Why excluded |
| --- | --- |
| `runHelicarrierV0(...)` | Compiles an already prepared dispatch; intake has not authorized one. |
| `runRunnerCycle(...)` | Executes one already planned and authorized effect cycle. |
| `runMayControlLoop(...)` / `runMayToolCall(...)` | Performs implementation or validation effects after dispatch. |
| `runLocalToolSession(...)` | Performs Daisy reconnaissance after a bounded dispatch/authority decision. |
| `evaluatePermission(...)`, `createPermissionAuthorizer(...)`, `createAuditedExecutor(...)` | Authorizes and audits concrete runtime effects, not mission proposal. |
| `createExecutionEffectEntry(...)` | Converts a runner result candidate into authoritative effect history after execution. |
| `deliverGitHubCommunication(...)` | Performs an external publication effect after a journaled request. |
| `computeReviewPublicationAuthorityDigest(...)`, `validateReviewPublicationAuthorityV1(...)`, and `evaluateReviewPublicationV1(...)` | Evaluate exact authorized review-publication scope after signed human authority exists. Intake may name the future gate but cannot create its authority. |
| `createReviewPublicationAuthorizationEntry(...)` and `verifySignedReviewPublicationAuthorization(...)` | Consume exact Coulson-signed publication authority in journal v8; never intake helpers. |
| `resolveJournaledPublicationRequest(...)`, `evaluatePRPublicationScope(...)`, and GitHub publication-result helpers | Enforce and report an already journaled publication request before and after its effect. |
| Mack, QA, SonarQube, follow-up, and review-publication evaluators | Consume later validation/review evidence and cannot create intake authority. |

## Host responsibilities with no current package function

The first host must still supply these observations or adapters:

- read `.shield/config.json`;
- identify repository root, branch, base branch, and exact HEAD;
- retrieve the GitHub issue and bind its current revision/source reference;
- supply a trusted timestamp and provenance;
- supply the proposed objective, scope, complete risk flags, participants, and
  mode recommendations;
- load trusted human bindings when journal initialization is requested;
- persist a pre-authorization intake artifact when trusted bindings are not yet
  available;
- verify durable write/readback and report its receipt.

`missionIntake(...)` must distinguish host assertions from package-validated
facts in its result.

## Shared runtime instruction input

The human-supplied shared runtime rules are preserved at
`docs/missions/issue-130-shared-runtime-instructions.md`. They require the host
to supply seat, mission, repository, revision, authority, tools, and output
contract separately from the shared prompt.

The current `scripts/model/ask-local.mjs` path reads only one role file as the
system prompt and concatenates optional repository context into the user
prompt. No package function currently:

- composes shared runtime rules, a seat prompt, and a closed SHIELD context;
- validates the context block against mission/journal/runtime bindings;
- proves which exact instruction revisions were dispatched;
- or emits a durable dispatch receipt.

`missionIntake(...)` should identify the required shared-instruction reference
and context requirements in its Hill packet. It should not invoke a model.
Dispatch prompt composition belongs to the later single-cycle runtime seam.

## Mission communication file and surfaces

The local mission communication file is
`docs/missions/issue-130-agent-handoff.md`. It is the Hill-owned file-backed
handoff supplied to local seats. It is distinct from:

- the immutable/content-addressed Mission Brief;
- the authoritative append-only mission journal;
- the draft PR Mission Workspace used for human communication and review;
- and journaled adapter communication requests/results.

`missionIntake(...)` should return explicit references for the Mission Brief,
Hill-owned communication file, shared runtime instructions, and configured
future review surface. It must report each surface's state separately:

- `file_backed_unverified`;
- `journal_not_initialized` or verified journal identity;
- `mission_workspace_not_created` or verified PR receipt;
- `communication_not_configured`, queued, delivered, failed, or unknown.

The intake function must not publish the Mission Workspace or external
communications. It prepares the exact references and stop conditions that the
post-approval runtime will use.

## Reported local runtime availability

The human operator reported during Mission #130 intake that local May and Daisy
were healthy on the prior night. This is useful historical environment context,
but it is not current dispatch evidence and is not bound to the mission
revision.

Before either runtime participates in a later cycle, the trusted host must
obtain fresh evidence for:

- exact requested and observed model/runtime identity;
- current tool-protocol compatibility;
- current mission, repository, branch, and revision binding;
- active seat/runtime/executor binding;
- permitted tool capabilities and effect scope;
- durable dispatch and result receipts.

`missionIntake(...)` may carry the historical observation as
`human_reported_unverified`; it must not convert it into runtime readiness.

## Gaps discovered

### Recommendation versus activation

The Begin Mission playbook says modes are recommended before approval and
activated afterward. `SupervisedMissionBrief` contains only
`activatedModes`; there is no separate recommended-mode field or journal event
that activates modes after approval. Intake v1 must therefore:

- keep `brief.activatedModes` empty while the mission is proposed;
- return recommendations in a separate non-authoritative Hill packet; and
- report post-approval mode activation as an unsupported runtime gap rather
  than relabeling a recommendation as active.

### Seats versus human gates

The current brief schema requires Coulson and Fitz as `participants`. It does
not structurally distinguish dispatchable seats from non-dispatchable human
gates. Intake v1 must preserve schema compatibility while marking Coulson,
Fitz, and conditional Simmons as `human_gate` in its derived Hill packet. It
must never claim this derived label is already enforced by the mission schema.
Issue #124 owns the durable structural correction.

### Proposed intake persistence

The authoritative supervised journal begins only after a trusted binding
registry is available. There is no durable package contract for an unbound
pre-authorization intake draft. Intake v1 must either:

1. return a validated candidate for host persistence; or
2. initialize the journal only when exact trusted bindings are supplied.

It must not weaken `createMissionBegunEntry(...)` to make bootstrap easier.

### Issue identity

There is no public closed contract for GitHub issue intake or issue revision
binding. The host may provide an issue snapshot in v1, but the result must label
that snapshot `host_asserted` and retain its source reference. A later contract
may close this boundary if the proving mission demonstrates the need.

### Repository bootstrap

This repository currently lacks `.shield/config.json` and a trusted binding
registry. Self-intake of Issue #130 must therefore either stop honestly at
`configuration_missing` or use an explicitly labeled bootstrap input. It may
not claim that S.H.I.E.L.D. initialized or authorized itself.

## Proposed intake v1 shape

```ts
missionIntake({
  config,
  repositoryObservation,
  issueObservation,
  proposedBrief: {
    missionId,
    objective,
    subjectId,
    riskFlags,
    participants,
    requireSimmons,
    createdAt,
  },
  recommendedModes,
  trustedBindingRegistry?,
  persistence?,
})
```

The closed result should be one of:

- `candidate`: validated brief, risk decision, recommendations, requirements,
  human-gate stops, host-assertion provenance, and blockers;
- `begun`: the same packet plus durable journal path, replay projection, and
  verified readback receipt;
- `blocked`: closed reason codes and no authority or persistence claim.

The first implementation should prefer `candidate` and optionally `begun`.
It should not include dispatch or execution behavior.

## Dogfood proof

Run the public `missionIntake(...)` function against Issue #130 using:

- the exact repository and issue snapshot;
- the human-approved bootstrap objective and risk flags;
- explicit `host_asserted` provenance;
- no fabricated trusted binding registry.

Expected honest outcome:

- a validated, content-addressed intake candidate;
- high-risk/explicit-approval classification because `hillHighRisk` is true;
- Delivery Mode listed as recommended but not activated;
- Coulson and Fitz represented as derived human-gate stops;
- durable journal initialization blocked until repository configuration and
  trusted bindings exist.

That outcome counts as runtime participation because package code constructs
and validates the intake candidate. It does not count as mission authorization,
dispatch, or execution.
