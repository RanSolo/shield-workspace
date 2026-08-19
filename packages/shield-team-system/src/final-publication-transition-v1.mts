import { execFile as execFileNode } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath as fsRealpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

// @ts-expect-error The package-internal GitHub adapter is JavaScript and intentionally has no private declaration surface.
import { deliverGitHubCommunication, createGitHubPublicationResultCandidate } from "../github/adapter-v1.mjs";
// @ts-expect-error The package-internal PR workspace is JavaScript; its public reconciliation declaration lives in public/github.d.mts.
import { githubPRWorkspaceTargetRef, installFinalPublicationEffectGuard, reconcilePRPublication } from "../github/pr-workspace.mjs";
import { parseShieldConfig, type ShieldConfig } from "./config.mjs";
import {
  computeFinalPublicationContentDigestV1,
  computeFinalPublicationClaimDigestV1,
  claimFinalPublicationV1,
  recordFinalPublicationDeliveredV1,
  recordFinalPublicationOwnerTerminalV1,
  verifyFinalPublicationClaimantForEffectV1,
  verifyFinalPublicationClaimantV1,
  FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
  type FinalPublicationClaimPreimageV1,
  type FinalPublicationIdentityEnvelopeV1,
  type FinalPublicationReceiptProjectionV1,
} from "./final-publication-receipt-store-v1.mjs";
import {
  resolvePreparedMissionTransitionV1,
  type PreparedPublicationReadyResultV1,
  type ResolvePreparedMissionTransitionResultV1,
} from "./mission-preparation-host-v1.mjs";
import { readMissionReviewedTransitionGraphV1, type MissionReviewedTransitionGraphV1 } from "./mission-preparation-store-v1.mjs";
import {
  appendProfileAwareMissionEntriesAtomicV1,
  journalByteSha256,
  readMissionJournalForDisplay,
  resolveSupervisedMissionPaths,
  type MissionJournalDisplay,
} from "./mission-store.mjs";
import { canonicalJson, type CommunicationRequestProjection } from "./mission-v2.mjs";
import {
  createProfileAwareCommunicationRequestEntryV1,
  createProfileAwareCommunicationResultEntryV1,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
} from "./profile-aware-mission-v1.mjs";
import {
  computeReviewPublicationAuthoritySemanticIdentityV1,
  computeReviewPublicationAuthorityDigest,
  type ReviewPublicationAuthorityV1,
} from "./review-publication-v1.mjs";
import type { ReviewPublicationCommunicationRequestPayload, ReviewPublicationCommunicationResultAdapterCandidate } from "./adapter-v1.mjs";

const execFile = promisify(execFileNode);
const REVISION = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export type FinalPublicationClassificationV1 = "supersedable" | "reusable" | "consumed" | "incompatible";

export type FinalPublicationTransitionResultV1 = Readonly<
  | { state: "decision_required"; classification: "supersedable"; missionId: string; preparation: PreparedPublicationReadyResultV1 }
  | { state: "paused"; classification: "supersedable"; missionId: string; action: string }
  | { state: "published" | "reused"; classification: "reusable" | "consumed"; missionId: string; receipt: unknown; prUrl: string }
  | { state: "recovery_required"; classification: FinalPublicationClassificationV1; missionId: string; action: string; reason: string }
>;

export interface FinalPublicationTransitionDependenciesV1 {
  readonly authorizePreparedPublication?: (preparation: PreparedPublicationReadyResultV1) => Promise<"authorized" | "paused">;
  readonly onClassification?: (classification: FinalPublicationClassificationV1) => void;
  readonly now?: () => string;
  readonly reconcile?: typeof reconcilePRPublication;
  readonly deliver?: typeof deliverGitHubCommunication;
}

type ProfileJournal = Extract<MissionJournalDisplay, { kind: "profile-aware" }>;
type GitResult = Readonly<{ stdout: string; stderr: string }>;

function recovery(
  missionId: string,
  classification: FinalPublicationClassificationV1,
  reason: string,
  action = "Inspect the durable mission and publication receipts; do not retry an external effect.",
): FinalPublicationTransitionResultV1 {
  return Object.freeze({ state: "recovery_required", classification, missionId, reason, action });
}

async function git(root: string, args: readonly string[]): Promise<GitResult> {
  try {
    const result = await execFile("git", [...args], { cwd: root, encoding: "utf8", env: cleanGitEnvironment() });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw new Error(`Git observation failed for ${args[0] ?? "command"}: ${(error as Error).message}`);
  }
}

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of ["GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_WORK_TREE"]) delete environment[key];
  return environment;
}

