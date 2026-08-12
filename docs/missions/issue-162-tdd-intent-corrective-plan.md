# Issue #162 — proportionate corrective plan

## Exact mission identity

- Lane: Bravo Lane Hill correction 2
- Mission: `mission:issue-162-bravo-correction-2`
- Subject: `github:RanSolo/shield-workspace/issue/162`
- Worktree: `/private/tmp/shield-162-bravo.yMZTJ7`
- Branch: `agent/issue-162-tdd-intent`
- Preserved implementation revision: `87c889769093fe000d4bb0ef45c1da80bdb6f321`
- Preserved implementation tree: `4053d95c87485d55c99e2c92ab1d27d229e25b74`
- Corrective brief: `docs/missions/issue-162-tdd-intent-corrective-brief.json`
- Original plan: `docs/missions/issue-162-tdd-intent-plan.md`

This revision replaces the oversized correction-1 execution route. It preserves
the original implementation and all Fury/Mack evidence as historical input; it
does not retrospectively authorize prior commits. The plan grants no production
edit, test rewrite, publication, merge, deployment, release, final acceptance,
or human decision.

## Preserved evidence and useful implementation

- Preserved implementation: eight issue #162 commits ending at `87c8897...`.
- Mack evidence at that exact revision: focused `35/35`, Nx build PASS, full Nx
  test `1224/1224`, combined exit `0`.
- Fury complete conformance verdict at that revision: `REVISE`, eleven findings.
- Useful behavior retained: risk-selected strategy, criterion traceability,
  packet-size limits, reviewed Red classification, scaffold-not-PASS,
  amendment evidence, authority-gated Green, optional separate Refactor,
  immutable decision output, stable reason codes, public package export, and
  exact-evidence foundations.

Prior mission journals and correction-1 planning commits remain evidence only.
Correction-2 requires exact-plan Fury PASS and fresh Coulson authority before
May may edit production code or tests.

## Proportionate scope

Correct only the seven defects that directly prevent the original frozen
AC-162-4 through AC-162-6 behavior from being truthful and complete:

| Finding | Original intent | Required result |
| --- | --- | --- |
| F6 | Acceptance-contract identity and stale-evidence closure | Derive the digest canonically from behavior-bearing contract content and reject caller substitution |
| F3 | Expectation amendment gate | A complete amendment enters generation `N+1` and can complete only with fresh strategy/Red, authority, and downstream evidence |
| F4 | Bounded Green and focused validation | Enforce observed paths/effects and exact configured checkpoint/command evidence |
| F7 | Separate Green and Refactor | Require distinct exact authority and focused proof for Green and optional Refactor |
| F2 | Exact terminal routing | Final cumulative Mack and Fury receipts equal the current mission HEAD/tree |
| F8 | Truthful executable evidence | Contradictory PASS exit/count combinations fail closed |
| F11 | Public package contract | Document `/tdd-mission` and prove documentation/export agreement |

AC-162-1 through AC-162-3 receive regression coverage only. No existing useful
behavior is redesigned merely to support the correction.

## Explicit exclusions

- F5 hosted-Mack producer/store/readback or any other durable-Mack platform
  capability; #162 remains the pure evaluator slice and does not enter #247.
- Generalized F9 runtime/model/executor domain hardening or pairwise-identity
  policy beyond preserving existing exact metadata checks.
- Generalized F10 hostile proxy hardening beyond preserving existing immutable
  input and revoked-proxy behavior.
- A runner, mission journal store, CLI, UI, new test framework, model invocation,
  Guided QA #238, external effect executor, or unrelated cleanup.
- Publication execution, PR creation/update, external communication, merge,
  deployment, release, final acceptance, or changed/removed expectations.

F1 is not a product packet. It is satisfied operationally only by this fresh
mission, exact-plan Fury PASS, fresh Coulson Wheels Up, and current May binding.

## Contract boundaries shared by all packets

- Keep `tdd.mission.v1` pure, host-neutral, deterministic, side-effect-free,
  and non-authoritative. Preserve valid generation-zero behavior through the
  explicit compatibility rule below rather than accepting both old and new
  closed shapes ambiguously.
- Preserve closed shapes, stable reason codes, frozen outputs, seat ownership,
  one-to-three criterion packet policy, and original amendment/Fitz gates.
- Use the exact acceptance-identity algorithm frozen in Packet A; no caller,
  evidence receipt, or repository observation selects contract identity.
- A test change may add the reviewed regression contract; it may not weaken or
  remove an expectation. Any changed/removed expectation stops for Fitz.
- Each packet receives complete Fury review after focused Mack validation. Fury
  review has no finding-count cutoff.

## Dependency-ordered behavioral packets

### Packet A — acceptance identity and amendment re-entry (F6 + F3)

- Acceptance criteria: AC-162-4 and AC-162-6.
- Invariant: behavior-bearing acceptance material has one content-derived
  identity, and amendments complete only through a fresh generation.