function repositoryIdFromRemote(value: string): string | null {
  const normalized = value.trim().replace(/\.git$/u, "");
  return /^(?:git@github\.com:|https:\/\/github\.com\/)(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u.exec(normalized)?.groups?.repository ?? null;
}

async function stableConfig(root: string): Promise<{ config: ShieldConfig; bytes: string; identity: string }> {
  const path = join(root, ".shield", "config.json");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathStats = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        pathStats.isSymbolicLink() || !pathStats.isFile() || pathStats.dev !== before.dev || pathStats.ino !== before.ino) {
      throw new Error("SHIELD configuration identity changed during read.");
    }
    const parsed = parseShieldConfig(bytes);
    if (parsed.state === "invalid") throw new Error(parsed.issues.map(({ message }) => message).join(" "));
    return { config: parsed.value, bytes, identity: `${String(before.dev)}:${String(before.ino)}:${String(before.size)}` };
  } finally { await handle?.close().catch(() => undefined); }
}

async function journalSnapshot(root: string, config: ShieldConfig, missionId: string): Promise<{ current: ProfileJournal; bytes: string; sha256: string }> {
  const current = await readMissionJournalForDisplay({ repositoryRoot: root, configuredJournalPath: config.paths.journals, missionId });
  if (current.state === "invalid") throw new Error(`${current.code}: ${current.errors.join(" ")}`);
  if (current.value.kind !== "profile-aware") throw new Error("Final publication requires one schema-9 profile-aware mission journal.");
  const paths = resolveSupervisedMissionPaths(root, config.paths.journals, missionId);
  if (paths.state === "invalid") throw new Error(paths.errors.join(" "));
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(paths.value.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathStats = await lstat(paths.value.journalPath);
    if (!before.isFile() || before.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        pathStats.isSymbolicLink() || !pathStats.isFile() || pathStats.dev !== before.dev || pathStats.ino !== before.ino) {
      throw new Error("Mission journal identity changed during read.");
    }
    return { current: current.value, bytes, sha256: journalByteSha256(bytes) };
  } finally { await handle?.close().catch(() => undefined); }
}

function initialAuthority(projection: ProfileAwareProjectionV1) {
  const records = projection.publicationAuthorizations.filter(({ authority }) => authority.authorityKind === "wheels_up");
  if (records.length !== 1 || records[0].aliases.length !== 0) throw new Error("Initial publication authority lineage is absent or ambiguous.");
  const record = records[0];
  if (record.authority.missionId !== projection.missionId || record.authority.missionRevisionId !== projection.brief.revisionId ||
      record.authority.subjectId !== projection.brief.subjectId || record.authority.headRevisionId === record.authority.baseRevisionId) {
    throw new Error("Initial publication authority lineage is stale or malformed.");
  }
  return record;
}

type WorktreeRecord = { root: string; head: string; branch: string | null; detached: boolean };