- Paths:
  - `packages/shield-team-system/src/tdd-mission-v1.mts`
  - `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
- Required behavior:
  - add required `contractGeneration` to the contract and every strategy,
    selected-TDD `contract_prepared`, Red/declined-strategy, authority, Green,
    Refactor, focused Mack, terminal Mack, Fury, amendment, and disposition
    record;
  - define generation as a nonnegative JavaScript safe integer, with initial
    generation `0` and amendments only on an exact contiguous `N -> N+1` edge;
  - compute the exact content-derived digest defined below;
  - reject a supplied/reviewed digest that does not match;
  - bind strategy, Red/declined strategy, authority, Green, Refactor, Mack,
    Fury, and disposition evidence to one nonnegative generation;
  - invalidate generation `N` receipts after amendment and allow both selected
    and declined strategies to complete through valid fresh `N+1` evidence.
- Focused proof: golden digest, permitted set reordering, behavior-bearing
  mutation, selected amendment re-entry, declined amendment re-entry, stale
  generation substitution, and stale prepared-scaffold substitution.
- Stop: changing the original Fitz gate or hashing evidence outcomes/IDs.
- Successor: complete focused Mack evidence, complete Fury packet review, then B.

F6 and F3 are coupled because generation freshness is defined by the same
content-derived acceptance identity; splitting them would create a temporary
caller-selected generation boundary.

#### Exact acceptance-identity contract

The normalized digest projection contains exactly:

- top level: `schemaVersion`, `contractVersion`, `contractGeneration`,
  normalized `criteria`, and normalized `packets`;
- each criterion: `criterionId`, `strategy`, `rationale`, `riskFactors`,
  `laterValidation`, `disposition`, the executable contract's `contractId`,
  `kind`, `checkpointId`, and `expectedBehavior` or explicit `null`, and
  traceability `planRequirementId`, `mackCheckpointId`, `mayPacketId`, and
  `humanReviewId`;
- each packet: `packetId`, `criterionIds`, `couplingRationale`, `minimalPaths`,
  `requiredInterfaces`, `allowedEffects`, `focusedValidation` as closed
  `{checkpointId, commandId, command, executableKind}` entries where
  `executableKind` is exactly `build` or `test`, `expectedOutput`,
  `stopConditions`, and scalar `successor`.

It excludes the supplied/reviewed digest itself, all downstream evidence and
receipt IDs except the criterion's explicitly retained `humanReviewId`,
evidence outcomes, amendments and their human evidence, implementation and
review revisions/trees, runtime identities, repository observations, and every
other downstream receipt. `humanReviewId` is retained because it is the frozen
acceptance requirement for a human checkpoint, not proof that the checkpoint
occurred. `contractGeneration` is digest material: reverting content at a later
generation intentionally produces a different digest.

Normalize to ordinary JSON. Exactly three projected fields admit `null`:
criterion `preImplementationContract` for `tdd_declined`, traceability
`humanReviewId` when no human checkpoint is required, and packet
`couplingRationale` for a one-criterion packet. All other projected values are
null-free. Sort criteria by `criterionId` and packets by `packetId` using
JavaScript code-unit order. Treat `riskFactors`, packet
`criterionIds`, `minimalPaths`, `requiredInterfaces`, `allowedEffects`,
`focusedValidation`, and `stopConditions` as duplicate-free sets sorted by the
code-unit ordering of each item's complete canonical JSON. Preserve no other
caller array order; packet dependency order is represented by `packetId` plus
the scalar `successor`. Duplicate set members are invalid, not collapsed.

Serialize with the repository `canonicalJson(...)`: recursively sort ordinary
object keys by JavaScript code-unit order, preserve normalized arrays, UTF-8
encode `JSON.stringify` with no whitespace, then form these exact bytes:

```text
UTF8("tdd.mission.v1\u0000acceptance-contract\u0000")
|| UTF8(decimal(payload.byteLength)) || UTF8(":") || payload
```

SHA-256 those bytes and return `sha256:` plus RFC 4648 base64url without
padding. The algorithm golden uses payload
`{"contractGeneration":0,"contractVersion":"tdd.mission.v1","criteria":[],"packets":[],"schemaVersion":1}`
(104 UTF-8 bytes), preimage
`tdd.mission.v1\u0000acceptance-contract\u0000104:{"contractGeneration":0,"contractVersion":"tdd.mission.v1","criteria":[],"packets":[],"schemaVersion":1}`,
and digest `sha256:cmUeaevhL6GckHGcclInnDdHUnXPSabx14PBwSSOAik`.

A nonempty golden covers selected and declined criteria, retained and null
`humanReviewId`, and one-criterion packets with null coupling rationale. Its
canonical payload is exactly:

```json
{"contractGeneration":0,"contractVersion":"tdd.mission.v1","criteria":[{"criterionId":"AC-A","disposition":"implemented_and_proven","laterValidation":"required","preImplementationContract":{"checkpointId":"checkpoint:A","contractId":"contract:A","expectedBehavior":"A holds","kind":"executable"},"rationale":"closed behavior","riskFactors":["regression"],"strategy":"tdd_selected","traceability":{"humanReviewId":null,"mackCheckpointId":"checkpoint:A","mayPacketId":"packet:A","planRequirementId":"requirement:A"}},{"criterionId":"AC-B","disposition":"implemented_and_proven","laterValidation":"required","preImplementationContract":null,"rationale":"documentation only","riskFactors":["documentation"],"strategy":"tdd_declined","traceability":{"humanReviewId":"review:human:B","mackCheckpointId":"checkpoint:B","mayPacketId":"packet:B","planRequirementId":"requirement:B"}}],"packets":[{"allowedEffects":["effect:a"],"couplingRationale":null,"criterionIds":["AC-A"],"expectedOutput":"A passes","focusedValidation":[{"checkpointId":"checkpoint:A","command":"node --test a.test.mjs","commandId":"validation:A","executableKind":"test"}],"minimalPaths":["src/a.mts"],"packetId":"packet:A","requiredInterfaces":["interface:a"],"stopConditions":["scope changes"],"successor":"packet:B"},{"allowedEffects":["effect:b"],"couplingRationale":null,"criterionIds":["AC-B"],"expectedOutput":"B passes","focusedValidation":[{"checkpointId":"checkpoint:B","command":"node --test b.test.mjs","commandId":"validation:B","executableKind":"test"}],"minimalPaths":["docs/b.md"],"packetId":"packet:B","requiredInterfaces":["interface:b"],"stopConditions":["scope changes"],"successor":"mission_complete"}],"schemaVersion":1}
```

It is 1704 UTF-8 bytes and produces
`sha256:MiT1bN3hYDmYWkHLdQJ-NO_ZFdspbVGqOfZ3acZ5TPo` under the same frame.

The closed V1 input now requires generation explicitly. Existing retained
no-amendment fixtures are mechanically migrated to `contractGeneration: 0` in
the same test packet; no dual-shape runtime compatibility is admitted. A
complete amendment remains represented as an exact old/new snapshot and edge,
but no longer blocks once the active contract is the new digest/generation and
all fresh evidence matches it. Selected TDD re-enters reviewed Red; declined
TDD re-enters a freshly justified strategy without manufacturing Red. Both then
require fresh Coulson authority, Green, optional Refactor, terminal Mack/Fury,
and disposition evidence at `N+1`.

The evaluation input adds a closed `reviewedPredecessorContract` field. It is
`null` exactly at generation zero. At generation `N+1` it contains exactly
`contractGeneration`, `acceptanceContractDigest`, `snapshot`, and `furyReview`.
The snapshot is the complete normalized digest projection defined above. Its
generation must be `N` and its digest must recompute. `furyReview` contains
exactly a globally unique evidence ID, reviewer seat `fury`, mission ID, plan
digest, generation, acceptance digest, reviewed revision/tree, disposition
`approved`, and nonempty source references. Those bindings must all match the
predecessor triple, making this exact Fury record the predecessor anchor
independent of every criterion amendment.

The amendment closed shape contains `oldContractGeneration`,
`oldContractDigest`, `oldContractSnapshot`, `amendedContractGeneration`,
`amendedContractDigest`, and `amendedContractSnapshot`. Each snapshot is the
complete normalized digest projection defined above, with no evidence or
amendment fields. The old generation is the active predecessor `N`; the amended
generation must equal exactly `N+1` without safe-integer overflow. Each digest
must recompute from its paired snapshot and generation. The old triple must
equal the independent top-level `reviewedPredecessorContract`; the amended
triple must equal the active normalized strategy contract supplied to the
evaluation. Generation zero forbids an amendment. Reordered, skipped, reused,
mismatched, self-consistent-but-unreviewed, or otherwise unanchored edges block.
Every nonzero active generation requires at least one criterion amendment for
its `N -> N+1` edge; every amendment on that edge must carry the same unique
`edgeId`, the same old/new triples, and the same
`predecessorFuryReviewEvidenceId`. The referenced ID must equal the top-level
Fury anchor and may not be reused by another edge.
After an amendment, selected TDD requires a fresh prepared-scaffold record at
`N+1`, bound to the amended digest, before fresh reviewed Red.

### Packet B — bounded execution and distinct transition proof (F4 + F7)

- Acceptance criteria: AC-162-2 and AC-162-5.
- Invariant: Green and optional Refactor are separate exact transitions whose
  observed scope and validation are enforced by the packet contract.
- Paths: Packet A source and focused-test paths only.
- Required behavior:
  - represent focused validation as closed
    `{checkpointId, commandId, command, executableKind}` entries;
  - require unique observed paths/effects to remain within packet bounds;
  - require executed checkpoint and command identity to match the packet;
  - require distinct Green and Refactor authority plus focused Mack proof;
  - preserve cumulative validation as a separate terminal stage.
- Focused proof: path/effect/command/checkpoint substitution, missing or replayed
  authority, Green-as-Refactor proof reuse, and valid Green-only/Green+Refactor
  flows.
- Stop: adding an executor or treating evaluator evidence as authority.
- Successor: complete focused Mack evidence, complete Fury packet review, then C.

F4 and F7 are coupled because the packet contract is the authority and proof
boundary for both transitions.

Green and Refactor use closed transition records containing mission ID, plan
digest, `contractGeneration`, criterion ID, packet ID, acceptance digest,
repository ID, branch, predecessor revision/tree, result revision/tree,
`green` or `refactor` transition kind, unique nonempty observed paths and
effects, authority reference, checkpoint ID, command ID, literal command,
outcome, and evidence identity. Observed paths/effects must be unique nonempty
subsets of packet `minimalPaths`/`allowedEffects`; checkpoint, command ID, and
literal command must equal one packet validation entry. Green and Refactor
have separate Coulson authority identities and separate Mack proof identities;
neither may be replayed across transition kinds. Refactor follows Green at a
different revision, retains the same digest/generation, and explicitly
preserves behavior, failure, authority, persistence, and risk semantics.

Each realized transition has its own closed Mack packet-validation bundle. It
contains exactly `bundleId`, `transitionKind` (`green` or `refactor`), mission,
plan, contract digest/generation, packet ID, transition evidence ID, exact
result revision/tree, Mack seat/runtime/model/executor identity, and executable
receipts. It contains exactly one receipt for every checkpoint declared for
that packet in the validation table. Receipt checkpoint ID, command ID, literal
command, and executable kind must match collision-free; no declared checkpoint
may be omitted or duplicated. Green and Refactor bundles and all nested receipt
IDs must be pairwise disjoint, and each bundle binds its own transition result
revision/tree. The transition's focused proof identity references the focused
receipt in that transition's complete bundle.

Each realized transition also has one closed packet-Fury-review record with a
unique review ID, Fury seat/runtime/model/executor identity, mission/plan,
contract digest/generation, packet ID, transition kind/evidence ID, exact result
revision/tree, referenced Mack bundle ID, verdict `PASS`, findings array, and
source references. Green and Refactor review IDs are distinct. Terminal Fury
evidence references every realized packet-Fury-review record exactly once.

### Packet C — exact terminal closure and truthful outcomes (F2 + F8)

- Acceptance criterion: AC-162-6.
- Invariant: mission completion uses truthful executable evidence bound to the
  exact final HEAD and tree.
- Paths: Packet A source and focused-test paths only.
- Required behavior:
  - require one mission-scoped cumulative Mack bundle and one Fury terminal
    receipt at `headRevisionId` and `headTreeDigest`;
  - retain packet Green/Refactor revisions as traceability rather than treating
    them as final mission HEAD;
  - for PASS require exit `0`, no failed/cancelled tests, nonnegative counts,
    and an internally consistent total;
  - reject later-HEAD, tree substitution, bad sums, negative counts, and
    contradictory outcome/exit combinations.
- Focused proof: current exact final evidence completes; every listed stale or
  contradictory variant blocks deterministically.
- Stop: requiring a durable hosted-Mack store or changing runtime topology.
- Successor: complete focused Mack evidence, complete Fury packet review, then D.

F2 and F8 are coupled because both close the eligibility semantics of the same
terminal validation receipts.

The Mack bundle contains exactly the three terminal command receipts in the
validation table plus repository observations for canonical root, repository,
branch, HEAD, tree, changed paths, and tracked-clean state. It references all
packet Mack reviews and criterion dispositions. The single Fury receipt is
non-executable, matches the same HEAD/tree, and references that whole bundle,
all four complete packet Fury reviews, and every criterion disposition. Any
later HEAD/tree stales both.

Executable evidence semantics are closed, and every receipt's `executableKind`
must exactly match its digest-bearing validation entry. Test PASS requires exit
`0`, safe nonnegative `total/passed/failed/skipped/cancelled/todo`, zero
failed/cancelled, and an exact sum to total; build PASS requires exit `0` and
null counts;
failed executable evidence requires outcome `failed`, a nonzero exit, and
`failureClassification` equal to exactly `product_defect`,
`environment_failure`, or `harness_defect`. For a failed test,
`product_defect` requires nonnull internally consistent counts with `failed > 0`;
`environment_failure` and `harness_defect` require null counts and respectively
an `environment:` or `harness:` source reference. A failed build requires null
counts; `product_defect` requires a `diagnostic:` source reference and the other
two classifications require their corresponding source-reference prefix.
`missing_behavior`, `stale_expectation`, `authority_failure`, and
`insufficient_evidence` are never valid post-implementation command-receipt
classifications. Focused negatives cover each class/command/count/source
mismatch. Fury and other non-executable receipts carry no command, exit,
counts, classification, or cache record. Cache evidence is optional and present
only when emitted.

### Packet D — public contract documentation (F11)

- Acceptance criterion: AC-162-6.
- Invariant: supported package exports and documented public specifiers agree.
- Paths:
  - `packages/shield-team-system/PUBLIC_API.md`
  - `packages/shield-team-system/tests/package-surface.test.mjs`
- Required behavior: document `@shield/team-system/tdd-mission` as a pure,
  host-neutral, non-authoritative evaluator with no signing, append, dispatch,
  test execution, publication, or human-decision effect; add executable
  documentation/export agreement coverage.
- Focused proof: package-surface test passes against the current build.
- Stop: package export or wrapper redesign; those already exist.
- Successor: cumulative exact-head Mack validation, then full Fury conformance.

## Validation contract

Every checkpoint maps collision-free to one literal command:

| Packet/stage | Checkpoint ID | Command ID | Kind | Literal command |
| --- | --- | --- | --- | --- |
| A build | `checkpoint:issue-162:A:build` | `validation:issue-162:nx-build` | `build` | `npm exec nx run @shield/team-system:build` |
| A focused | `checkpoint:issue-162:A:focused` | `validation:issue-162:focused-node-test` | `test` | `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs` |
| B build | `checkpoint:issue-162:B:build` | `validation:issue-162:nx-build` | `build` | `npm exec nx run @shield/team-system:build` |
| B focused | `checkpoint:issue-162:B:focused` | `validation:issue-162:focused-node-test` | `test` | `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs` |
| C build | `checkpoint:issue-162:C:build` | `validation:issue-162:nx-build` | `build` | `npm exec nx run @shield/team-system:build` |
| C focused | `checkpoint:issue-162:C:focused` | `validation:issue-162:focused-node-test` | `test` | `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs` |
| D build | `checkpoint:issue-162:D:build` | `validation:issue-162:nx-build` | `build` | `npm exec nx run @shield/team-system:build` |
| D focused | `checkpoint:issue-162:D:package-surface` | `validation:issue-162:package-surface-test` | `test` | `node --test packages/shield-team-system/tests/package-surface.test.mjs` |
| terminal focused | `checkpoint:issue-162:terminal:focused` | `validation:issue-162:focused-node-test` | `test` | `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs` |
| terminal build | `checkpoint:issue-162:terminal:build` | `validation:issue-162:nx-build` | `build` | `npm exec nx run @shield/team-system:build` |
| terminal suite | `checkpoint:issue-162:terminal:test` | `validation:issue-162:nx-test` | `test` | `npm exec nx run @shield/team-system:test` |

The packet-qualified checkpoint plus command ID is the unique mapping key.
Mack also performs exact root/repository/branch/HEAD/tree, changed-path, and
tracked-clean observations in the terminal bundle.

Record commands, cwd, exact start/end HEAD and tree, exit codes, available test
counts, cache disposition only when emitted, runtime/model/executor identity,
packet/criterion references, and source references. Focused PASS routes to a
complete Fury review of that packet. Final Mack PASS routes to complete Fury
conformance. Fury `REVISE` routes unchanged-scope corrections through the
smallest affected packet and fresh evidence.

## Fresh implementation authority envelope

- Base revision: `87c889769093fe000d4bb0ef45c1da80bdb6f321`.
- Authority HEAD: the exact Fury-approved commit containing this brief and plan.
- Approved paths:
  - `packages/shield-team-system/PUBLIC_API.md`
  - `packages/shield-team-system/src/tdd-mission-v1.mts`
  - `packages/shield-team-system/tests/package-surface.test.mjs`
  - `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
- Actions: `repository.git_commit`, `repository.run_validation`,
  `repository.write_file`.
- Effect classes: `behavioral_implementation`, `coordination`, `verification`.
- Effect keys: `effect:issue-162:implementation`,
  `effect:issue-162:packet-commits`, `effect:issue-162:validation`.
- Capabilities: `filesystem_write`, `git_write`, `process_execute`.
- May model/runtime/executor: `gpt-5.6-sol`,
  `runtime:codex-hosted-may-sol`,
  `executor:codex-hosted-workspace-tools`.
- Validation IDs: `validation:issue-162:focused-node-test`,
  `validation:issue-162:nx-build`, `validation:issue-162:nx-test`,
  `validation:issue-162:package-surface-test`.

## Exact schema-9 preparation

After this corrected plan is committed and receives exact-revision Fury PASS,
Hill prepares `.shield/tmp/issue-162-correction-2-authorize-wheels-up.json` with
exactly this closed, sorted content:

```json
{
  "baseRevision": "87c889769093fe000d4bb0ef45c1da80bdb6f321",
  "modelId": "gpt-5.6-sol",
  "approvedRelativePaths": [
    "packages/shield-team-system/PUBLIC_API.md",
    "packages/shield-team-system/src/tdd-mission-v1.mts",
    "packages/shield-team-system/tests/package-surface.test.mjs",
    "packages/shield-team-system/tests/tdd-mission-v1.test.mjs"
  ],
  "approvedActionIds": ["repository.git_commit", "repository.run_validation", "repository.write_file"],
  "approvedEffectClasses": ["behavioral_implementation", "coordination", "verification"],
  "approvedEffectKeys": ["effect:issue-162:implementation", "effect:issue-162:packet-commits", "effect:issue-162:validation"],
  "approvedCapabilities": ["filesystem_write", "git_write", "process_execute"],
  "validationCommandIds": [
    "validation:issue-162:focused-node-test",
    "validation:issue-162:nx-build",
    "validation:issue-162:nx-test",
    "validation:issue-162:package-surface-test"
  ],
  "reasoningRuntimeId": "runtime:codex-hosted-may-sol",
  "toolExecutorId": "executor:codex-hosted-workspace-tools",
  "publicationPaths": [
    "docs/missions/issue-162-tdd-intent-corrective-brief.json",
    "docs/missions/issue-162-tdd-intent-corrective-plan.md"
  ]
}
```