function parseWorktrees(value: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  let current: WorktreeRecord | null = null;
  for (const line of value.split("\n")) {
    if (line === "") { if (current !== null) records.push(current); current = null; continue; }
    if (line.startsWith("worktree ")) current = { root: line.slice(9), head: "", branch: null, detached: false };
    else if (current !== null && line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (current !== null && line.startsWith("branch refs/heads/")) current.branch = line.slice(18);
    else if (current !== null && line === "detached") current.detached = true;
  }
  if (current !== null) records.push(current);
  if (records.length === 0 || records.some(({ root, head }) => root === "" || !REVISION.test(head))) throw new Error("Git worktree inventory is malformed.");
  return records;
}

async function observeAndAttach(root: string, config: ShieldConfig, expectedBranch: string, expectedInitialHead: string): Promise<{ head: string; branch: string }> {
  const canonicalRoot = await fsRealpath(root);
  if (canonicalRoot !== resolve(root)) throw new Error("Final publication root must be canonical.");
  const observe = async () => {
    const [top, remote, status, head, branch, ref, worktrees] = await Promise.all([
      git(root, ["rev-parse", "--show-toplevel"]), git(root, ["remote", "get-url", "origin"]), git(root, ["status", "--porcelain"]),
      git(root, ["rev-parse", "HEAD"]), git(root, ["branch", "--show-current"]),
      git(root, ["show-ref", "--verify", "--hash", `refs/heads/${expectedBranch}`]), git(root, ["worktree", "list", "--porcelain"]),
    ]);
    const inventory = parseWorktrees(worktrees.stdout);
    return {
      top: top.stdout.trim(), repositoryId: repositoryIdFromRemote(remote.stdout), status: status.stdout,
      head: head.stdout.trim(), branch: branch.stdout.trim(), ref: ref.stdout.trim(), inventory,
    };
  };
  const first = await observe();
  if (await fsRealpath(first.top) !== canonicalRoot || first.repositoryId !== config.repositoryId || first.status !== "" ||
      !REVISION.test(first.head) || first.ref !== first.head) {
    throw new Error("Repository identity, cleanliness, HEAD, or expected branch ref is incompatible with final publication.");
  }
  if (first.head === expectedInitialHead) throw new Error("Final publication requires a committed implementation after the initial authority HEAD.");
  const owners = first.inventory.filter(({ branch }) => branch === expectedBranch);
  if (first.branch === "") {
    if (owners.length !== 0) throw new Error("Expected implementation branch is owned by another worktree.");
    await git(root, ["switch", "--no-guess", expectedBranch]);
  } else if (first.branch !== expectedBranch || owners.length !== 1 || await fsRealpath(owners[0].root) !== canonicalRoot) {
    throw new Error("Attached worktree is not the unique owner of the expected implementation branch.");
  }
  const second = await observe();
  const secondOwners = second.inventory.filter(({ branch }) => branch === expectedBranch);
  if (second.top !== first.top || second.repositoryId !== first.repositoryId || second.status !== "" || second.branch !== expectedBranch ||
      second.head !== first.head || second.ref !== first.head || secondOwners.length !== 1 || await fsRealpath(secondOwners[0].root) !== canonicalRoot) {
    throw new Error("Repository observation changed during exact branch attachment.");
  }
  return { head: second.head, branch: second.branch };
}

export async function observeFinalPublicationWorktreeV1ForTest(input: {
  repositoryRoot: string;
  repositoryId: string;
  expectedBranch: string;
  expectedInitialHead: string;
}): Promise<{ head: string; branch: string }> {
  return observeAndAttach(resolve(input.repositoryRoot), { repositoryId: input.repositoryId } as ShieldConfig,
    input.expectedBranch, input.expectedInitialHead);
}

type Classification = Readonly<{
  classification: FinalPublicationClassificationV1;
  authority: ReviewPublicationAuthorityV1 | null;
  authorizationId: string | null;
  request: CommunicationRequestProjection | null;
  resumable: boolean;
  reason: string | null;
}>;

const CANONICAL_CONSUMED_ERROR = "Existing prepared publication authorization has already been consumed or conflicted by a publication request.";

function verifiedPreparedPublicationRecord(journal: ProfileJournal, authorizationId?: string) {
  const records = journal.projection.publicationAuthorizations.filter(({ authority }) => authority.authorityKind === "review.publish");
  if (records.length !== 1 || journal.projection.publicationAuthorizations.length !== 2 ||
      journal.projection.publicationAuthorizations.some(({ aliases }) => aliases.length !== 0)) return null;
  const record = records[0];
  const sequence = record.journalSequence;
  const authorization = record.authorization;
  const entry = journal.entries[sequence];
  if ((authorizationId !== undefined && authorization.authorizationId !== authorizationId) ||
      entry?.type !== "review.publication_authorized" || entry.sequence !== sequence || entry.entryId !== record.entryId ||
      record.authority.authorityRef !== `authorization:${journal.projection.missionId}:review-publish:${sequence}` ||
      authorization.authorizationId !== record.authority.authorityRef ||
      authorization.authorityDigest !== computeReviewPublicationAuthorityDigest(record.authority) ||
      authorization.authorityKind !== "review.publish" || authorization.previousJournalSequence !== sequence - 1 ||
      authorization.journalSequence !== sequence ||
      !new RegExp(`^cli:prepare-next:publication-authorize:${sequence}(?::(?:guided-review|guided-review-v2):sha256:[A-Za-z0-9_-]{43})?$`, "u").test(authorization.sourceRef) ||
      canonicalJson(entry.payload.authority) !== canonicalJson(record.authority) ||
      canonicalJson(entry.payload.authorization.payload) !== canonicalJson(authorization)) return null;
  return record;
}

function classifyCanonicalState(
  prepared: ResolvePreparedMissionTransitionResultV1,
  journal: ProfileJournal,
): Classification {
  if (prepared.state === "publication_ready") {
    return { classification: "supersedable", authority: null, authorizationId: null, request: null, resumable: false, reason: null };
  }
  if (prepared.state === "publication_already_authorized") {
    const record = verifiedPreparedPublicationRecord(journal, prepared.authorizationId);
    if (record === null || prepared.missionId !== journal.projection.missionId ||
        prepared.missionRevisionId !== journal.projection.brief.revisionId || prepared.journalSequence !== record.journalSequence ||
        prepared.authorityDigest !== record.authorization.authorityDigest || journal.projection.communication.requests.length !== 0) {
      return { classification: "incompatible", authority: null, authorizationId: null, request: null, resumable: false,
        reason: "Canonical reusable publication authority does not match the replayed journal chain." };
    }
    return { classification: "reusable", authority: record.authority, authorizationId: prepared.authorizationId, request: null, resumable: true, reason: null };
  }
  if (prepared.state !== "blocked" || prepared.reasonCode !== "authority_conflict" ||
      prepared.errors.length !== 1 || prepared.errors[0] !== CANONICAL_CONSUMED_ERROR) {
    const reason = prepared.state === "blocked" ? `${prepared.reasonCode}: ${prepared.errors.join(" ")}` : `Canonical mission preparation returned ${prepared.state}.`;
    return { classification: "incompatible", authority: null, authorizationId: null, request: null, resumable: false, reason };
  }

  // This exact canonical blocked outcome is emitted only after preparedPublicationResult
  // and prepared-authorization provenance have succeeded. The journal check below
  // then closes the authority-to-request chain without rebuilding authority meaning.
  const record = verifiedPreparedPublicationRecord(journal);
  if (record === null) return { classification: "consumed", authority: null, authorizationId: null, request: null, resumable: false,
    reason: "Canonical consumed outcome has no exact prepared-authorization provenance." };
  const requests = journal.projection.communication.requests.filter((request) => request.adapterContractVersion === 2 &&
    request.publicationAuthorizationId === record.authorization.authorizationId);
  if (requests.length !== 1 || journal.projection.communication.requests.length !== 1) {
    return { classification: "consumed", authority: null, authorizationId: null, request: null, resumable: false,
      reason: "Canonical consumed outcome has a foreign or ambiguous request chain." };
  }
  const request = requests[0];
  const requestEntries = journal.entries.filter((entry): entry is Extract<ProfileAwareMissionEntryV1, { type: "communication.requested" }> =>
    entry.type === "communication.requested" && entry.payload.request.requestId === request.requestId);
  if (requestEntries.length !== 1 || !exactProjectedRequest(request, requestEntries[0].payload.request)) {
    return { classification: "consumed", authority: null, authorizationId: null, request: null, resumable: false,
      reason: "Canonical consumed request does not replay from one exact journal entry." };
  }
  const resumable = request.state === "queued" || request.state === "delivered";
  const resultEntries = journal.entries.filter((entry): entry is Extract<ProfileAwareMissionEntryV1, { type: "communication.result_recorded" }> =>
    entry.type === "communication.result_recorded" && entry.payload.candidate.payload.requestId === request.requestId);
  if ((request.state === "queued" && resultEntries.length !== 0) ||
      (request.state === "delivered" && (resultEntries.length !== 1 || resultEntries[0].payload.candidate.candidateId !== request.candidateId ||
        resultEntries[0].payload.candidate.sourceRef !== request.sourceRef || resultEntries[0].payload.candidate.payload.receiptRef !== request.receiptRef))) {
    return { classification: "consumed", authority: null, authorizationId: null, request: null, resumable: false,
      reason: "Canonical consumed result chain is stale or ambiguous." };
  }
  return { classification: "consumed", authority: resumable ? record.authority : null,
    authorizationId: resumable ? record.authorization.authorizationId : null,
    request: resumable ? request : null, resumable, reason: resumable ? null : `Publication request is terminal ${request.state}.` };
}

export function classifyFinalPublicationCanonicalStateV1ForTest(
  prepared: ResolvePreparedMissionTransitionResultV1,
  journal: ProfileJournal,
): Classification {
  return classifyCanonicalState(prepared, journal);
}

function renderPublication(graph: MissionReviewedTransitionGraphV1, projection: ProfileAwareProjectionV1, authority: ReviewPublicationAuthorityV1) {
  const title = `Draft review — ${projection.missionId}`;
  const paths = authority.authorizedPaths.map((path) => `- ${path}`).join("\n");
  const exclusions = graph.transitionPlan.exclusions.map((entry) => `- ${entry}`).join("\n");
  const body = [
    "# Draft mission review", "", `Mission: ${projection.missionId}`, `Subject: ${projection.brief.subjectId}`,
    `Exact HEAD: ${authority.headRevisionId}`, "", "Authorized paths:", paths, "", "Exclusions:", exclusions,
    "", "This is a draft-only review publication. It does not authorize merge, deployment, release, or final acceptance.",
  ].join("\n");
  return { title, body };
}

function publicationRequest(
  projection: ProfileAwareProjectionV1,
  authority: ReviewPublicationAuthorityV1,
  authorizationId: string,
  identity: FinalPublicationIdentityEnvelopeV1,
  targetRef: string,
): ReviewPublicationCommunicationRequestPayload {
  return {
    requestId: identity.requestId, adapterContractVersion: 2, adapterId: "github", operation: "publish_mission_brief",
    missionId: projection.missionId, subjectId: projection.brief.subjectId, revisionId: projection.brief.revisionId,
    artifactRevisionId: authority.headRevisionId, targetRef, publicationAuthorizationId: authorizationId,
    proposedChangedPaths: [...authority.authorizedPaths], requestedEffects: [...authority.permittedEffects],
  };
}

async function appendRequest(
  root: string,
  config: ShieldConfig,
  missionId: string,
  request: ReviewPublicationCommunicationRequestPayload,
  identity: FinalPublicationIdentityEnvelopeV1,
  claimDigest: string,
  capability: string,
): Promise<ProfileJournal> {
  const initial = await journalSnapshot(root, config, missionId);
  const existing = initial.current.projection.communication.requests.filter(({ requestId }) => requestId === request.requestId);
  if (existing.length === 1 && exactProjectedRequest(existing[0], request)) {
    return initial.current;
  }
  if (existing.length !== 0) throw new Error("Deterministic final publication request identity is ambiguous or conflicting.");
  const possession = await verifyFinalPublicationClaimantV1({ repositoryRoot: root, claimDigest, capability });
  if (possession.state === "invalid") throw new Error(`${possession.code}: ${possession.errors.join(" ")}`);
  const entry = createProfileAwareCommunicationRequestEntryV1({ projection: initial.current.projection, request, timestamp: identity.capturedAt });
  const appended = await appendProfileAwareMissionEntriesAtomicV1({ repositoryRoot: root, configuredJournalPath: config.paths.journals,
    missionId, entries: [entry], expectedStartingJournalSha256: initial.sha256 });
  if (appended.state === "invalid") throw new Error(`${appended.code}: ${appended.errors.join(" ")}`);
  const fresh = await journalSnapshot(root, config, missionId);
  const match = fresh.current.projection.communication.requests.filter(({ requestId }) => requestId === request.requestId);
  if (match.length !== 1) throw new Error("Deterministic final publication request append did not replay exactly.");
  return fresh.current;
}

function exactProjectedRequest(request: CommunicationRequestProjection, expected: ReviewPublicationCommunicationRequestPayload): boolean {
  const projected = {
    requestId: request.requestId, adapterContractVersion: request.adapterContractVersion, adapterId: request.adapterId, operation: request.operation,
    missionId: request.missionId, subjectId: request.subjectId, revisionId: request.revisionId, artifactRevisionId: request.artifactRevisionId,
    targetRef: request.targetRef, publicationAuthorizationId: request.adapterContractVersion === 2 ? request.publicationAuthorizationId : null,
    proposedChangedPaths: request.adapterContractVersion === 2 ? request.proposedChangedPaths : [],
    requestedEffects: request.adapterContractVersion === 2 ? request.requestedEffects : [],
  };
  return canonicalJson(projected) === canonicalJson(expected);
}

async function appendResult(root: string, config: ShieldConfig, missionId: string, candidate: ReviewPublicationCommunicationResultAdapterCandidate): Promise<void> {
  const initial = await journalSnapshot(root, config, missionId);
  const request = initial.current.projection.communication.requests.filter(({ requestId }) => requestId === candidate.payload.requestId);
  if (request.length !== 1) throw new Error("Delivered final publication has no unique durable request.");
  if (request[0].state === "delivered") {
    const entries = initial.current.entries.filter((entry): entry is Extract<ProfileAwareMissionEntryV1, { type: "communication.result_recorded" }> =>
      entry.type === "communication.result_recorded" && entry.payload.candidate.candidateId === candidate.candidateId);
    if (entries.length !== 1 || canonicalJson(entries[0].payload.candidate) !== canonicalJson(candidate)) throw new Error("Durable final publication result conflicts with the receipt ledger.");
    return;
  }
  if (request[0].state !== "queued") throw new Error(`Durable final publication request is ${request[0].state}, not queued.`);
  const entry = createProfileAwareCommunicationResultEntryV1({ projection: initial.current.projection, candidate });
  const appended = await appendProfileAwareMissionEntriesAtomicV1({ repositoryRoot: root, configuredJournalPath: config.paths.journals,
    missionId, entries: [entry], expectedStartingJournalSha256: initial.sha256 });
  if (appended.state === "invalid") throw new Error(`${appended.code}: ${appended.errors.join(" ")}`);
}

function mutatingCommandAttempted(commands: readonly { executable: string; args: readonly string[] }[]): boolean {
  return commands.some(({ executable, args }) => (executable === "git" && args[0] === "push") ||
    (executable === "gh" && args[0] === "pr" && ["create", "edit"].includes(args[1] ?? "")));
}

async function finishDelivered(
  root: string,
  config: ShieldConfig,
  missionId: string,
  claimDigest: string,
  request: ReviewPublicationCommunicationRequestPayload,
  identity: FinalPublicationIdentityEnvelopeV1,
  reconciliation: Extract<ReturnType<typeof reconcilePRPublication>, { state: "delivered" }>,
): Promise<FinalPublicationTransitionResultV1> {
  const built = createGitHubPublicationResultCandidate(request, identity, "delivered", null, reconciliation.receipt.prUrl, reconciliation.publicationScope);
  if (built.state !== "candidate") return recovery(missionId, "consumed", "Exact delivered result candidate could not be reconstructed.");
  const candidate = built.candidate as ReviewPublicationCommunicationResultAdapterCandidate;
  const recorded = await recordFinalPublicationDeliveredV1({ repositoryRoot: root, claimDigest, receipt: reconciliation.receipt, candidate });
  if (recorded.state === "invalid") return recovery(missionId, "consumed", `${recorded.code}: ${recorded.errors.join(" ")}`);
  try { await appendResult(root, config, missionId, candidate); } catch (error) { return recovery(missionId, "consumed", error instanceof Error ? error.message : String(error)); }
  return Object.freeze({ state: "published", classification: "consumed", missionId, receipt: reconciliation.receipt, prUrl: reconciliation.receipt.prUrl });
}

export async function runFinalPublicationTransitionV1(
  input: Readonly<{ repositoryRoot: string; missionId: string; baseBranch: string }>,
  dependencies: FinalPublicationTransitionDependenciesV1 = {},
): Promise<FinalPublicationTransitionResultV1> {
  const missionId = input.missionId;
  if (typeof missionId !== "string" || missionId.length === 0 || typeof input.baseBranch !== "string" || input.baseBranch.length === 0 ||
      typeof input.repositoryRoot !== "string" || input.repositoryRoot.length === 0) return recovery(String(missionId), "incompatible", "Final publication input is malformed.");
  const root = resolve(input.repositoryRoot);
  try {
    const configSnapshot = await stableConfig(root);
    if (!REPOSITORY.test(configSnapshot.config.repositoryId)) throw new Error("Configured repository identity is malformed.");
    let journal = await journalSnapshot(root, configSnapshot.config, missionId);
    const initial = initialAuthority(journal.current.projection);
    if (initial.authority.repositoryId !== configSnapshot.config.repositoryId || initial.authority.canonicalRepositoryRoot !== root) {
      throw new Error("Initial publication authority repository binding differs from the governed root.");
    }
    await observeAndAttach(root, configSnapshot.config, initial.authority.branch, initial.authority.headRevisionId);
    const graphRead = await readMissionReviewedTransitionGraphV1({ repositoryRoot: root, missionId });
    if (graphRead.state !== "read") throw new Error(`${graphRead.code}: ${graphRead.errors.join(" ")}`);
    const graph = graphRead.graph;
    let prepared = await resolvePreparedMissionTransitionV1({ missionId, repositoryRoot: root });
    let classification: Classification;
    if (prepared.state === "publication_ready") {
      if (dependencies.authorizePreparedPublication === undefined) {
        return Object.freeze({ state: "decision_required", classification: "supersedable", missionId, preparation: prepared });
      }
      dependencies.onClassification?.("supersedable");
      const authorization = await dependencies.authorizePreparedPublication(prepared);
      if (authorization === "paused") return Object.freeze({ state: "paused", classification: "supersedable", missionId, action: "Complete the displayed Guided Review or authorization decision, then rerun the same command." });
      prepared = await resolvePreparedMissionTransitionV1({ missionId, repositoryRoot: root });
      if (prepared.state !== "publication_already_authorized") throw new Error("Prepared publication authorization did not replay as the canonical reusable state.");
      journal = await journalSnapshot(root, configSnapshot.config, missionId);
      classification = classifyCanonicalState(prepared, journal.current);
    } else if (prepared.state === "publication_already_authorized") {
      classification = classifyCanonicalState(prepared, journal.current);
    } else {
      classification = classifyCanonicalState(prepared, journal.current);
    }
    dependencies.onClassification?.(classification.classification);
    if (classification.authority === null || classification.authorizationId === null || !classification.resumable) {
      return recovery(missionId, classification.classification, classification.reason ?? "Final publication state is not safely resumable.");
    }
    const authority = classification.authority;
    const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(authority);
    if (semantic.state === "blocked") return recovery(missionId, "incompatible", "Final semantic publication authority is malformed.");
    const [owner, name] = configSnapshot.config.repositoryId.split("/");
    const plan = { repositoryOwner: owner, repositoryName: name, baseBranch: input.baseBranch, branchSlug: authority.branch,
      missionBriefPath: graph.transitionPlan.parentPlanPath, prTitle: "" };
    const rendered = renderPublication(graph, journal.current.projection, authority);
    plan.prTitle = rendered.title;
    if (!authority.authorizedPaths.includes(plan.missionBriefPath)) return recovery(missionId, "incompatible", "Protected parent plan is not included in final publication paths.");
    await git(root, ["ls-files", "--error-unmatch", "--", plan.missionBriefPath]);
    const targetRef = githubPRWorkspaceTargetRef(plan);
    const preimage: FinalPublicationClaimPreimageV1 = {
      schemaVersion: 1, contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION, missionId,
      missionRevisionId: journal.current.projection.brief.revisionId, semanticAuthorityIdentity: semantic.semanticIdentity,
      authority, repositoryId: configSnapshot.config.repositoryId, branch: authority.branch, baseRevisionId: authority.baseRevisionId,
      headRevisionId: authority.headRevisionId, operation: "publish_mission_brief", targetRef,
      publicationAuthorizationId: classification.authorizationId, proposedChangedPaths: [...authority.authorizedPaths],
      requestedEffects: [...authority.permittedEffects], titleDigest: computeFinalPublicationContentDigestV1(rendered.title),
      bodyDigest: computeFinalPublicationContentDigestV1(rendered.body),
    };
    const claimDigest = computeFinalPublicationClaimDigestV1(preimage);
    const reconcile = dependencies.reconcile ?? reconcilePRPublication;
    let observed = reconcile(plan, authority, authority.authorizedPaths, authority.permittedEffects, { body: rendered.body, cwd: root });
    if (observed.state === "recovery_required") return recovery(missionId, classification.classification, observed.reason);
    const claimed = await claimFinalPublicationV1({ repositoryRoot: root, preimage,
      capturedAt: { value: (dependencies.now ?? (() => new Date().toISOString()))(), provenance: "hostTrusted" } });
    if (claimed.state === "invalid") return recovery(missionId, classification.classification, `${claimed.code}: ${claimed.errors.join(" ")}`);
    const identity = claimed.value.identity;
    const request = publicationRequest(journal.current.projection, authority, classification.authorizationId, identity, targetRef);
    if (classification.request !== null && !exactProjectedRequest(classification.request, request)) {
      return recovery(missionId, "consumed", "Existing publication request differs from the deterministic final claim identity.");
    }
    if (claimed.value.state === "existing") {
      const ledger: FinalPublicationReceiptProjectionV1 = claimed.value.projection;
      if (ledger.terminal?.state === "delivered") {
        if (observed.state !== "delivered" || canonicalJson(observed.receipt) !== canonicalJson(ledger.terminal.receipt)) {
          return recovery(missionId, "consumed", "Durable delivered receipt no longer matches exact GitHub readback.");
        }
        const rebuilt = createGitHubPublicationResultCandidate(request, identity, "delivered", null, observed.receipt.prUrl, observed.publicationScope);
        if (rebuilt.state !== "candidate" || canonicalJson(rebuilt.candidate) !== canonicalJson(ledger.terminal.candidate)) {
          return recovery(missionId, "consumed", "Durable delivered result no longer reconstructs byte-identically.");
        }
        try { await appendResult(root, configSnapshot.config, missionId, ledger.terminal.candidate); } catch (error) { return recovery(missionId, "consumed", error instanceof Error ? error.message : String(error)); }
        return Object.freeze({ state: "reused", classification: "consumed", missionId, receipt: ledger.terminal.receipt, prUrl: ledger.terminal.receipt.prUrl });
      }
      if (ledger.terminal !== null) return recovery(missionId, "consumed", `Final publication is terminal ${ledger.terminal.state}.`);
      if (observed.state === "delivered") return finishDelivered(root, configSnapshot.config, missionId, claimDigest, request, identity, observed);
      return recovery(missionId, "consumed", "A prior claimant is readback-only and positive delivery is not yet proven.");
    }
    if (observed.state === "delivered") return finishDelivered(root, configSnapshot.config, missionId, claimDigest, request, identity, observed);
    const capability = claimed.value.capability;
    try {
      const currentConfig = await stableConfig(root);
      if (currentConfig.bytes !== configSnapshot.bytes || currentConfig.identity !== configSnapshot.identity || canonicalJson(currentConfig.config) !== canonicalJson(configSnapshot.config)) {
        throw new Error("Repository configuration changed after the final publication claim.");
      }
      const withRequest = classification.request === null
        ? await appendRequest(root, configSnapshot.config, missionId, request, identity, claimDigest, capability)
        : (await journalSnapshot(root, configSnapshot.config, missionId)).current;
      const projected = withRequest.projection.communication.requests.filter(({ requestId }) => requestId === request.requestId);
      if (projected.length !== 1 || !exactProjectedRequest(projected[0], request) || projected[0].state !== "queued") {
        throw new Error("Durable final publication request is not the exact queued request.");
      }
      const possession = await verifyFinalPublicationClaimantV1({ repositoryRoot: root, claimDigest, capability });
      if (possession.state === "invalid") throw new Error(`${possession.code}: ${possession.errors.join(" ")}`);
      const guard = installFinalPublicationEffectGuard(request.requestId, () =>
        verifyFinalPublicationClaimantForEffectV1({ repositoryRoot: root, claimDigest, capability }).state === "valid");
      if (guard.state !== "installed") throw new Error(guard.reason);
      const deliver = dependencies.deliver ?? deliverGitHubCommunication;
      let delivered: ReturnType<typeof deliverGitHubCommunication>;
      let guardReleased = false;
      try {
        delivered = deliver(request.requestId, {
          candidateId: identity.candidateId, sourceRef: identity.sourceRef, capturedAt: identity.capturedAt,
          workspacePlan: plan, body: rendered.body, proposedChangedPaths: [...authority.authorizedPaths],
        }, { loadJournal: () => withRequest.entries, cwd: root });
      } finally {
        guardReleased = guard.uninstall();
      }
      observed = reconcile(plan, authority, authority.authorizedPaths, authority.permittedEffects, { body: rendered.body, cwd: root });
      if (observed.state === "delivered") return finishDelivered(root, configSnapshot.config, missionId, claimDigest, request, identity, observed);
      if (!guardReleased) throw new Error("Final publication effect guard release could not be verified.");
      const attempted = mutatingCommandAttempted(delivered.commands ?? []);
      if (observed.state === "not_applied" && !attempted) {
        const terminal = await recordFinalPublicationOwnerTerminalV1({ repositoryRoot: root, claimDigest, capability, state: "not_applied", reason: delivered.state === "blocked" ? delivered.reason : "pre_effect_failure" });
        return terminal.state === "invalid" ? recovery(missionId, "consumed", `${terminal.code}: ${terminal.errors.join(" ")}`) : recovery(missionId, "consumed", "Publication was proven not applied before any GitHub effect.", "Resolve the pre-effect failure; a fresh governed authority is required before another effect attempt.");
      }
      const reason = observed.state === "recovery_required" ? observed.reason : "effect_attempt_not_delivered";
      const terminal = await recordFinalPublicationOwnerTerminalV1({ repositoryRoot: root, claimDigest, capability, state: "recovery_required", reason });
      return terminal.state === "invalid" ? recovery(missionId, "consumed", `${terminal.code}: ${terminal.errors.join(" ")}`) : recovery(missionId, "consumed", reason);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const terminal = await recordFinalPublicationOwnerTerminalV1({ repositoryRoot: root, claimDigest, capability, state: "recovery_required", reason: reason.slice(0, 256) });
      return terminal.state === "invalid" ? recovery(missionId, "consumed", `${reason} ${terminal.code}: ${terminal.errors.join(" ")}`) : recovery(missionId, "consumed", reason);
    }
  } catch (error) {
    return recovery(missionId, "incompatible", error instanceof Error ? error.message : String(error));
  }
}