Hill also prepares
`.shield/tmp/issue-162-correction-2-fury-pass-binding.json`. It is a closed JSON
object containing exactly `seatId: "fury"`, `verdict: "PLAN PASS"`, the
40-lowercase-hex `headRevision` and `headTree` from that terminal review, the
64-lowercase-hex `planSha256`, the absolute `reviewArtifactPath`, and its
64-lowercase-hex `reviewArtifactSha256`. The artifact is the complete output of
the Fury process that reviewed that same HEAD/tree, not a Hill-authored verdict.
The Fury prompt requires exactly one terminal line beginning
`SHIELD_FURY_PLAN_REVIEW_V1 ` followed by canonical single-line JSON containing
exactly `headRevision`, `headTree`, `planSha256`, `seatId`, and `verdict`.
Preparation parses that marker from the complete raw artifact and requires all
five values to equal the binding; duplicate, missing, malformed, noncanonical,
or semantically mismatched markers block.

Use this exact begin and verification sequence. The repository-supported Nx
build is deliberately rerun after the review binding checks; the ignored
`dist` CLI is therefore generated from the exact reviewed source before use,
not trusted as a pre-existing artifact.

```sh
cd /private/tmp/shield-162-bravo.yMZTJ7
set -eu
review_binding=.shield/tmp/issue-162-correction-2-fury-pass-binding.json
node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const k=["headRevision","headTree","planSha256","reviewArtifactPath","reviewArtifactSha256","seatId","verdict"],mk=["headRevision","headTree","planSha256","seatId","verdict"];if(JSON.stringify(Object.keys(v).sort())!==JSON.stringify(k)||v.seatId!=="fury"||v.verdict!=="PLAN PASS"||!/^([0-9a-f]{40})$/.test(v.headRevision)||!/^([0-9a-f]{40})$/.test(v.headTree)||!/^([0-9a-f]{64})$/.test(v.planSha256)||!/^([0-9a-f]{64})$/.test(v.reviewArtifactSha256)||typeof v.reviewArtifactPath!=="string"||!v.reviewArtifactPath.startsWith("/"))process.exit(1);const p="SHIELD_FURY_PLAN_REVIEW_V1 ",lines=fs.readFileSync(v.reviewArtifactPath,"utf8").split(/\r?\n/u).filter(x=>x.startsWith(p));if(lines.length!==1)process.exit(1);const raw=lines[0].slice(p.length),m=JSON.parse(raw);if(JSON.stringify(Object.keys(m).sort())!==JSON.stringify(mk)||JSON.stringify(m)!==raw||mk.some(x=>m[x]!==v[x]))process.exit(1)' "$review_binding"
reviewed_head="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headRevision)' "$review_binding")"
reviewed_tree="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headTree)' "$review_binding")"
reviewed_plan_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).planSha256)' "$review_binding")"
review_artifact="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactPath)' "$review_binding")"
review_artifact_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactSha256)' "$review_binding")"
test "$(git rev-parse HEAD^{commit})" = "$reviewed_head"
test "$(git rev-parse HEAD^{tree})" = "$reviewed_tree"
test "$(shasum -a 256 docs/missions/issue-162-tdd-intent-corrective-plan.md | awk '{print $1}')" = "$reviewed_plan_sha"
test "$(shasum -a 256 "$review_artifact" | awk '{print $1}')" = "$review_artifact_sha"
test "$(git diff --name-only --no-renames 87c889769093fe000d4bb0ef45c1da80bdb6f321 HEAD --)" = "$(printf '%s\n' docs/missions/issue-162-tdd-intent-corrective-brief.json docs/missions/issue-162-tdd-intent-corrective-plan.md)"
NX_SKIP_NX_CACHE=true npm exec nx run @shield/team-system:build
test -f packages/shield-team-system/dist/cli.mjs
node packages/shield-team-system/dist/cli.mjs mission begin --profile-aware --brief docs/missions/issue-162-tdd-intent-corrective-brief.json --root /private/tmp/shield-162-bravo.yMZTJ7 --json
node packages/shield-team-system/dist/cli.mjs mission status --mission-id mission:issue-162-bravo-correction-2 --root /private/tmp/shield-162-bravo.yMZTJ7 --json
test "$(wc -l < .shield/journals/bWlzc2lvbjppc3N1ZS0xNjItYnJhdm8tY29ycmVjdGlvbi0y.jsonl)" -eq 1
shasum -a 256 .shield/journals/bWlzc2lvbjppc3N1ZS0xNjItYnJhdm8tY29ycmVjdGlvbi0y.jsonl
```

The status must be schema 9 with authorization waiting, implementation not
started, no implementation/runtime/publication authority, and final acceptance
waiting. Before the PIN gate verify exact root,
configured and origin repository `RanSolo/shield-workspace`, attached branch,
reviewed HEAD/tree and plan digest, base ancestry, two-path base-to-HEAD diff,
ordinary non-symlink/non-gitlink publication paths, closed sorted authority
input, and completely empty `git status --porcelain`.

The current untracked `node_modules` is exactly a symbolic link to
`/Users/ransolo/Code/shield-workspace/node_modules`; it must remain uncommitted
and be restored byte-for-byte as that link. The hold path is exactly
`/private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold` and must be
absent as both an entry and symlink before use. No trailing slash may be used.

Hill performs this exact nonmutating preview before surfacing the gate. It is
informational only because the live invocation creates a fresh timestamp; the
same-invocation live manifest is the only manifest Coulson may sign.

```sh
cd /private/tmp/shield-162-bravo.yMZTJ7
set -eu
review_binding=.shield/tmp/issue-162-correction-2-fury-pass-binding.json
node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const k=["headRevision","headTree","planSha256","reviewArtifactPath","reviewArtifactSha256","seatId","verdict"],mk=["headRevision","headTree","planSha256","seatId","verdict"];if(JSON.stringify(Object.keys(v).sort())!==JSON.stringify(k)||v.seatId!=="fury"||v.verdict!=="PLAN PASS"||!/^([0-9a-f]{40})$/.test(v.headRevision)||!/^([0-9a-f]{40})$/.test(v.headTree)||!/^([0-9a-f]{64})$/.test(v.planSha256)||!/^([0-9a-f]{64})$/.test(v.reviewArtifactSha256)||typeof v.reviewArtifactPath!=="string"||!v.reviewArtifactPath.startsWith("/"))process.exit(1);const p="SHIELD_FURY_PLAN_REVIEW_V1 ",lines=fs.readFileSync(v.reviewArtifactPath,"utf8").split(/\r?\n/u).filter(x=>x.startsWith(p));if(lines.length!==1)process.exit(1);const raw=lines[0].slice(p.length),m=JSON.parse(raw);if(JSON.stringify(Object.keys(m).sort())!==JSON.stringify(mk)||JSON.stringify(m)!==raw||mk.some(x=>m[x]!==v[x]))process.exit(1)' "$review_binding"
reviewed_head="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headRevision)' "$review_binding")"
reviewed_tree="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headTree)' "$review_binding")"
reviewed_plan_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).planSha256)' "$review_binding")"
review_artifact="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactPath)' "$review_binding")"
review_artifact_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactSha256)' "$review_binding")"
test "$(git rev-parse HEAD^{commit})" = "$reviewed_head"
test "$(git rev-parse HEAD^{tree})" = "$reviewed_tree"
test "$(shasum -a 256 docs/missions/issue-162-tdd-intent-corrective-plan.md | awk '{print $1}')" = "$reviewed_plan_sha"
test "$(shasum -a 256 "$review_artifact" | awk '{print $1}')" = "$review_artifact_sha"
NX_SKIP_NX_CACHE=true npm exec nx run @shield/team-system:build
test -f packages/shield-team-system/dist/cli.mjs
test -L node_modules
test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules"
test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold
test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold
before="$(shasum -a 256 .shield/journals/bWlzc2lvbjppc3N1ZS0xNjItYnJhdm8tY29ycmVjdGlvbi0y.jsonl | awk '{print $1}')"
restore_issue162_preview_node_modules() { if test -L node_modules && test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules" && test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold; then trap - EXIT HUP INT TERM; return 0; fi; test -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && test "$(readlink /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold)" = "/Users/ransolo/Code/shield-workspace/node_modules" && test ! -e node_modules && test ! -L node_modules && mv /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold node_modules && test -L node_modules && test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules" || return 1; trap - EXIT HUP INT TERM; }
trap 'restore_issue162_preview_node_modules || exit 125' EXIT
trap 'restore_issue162_preview_node_modules || exit 125; exit 130' HUP INT TERM
mv node_modules /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold
test -z "$(git status --porcelain=v1 --untracked-files=all)"
if node packages/shield-team-system/dist/cli.mjs mission authorize-wheels-up --mission-id mission:issue-162-bravo-correction-2 --input .shield/tmp/issue-162-correction-2-authorize-wheels-up.json --root /private/tmp/shield-162-bravo.yMZTJ7 --json </dev/null; then exit 1; fi
after="$(shasum -a 256 .shield/journals/bWlzc2lvbjppc3N1ZS0xNjItYnJhdm8tY29ycmVjdGlvbi0y.jsonl | awk '{print $1}')"
test "$before" = "$after"
restore_issue162_preview_node_modules
test -L node_modules
test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules"
test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold
test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold
```

The exact interactive gate command uses a restoration trap and invokes the
repository CLI directly. Coulson must inspect the complete live manifest
emitted to stderr by this invocation before deciding whether to enter the
passcode; `--json` retains the interactive TTY prompt while exposing the framed
canonical manifest instead of the abbreviated `--human` rendering:

```sh
cd /private/tmp/shield-162-bravo.yMZTJ7 && \
review_binding=.shield/tmp/issue-162-correction-2-fury-pass-binding.json && \
node -e 'const fs=require("node:fs");const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const k=["headRevision","headTree","planSha256","reviewArtifactPath","reviewArtifactSha256","seatId","verdict"],mk=["headRevision","headTree","planSha256","seatId","verdict"];if(JSON.stringify(Object.keys(v).sort())!==JSON.stringify(k)||v.seatId!=="fury"||v.verdict!=="PLAN PASS"||!/^([0-9a-f]{40})$/.test(v.headRevision)||!/^([0-9a-f]{40})$/.test(v.headTree)||!/^([0-9a-f]{64})$/.test(v.planSha256)||!/^([0-9a-f]{64})$/.test(v.reviewArtifactSha256)||typeof v.reviewArtifactPath!=="string"||!v.reviewArtifactPath.startsWith("/"))process.exit(1);const p="SHIELD_FURY_PLAN_REVIEW_V1 ",lines=fs.readFileSync(v.reviewArtifactPath,"utf8").split(/\r?\n/u).filter(x=>x.startsWith(p));if(lines.length!==1)process.exit(1);const raw=lines[0].slice(p.length),m=JSON.parse(raw);if(JSON.stringify(Object.keys(m).sort())!==JSON.stringify(mk)||JSON.stringify(m)!==raw||mk.some(x=>m[x]!==v[x]))process.exit(1)' "$review_binding" && \
reviewed_head="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headRevision)' "$review_binding")" && \
reviewed_tree="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).headTree)' "$review_binding")" && \
reviewed_plan_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).planSha256)' "$review_binding")" && \
review_artifact="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactPath)' "$review_binding")" && \
review_artifact_sha="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).reviewArtifactSha256)' "$review_binding")" && \
test "$(git rev-parse HEAD^{commit})" = "$reviewed_head" && \
test "$(git rev-parse HEAD^{tree})" = "$reviewed_tree" && \
test "$(shasum -a 256 docs/missions/issue-162-tdd-intent-corrective-plan.md | awk '{print $1}')" = "$reviewed_plan_sha" && \
test "$(shasum -a 256 "$review_artifact" | awk '{print $1}')" = "$review_artifact_sha" && \
NX_SKIP_NX_CACHE=true npm exec nx run @shield/team-system:build && \
test -f packages/shield-team-system/dist/cli.mjs && \
test -L node_modules && \
test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules" && \
test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && \
test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && \
restore_issue162_node_modules() { if test -L node_modules && test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules" && test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold; then trap - EXIT HUP INT TERM; return 0; fi; test -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && test "$(readlink /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold)" = "/Users/ransolo/Code/shield-workspace/node_modules" && test ! -e node_modules && test ! -L node_modules && mv /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold node_modules && test -L node_modules && test "$(readlink node_modules)" = "/Users/ransolo/Code/shield-workspace/node_modules" || return 1; trap - EXIT HUP INT TERM; } && \
trap 'restore_issue162_node_modules || exit 125' EXIT && \
trap 'restore_issue162_node_modules || exit 125; exit 130' HUP INT TERM && \
mv node_modules /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && \
test -z "$(git status --porcelain=v1 --untracked-files=all)" && \
node packages/shield-team-system/dist/cli.mjs mission authorize-wheels-up --mission-id mission:issue-162-bravo-correction-2 --input .shield/tmp/issue-162-correction-2-authorize-wheels-up.json --root /private/tmp/shield-162-bravo.yMZTJ7 --json; \
authority_status=$?; restore_issue162_node_modules || exit 125; \
if test "$authority_status" -ne 0; then exit "$authority_status"; fi; \
test ! -e /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && \
test ! -L /private/tmp/shield-162-bravo.yMZTJ7.node_modules-authority-hold && \
node packages/shield-team-system/dist/cli.mjs mission status --mission-id mission:issue-162-bravo-correction-2 --root /private/tmp/shield-162-bravo.yMZTJ7 --json && \
shasum -a 256 .shield/journals/bWlzc2lvbjppc3N1ZS0xNjItYnJhdm8tY29ycmVjdGlvbi0y.jsonl
```

The one-passcode command creates dormant initial draft authority for exactly
the two planning artifacts. It performs no publication request or execution
and does not permit implementation-HEAD publication, PR updates,
ready-for-review, merge, deployment, or release. Any later publication requires
fresh exact authority.

## Stop conditions

Stop before implementation for a non-PASS exact-plan Fury verdict, missing or
stale Coulson authority, wrong root/branch/HEAD, plan digest drift, any status
entry during authority preflight, failed exact node_modules restoration,
runtime substitution, scope widening, or any need to enter the
excluded F5/F9/F10 work. Stop after implementation for failed validation,
stale exact-head evidence, incomplete Fury review, or a material scope/risk/
authority change. Never rewrite, squash, reset, publish, merge, deploy, release,
or claim human acceptance.
