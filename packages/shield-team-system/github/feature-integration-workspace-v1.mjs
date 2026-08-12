import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import {
  computeFeatureIntegrationReceiptDigestV1,
  computeFeatureRollbackReceiptDigestV1,
  computeFeatureIntegrationWorkspaceEffectObservationDigestV1,
  createFeatureIntegrationEntryV1,
  replayFeatureOperationJournalV1,
  canonicalFeatureIntegrationJsonV1,
  computeFeatureObservationChallengeDigestV2,
  computeFeatureTransitionObservationDigestV2,
  createFeatureIntegrationEntryV2,
  createFeatureOperationJournalV2,
  secureReplayFeatureOperationJournalV2,
  validateFeatureOperationJournalV2,
} from "../dist/feature-integration-v1.mjs";
import { validateFeatureOperationDerivedCandidateV1 } from "../dist/feature-operation-v1.mjs";
import { computeProfileAwareMissionJournalDigestV1 } from "../dist/feature-integration-evidence-v1.mjs";
import { replayProfileAwareMissionJournal } from "../dist/profile-aware-mission-v1.mjs";
import {
  appendFeatureOperationJournalStoreV1,
  readFeatureOperationJournalStoreV1,
} from "../dist/feature-integration-store-v1.mjs";
import {
  createFeatureIntegrationDraftPullRequestV1,
  createFeatureIntegrationRefV1,
  integrateFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationCommitV1,
  observeFeatureIntegrationDraftPullRequestsV1,
  observeFeatureIntegrationPullRequestV1,
  observeFeatureIntegrationRefV1,
  observeFeatureIntegrationPullRequestProofV2,
  observeFeatureIntegrationTargetProofV2,
  observeFeatureIntegrationCommitMethodProofV2,
  integrateFeatureIntegrationPullRequestV2,
} from "./adapter-v1.mjs";

const STAGES = Object.freeze({
  feature_branch_creation: "feature_branch_create",
  feature_workspace: "feature_workspace_draft_pr_create",
  child_initiation: "child_initiation",
  child_publication: "child_draft_pr_create",
});
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const AUTHORITY_DIGEST_V2 = /^sha256:[A-Za-z0-9_-]{43}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const WORKSPACE_DERIVATIONS = Object.freeze(["feature_branch_create", "feature_workspace_draft_pr_create", "child_initiation", "child_draft_pr_create"]);
const WORKSPACE_OBSERVATION_FIELDS = Object.freeze(["schemaVersion", "contractVersion", "observationKind", "preparationEntryDigest", "candidateDigest", "effectKey", "requestDigest", "repositoryId", "derivationKind", "challengeId", "targetRef", "targetBaseBranch", "expectedHeadRevision", "expectedTreeDigest", "status", "observedHeadRevision", "observedTreeDigest", "pullRequests", "observationProvenance", "observedAt", "observationDigest"]);
const WORKSPACE_PULL_REQUEST_FIELDS = Object.freeze(["pullRequestId", "url", "draft", "headBranch", "headRevision", "baseBranch"]);
const OBSERVED_AT_FIELDS = Object.freeze(["value", "provenance"]);
const PRODUCER_CONFIG_FIELDS_V2 = Object.freeze(["adapterOptions", "producerId", "signEnvelope", "clock"]);
const PRODUCER_METHODS_V2 = Object.freeze(["signChallenge", "executeTransition", "observeAndSignWorkspace", "observeAndSignTransition", "observeAndSignAdmission", "observeAndSignExpiry"]);

function block(reason) { return { state: "blocked", reason }; }
function challenge(value) { return typeof value === "string" && value.length > 0; }
function text(value) { return typeof value === "string" && value.length > 0 && value.trim() === value; }
function compareUtf16(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
function exactDataRecord(value, fields) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") || fields.some((field) => !keys.includes(field))) return null;
    const record = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) return null;
      record[field] = descriptor.value;
    }
    return record;
  } catch { return null; }
}
function denseDataArray(value) {
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return null;
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      items.push(descriptor.value);
    }
    return items;
  } catch { return null; }
}

function canonicalBase64V2(value) {
  return typeof value === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value && Buffer.from(value, "base64").length === 64;
}

function digestV2(domain, value, omitted) {
  const copy = structuredClone(value);
  if (omitted) delete copy[omitted];
  return `sha256:${createHash("sha256").update(Buffer.concat([Buffer.from(domain, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(copy), "utf8")])).digest("hex")}`;
}

async function signedEnvelopeFromProducerV2(config, domain, payload) {
  let signed;
  try { signed = await config.signEnvelope(domain, structuredClone(payload)); }
  catch { throw new Error("producer_unavailable"); }
  const envelope = exactDataRecord(signed, ["payload", "signatureBase64"]);
  if (!envelope || !canonicalBase64V2(envelope.signatureBase64) || canonicalFeatureIntegrationJsonV1(envelope.payload) !== canonicalFeatureIntegrationJsonV1(payload)) throw new Error("authentication_unavailable");
  return Object.freeze({ payload: structuredClone(payload), signatureBase64: envelope.signatureBase64 });
}

function producerClockV2(config) {
  let value;
  try { value = config.clock(); }
  catch { throw new Error("producer_unavailable"); }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("producer_unavailable");
  return value;
}

function producerConfigV2(input) {
  const value = exactDataRecord(input, PRODUCER_CONFIG_FIELDS_V2);
  const adapter = value ? exactDataRecord(value.adapterOptions, ["run", "cwd"]) : null;
  return value && adapter && typeof adapter.run === "function" && text(adapter.cwd) && text(value.producerId) && typeof value.signEnvelope === "function" && typeof value.clock === "function"
    ? { ...value, adapterOptions: adapter } : null;
}

function transitionInvocationV2(input) {
  const wrapped = exactDataRecord(input, ["request", "preparationEntryDigest"]) ??
    exactDataRecord(input, ["request", "preparationEntryDigest", "signedChallenge"]) ??
    exactDataRecord(input, ["request", "preparationEntryDigest", "expectedRestoredTreeDigest"]) ??
    exactDataRecord(input, ["request", "preparationEntryDigest", "signedChallenge", "expectedRestoredTreeDigest"]);
  if (!wrapped || !DIGEST.test(wrapped.preparationEntryDigest) || !wrapped.request || typeof wrapped.request !== "object") return null;
  if (!(wrapped.expectedRestoredTreeDigest === undefined || DIGEST.test(wrapped.expectedRestoredTreeDigest))) return null;
  return { request: wrapped.request, preparationEntryDigest: wrapped.preparationEntryDigest, signedChallenge: wrapped.signedChallenge ?? wrapped.request.signedChallenge,
    expectedRestoredTreeDigest: wrapped.expectedRestoredTreeDigest ?? null };
}

function appliedTransitionProofV2(request, pull, target, method, expectedRestoredTreeDigest) {
  if (!method || pull.merged !== true || pull.headRevision !== request.expectedPullRequestHead || pull.baseBranch !== request.targetFeatureBranch ||
      method.integrationMethodEvidence !== "verified" || pull.mergeRevision === null || pull.mergeRevision !== target.headRevision ||
      pull.pullRequestCommitHeads.length === 0 || pull.pullRequestCommitHeads.at(-1) !== request.expectedPullRequestHead ||
      pull.checkState !== "successful" || pull.conflictingPullRequestCount !== 0 ||
      (request.derivationKind === "child_revert_on_feature" &&
        (!DIGEST.test(request.rollbackWorkspaceReceiptDigest) || !DIGEST.test(expectedRestoredTreeDigest) || target.treeDigest !== expectedRestoredTreeDigest))) return false;
  if (request.integrationMethod === "merge_commit") return method.resultingCommitParents.length === 2 && method.resultingCommitParents[0] === request.priorHeadRevision && method.resultingCommitParents[1] === request.expectedPullRequestHead && method.rebasedCommits.length === 0;
  if (request.integrationMethod === "squash") return method.resultingCommitParents.length === 1 && method.resultingCommitParents[0] === request.priorHeadRevision && method.rebasedCommits.length === 0 && target.headRevision !== request.priorHeadRevision && target.headRevision !== request.expectedPullRequestHead;
  const sourceCommits = method.rebasedCommits.map((item) => item.sourceCommit);
  const resultCommits = method.rebasedCommits.map((item) => item.resultCommit);
  return method.rebasedCommits.length === pull.pullRequestCommitHeads.length && method.rebasedCommits.length > 0 &&
    new Set(sourceCommits).size === sourceCommits.length && new Set(resultCommits).size === resultCommits.length &&
    new Set([...sourceCommits, ...resultCommits]).size === sourceCommits.length + resultCommits.length &&
    method.rebasedCommits.every((item, index) => item.sourceCommit === pull.pullRequestCommitHeads[index] &&
      item.parentCommit === (index === 0 ? request.priorHeadRevision : method.rebasedCommits[index - 1].resultCommit)) &&
    method.rebasedCommits.at(-1).resultCommit === target.headRevision && method.resultingCommitParents.length === 1 &&
    method.resultingCommitParents[0] === method.rebasedCommits.at(-1).parentCommit;
}

/** Constructs the sole GitHub-backed producer for hardened repository observations. */
export function createGitHubFeatureObservationProducerV2(input) {
  const config = producerConfigV2(input);
  if (!config) return { state: "unavailable", reason: "producer_unavailable" };
  const producer = {
    async signChallenge(payloadInput) {
      const value = payloadInput && typeof payloadInput === "object" ? structuredClone(payloadInput) : null;
      if (!value || value.producerId !== config.producerId || !["workspace", "transition", "cumulative", "admission", "expiry"].includes(value.challengeKind)) throw new Error("producer_unavailable");
      value.challengeDigest = DIGEST.test(value.challengeDigest) ? value.challengeDigest : `sha256:${"0".repeat(64)}`;
      value.challengeDigest = computeFeatureObservationChallengeDigestV2(value);
      return signedEnvelopeFromProducerV2(config, `shield.feature-integration.challenge.v2:${value.challengeKind}`, value);
    },
    async executeTransition(inputValue) {
      const invocation = transitionInvocationV2(inputValue);
      if (!invocation) throw new Error("producer_unavailable");
      const request = invocation.request;
      return integrateFeatureIntegrationPullRequestV2({ repositoryId: request.repositoryId, pullRequestId: Number(request.pullRequestId),
        expectedHeadRevision: request.expectedPullRequestHead, targetFeatureBranch: request.targetFeatureBranch,
        integrationMethod: request.integrationMethod, challengeId: invocation.signedChallenge?.payload?.challengeId }, config.adapterOptions);
    },
    async observeAndSignWorkspace(inputValue) {
      const value = inputValue && typeof inputValue === "object" ? structuredClone(inputValue) : null;
      if (!value || value.observationKind !== "workspace" || value.producerId !== config.producerId) throw new Error("producer_unavailable");
      value.observedAt = producerClockV2(config);
      value.observationDigest = digestV2("shield.feature-integration.observation.v2:workspace", value, "observationDigest");
      return signedEnvelopeFromProducerV2(config, "shield.feature-integration.observation.v2:workspace", value);
    },
    async observeAndSignTransition(inputValue) {
      const invocation = transitionInvocationV2(inputValue);
      if (!invocation) throw new Error("producer_unavailable");
      const request = invocation.request;
      const challenge = invocation.signedChallenge?.payload;
      if (!challenge || challenge.challengeKind !== "transition" || challenge.producerId !== config.producerId || request.signedChallenge?.payload?.producerId !== config.producerId) throw new Error("producer_unavailable");
      const challengeId = challenge.challengeId;
      const pullResult = await observeFeatureIntegrationPullRequestProofV2({ repositoryId: request.repositoryId, pullRequestId: Number(request.pullRequestId), challengeId }, config.adapterOptions);
      const targetResult = await observeFeatureIntegrationTargetProofV2({ repositoryId: request.repositoryId, targetRef: request.targetFeatureRef, challengeId }, config.adapterOptions);
      if (pullResult.state !== "observed" || targetResult.state !== "observed") throw new Error("producer_unavailable");
      const pull = pullResult.observation, target = targetResult.observation;
      let method = null;
      if (pull.merged && pull.mergeRevision !== null) {
        const proof = await observeFeatureIntegrationCommitMethodProofV2({ repositoryId: request.repositoryId, headRevision: target.headRevision,
          priorHeadRevision: request.priorHeadRevision, integrationMethod: request.integrationMethod,
          pullRequestCommitHeads: pull.pullRequestCommitHeads, challengeId }, config.adapterOptions);
        if (proof.state !== "observed") throw new Error("producer_unavailable");
        method = proof.observation;
      }
      const applied = appliedTransitionProofV2(request, pull, target, method, invocation.expectedRestoredTreeDigest);
      const notApplied = pull.merged === false && pull.mergeRevision === null && pull.headRevision === request.expectedPullRequestHead && pull.baseBranch === request.targetFeatureBranch && target.headRevision === request.priorHeadRevision && target.treeDigest === request.priorTreeDigest;
      const payload = {
        schemaVersion: 2, contractVersion: "feature.integration.observation.v2", observationKind: "transition",
        operationId: request.operationId, repositoryId: request.repositoryId, requestId: request.requestId, requestCoreDigest: request.requestCoreDigest,
        requestDigest: request.requestDigest, preparationEntryDigest: invocation.preparationEntryDigest, candidateDigest: request.candidateDigest, effectKey: request.effectKey,
        pullRequestId: request.pullRequestId, expectedPullRequestHead: request.expectedPullRequestHead, targetFeatureRef: request.targetFeatureRef,
        integrationMethod: request.integrationMethod, priorHeadRevision: request.priorHeadRevision, priorTreeDigest: request.priorTreeDigest,
        observedPullRequestHead: pull.headRevision, observedPullRequestBaseBranch: pull.baseBranch,
        observedIntegrationMethod: method?.integrationMethodEvidence === "verified" ? request.integrationMethod : null,
        pullRequestMerged: pull.merged, pullRequestMergeRevision: pull.mergeRevision, pullRequestCommitHeads: pull.pullRequestCommitHeads,
        conflictingPullRequestCount: pull.conflictingPullRequestCount, resultingCommitParents: method?.resultingCommitParents ?? [], rebasedCommits: method?.rebasedCommits ?? [],
        checkState: pull.checkState, observedTargetHeadRevision: target.headRevision, observedTargetTreeDigest: target.treeDigest,
        status: applied ? "applied" : notApplied ? "not_applied" : "uncertain", signedChallenge: structuredClone(invocation.signedChallenge),
        producerId: config.producerId, observedAt: producerClockV2(config), observationDigest: `sha256:${"0".repeat(64)}`,
      };
      payload.observationDigest = computeFeatureTransitionObservationDigestV2(payload);
      return signedEnvelopeFromProducerV2(config, "shield.feature-integration.observation.v2:transition", payload);
    },
    async observeAndSignAdmission(inputValue) {
      const value = inputValue && typeof inputValue === "object" ? structuredClone(inputValue) : null;
      if (!value || value.observationKind !== "admission" || value.producerId !== config.producerId) throw new Error("producer_unavailable");
      value.observedAt = producerClockV2(config); value.observationDigest = digestV2("shield.feature-integration.observation.v2:admission", value, "observationDigest");
      return signedEnvelopeFromProducerV2(config, "shield.feature-integration.observation.v2:admission", value);
    },
    async observeAndSignExpiry(inputValue) {
      const value = inputValue && typeof inputValue === "object" ? structuredClone(inputValue) : null;
      if (!value || value.observationKind !== "expiry" || value.producerId !== config.producerId) throw new Error("producer_unavailable");
      value.observedAt = producerClockV2(config); value.observationDigest = digestV2("shield.feature-integration.observation.v2:expiry", value, "observationDigest");
      return signedEnvelopeFromProducerV2(config, "shield.feature-integration.observation.v2:expiry", value);
    },
  };
  if (Reflect.ownKeys(producer).length !== PRODUCER_METHODS_V2.length || PRODUCER_METHODS_V2.some((method) => typeof producer[method] !== "function")) return { state: "unavailable", reason: "producer_unavailable" };
  return { state: "ready", producer: Object.freeze(producer) };
}
function requestDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}
function trustedObservedAt(options) {
  let value;
  try { value = typeof options.now === "function" ? options.now() : new Date().toISOString(); }
  catch { return null; }
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? { value, provenance: "hostTrusted" } : null;
}
function workspaceTarget(prepared) {
  const candidate = prepared.candidate, payload = prepared.entry.payload;
  if (candidate.derivationKind === "feature_branch_create") return { targetRef: `refs/heads/${candidate.targetBranch}`, targetBaseBranch: null, expectedHeadRevision: candidate.sourceRevision, expectedTreeDigest: payload.expectedTreeDigest };
  if (candidate.derivationKind === "feature_workspace_draft_pr_create") return { targetRef: `refs/heads/${candidate.sourceBranch}`, targetBaseBranch: candidate.targetBranch, expectedHeadRevision: payload.expectedHeadRevision, expectedTreeDigest: payload.expectedTreeDigest };
  if (candidate.derivationKind === "child_initiation") return { targetRef: `refs/heads/${candidate.childBranch}`, targetBaseBranch: null, expectedHeadRevision: candidate.sourceFeatureHead, expectedTreeDigest: payload.expectedTreeDigest };
  if (candidate.derivationKind === "child_draft_pr_create") return { targetRef: `refs/heads/${candidate.childBranch}`, targetBaseBranch: candidate.targetBranch, expectedHeadRevision: candidate.childHeadRevision, expectedTreeDigest: null };
  return null;
}
function createWorkspaceObservation(prepared, challengeId, target, status, observedHeadRevision, observedTreeDigest, pullRequests, observedAt) {
  const observation = {
    schemaVersion: 1,
    contractVersion: "feature.integration.v1",
    observationKind: "workspace_effect",
    preparationEntryDigest: prepared.entry.entryDigest,
    candidateDigest: prepared.entry.payload.candidateDigest,
    effectKey: prepared.entry.payload.effectKey,
    requestDigest: prepared.entry.payload.requestDigest,
    repositoryId: prepared.candidate.repositoryId,
    derivationKind: prepared.candidate.derivationKind,
    challengeId,
    ...target,
    status,
    observedHeadRevision,
    observedTreeDigest,
    pullRequests: [...pullRequests].sort((left, right) => left.pullRequestId < right.pullRequestId ? -1 : left.pullRequestId > right.pullRequestId ? 1 : 0),
    observationProvenance: `github:workspace:${challengeId}`,
    observedAt,
    observationDigest: `sha256:${"0".repeat(64)}`,
  };
  observation.observationDigest = computeFeatureIntegrationWorkspaceEffectObservationDigestV1(observation);
  return observation;
}
function closedWorkspaceObservation(observation) {
  try {
    const value = exactDataRecord(observation, WORKSPACE_OBSERVATION_FIELDS);
    if (!value || value.schemaVersion !== 1 || value.contractVersion !== "feature.integration.v1" || value.observationKind !== "workspace_effect" ||
        ![value.preparationEntryDigest, value.candidateDigest, value.requestDigest, value.observationDigest].every((item) => DIGEST.test(item)) ||
        ![value.effectKey, value.repositoryId, value.challengeId, value.targetRef, value.expectedHeadRevision, value.observationProvenance].every(text) ||
        !WORKSPACE_DERIVATIONS.includes(value.derivationKind) || !(value.targetBaseBranch === null || text(value.targetBaseBranch)) ||
        !(value.expectedTreeDigest === null || DIGEST.test(value.expectedTreeDigest)) || !["applied", "not_applied", "uncertain"].includes(value.status) ||
        !(value.observedHeadRevision === null || REVISION.test(value.observedHeadRevision)) || !(value.observedTreeDigest === null || DIGEST.test(value.observedTreeDigest)) ||
        (value.status !== "uncertain" && (value.observedHeadRevision === null) !== (value.observedTreeDigest === null))) return null;
    const observedAt = exactDataRecord(value.observedAt, OBSERVED_AT_FIELDS);
    const pullRequests = denseDataArray(value.pullRequests);
    if (!observedAt || observedAt.provenance !== "hostTrusted" || !text(observedAt.value) || !Number.isFinite(Date.parse(observedAt.value)) ||
        value.observationProvenance !== `github:workspace:${value.challengeId}` || !pullRequests) return null;
    let previousPullRequestId = null;
    const closedPullRequests = [];
    for (const item of pullRequests) {
      const pull = exactDataRecord(item, WORKSPACE_PULL_REQUEST_FIELDS);
      if (!pull || ![pull.pullRequestId, pull.url, pull.headBranch, pull.baseBranch].every(text) || typeof pull.draft !== "boolean" || !REVISION.test(pull.headRevision) ||
          (previousPullRequestId !== null && compareUtf16(previousPullRequestId, pull.pullRequestId) >= 0)) return null;
      previousPullRequestId = pull.pullRequestId;
      closedPullRequests.push(pull);
    }
    if (computeFeatureIntegrationWorkspaceEffectObservationDigestV1(observation) !== value.observationDigest) return null;
    return { ...value, pullRequests: closedPullRequests, observedAt };
  } catch { return null; }
}
function exactWorkspaceObservation(prepared, input) {
  const target = workspaceTarget(prepared);
  const observation = closedWorkspaceObservation(input);
  if (!target || !observation) return null;
  try {
    if (observation.preparationEntryDigest !== prepared.entry.entryDigest || observation.candidateDigest !== prepared.entry.payload.candidateDigest || observation.effectKey !== prepared.entry.payload.effectKey || observation.requestDigest !== prepared.entry.payload.requestDigest || observation.repositoryId !== prepared.candidate.repositoryId || observation.derivationKind !== prepared.candidate.derivationKind || observation.targetRef !== target.targetRef || observation.targetBaseBranch !== target.targetBaseBranch || observation.expectedHeadRevision !== target.expectedHeadRevision || observation.expectedTreeDigest !== target.expectedTreeDigest) return null;
    const branchEffect = target.targetBaseBranch === null;
    if (branchEffect) {
      if (observation.pullRequests.length !== 0 || (observation.status === "applied" && (observation.observedHeadRevision !== target.expectedHeadRevision || observation.observedTreeDigest !== target.expectedTreeDigest)) || (observation.status === "not_applied" && (observation.observedHeadRevision !== null || observation.observedTreeDigest !== null))) return null;
    } else {
      if (observation.pullRequests.some((pull) => pull.headBranch !== target.targetRef.slice("refs/heads/".length) || pull.baseBranch !== target.targetBaseBranch) || (observation.status !== "uncertain" && (observation.observedHeadRevision !== target.expectedHeadRevision || !DIGEST.test(observation.observedTreeDigest) || (target.expectedTreeDigest !== null && observation.observedTreeDigest !== target.expectedTreeDigest))) || (observation.status === "not_applied" && observation.pullRequests.length !== 0) || (observation.status === "applied" && (observation.pullRequests.length !== 1 || observation.pullRequests[0].draft !== true || observation.pullRequests[0].headRevision !== target.expectedHeadRevision))) return null;
    }
    return { observation, target };
  } catch { return null; }
}

export function prepareFeatureIntegrationWorkspaceEffectV1(input) {
  if (!input || typeof input !== "object" || !input.replay || !input.candidate || !DIGEST.test(input.requestDigest)) return block("invalid_input");
  const candidate = validateFeatureOperationDerivedCandidateV1(input.candidate);
  if (candidate.state !== "valid") return block("candidate_invalid");
  const expected = STAGES[input.replay.nextStage];
  if (!expected || candidate.value.derivationKind !== expected || input.replay.pendingEffect) return block("stage_ineligible");
  if (candidate.value.repositoryId !== input.replay.replayContext.repositoryId || candidate.value.operationId !== input.replay.replayContext.operationId || candidate.value.planDigest !== input.replay.replayContext.activePlanDigest || candidate.value.authorityDigest !== input.replay.replayContext.verifiedAuthorityDigest) return block("identity_mismatch");
  const entry = createFeatureIntegrationEntryV1({
    operationId: candidate.value.operationId,
    entrySequence: input.replay.nextEntrySequence,
    entryKind: "effect_prepared",
    previousEntryDigest: input.previousEntryDigest,
    payload: {
      effectClass: "feature_operation",
      candidate: candidate.value,
      candidateDigest: candidate.value.candidateDigest,
      effectKey: candidate.value.effectKey,
      requestDigest: input.requestDigest,
      expectedHeadRevision: input.replay.terminalHeadRevision,
      expectedTreeDigest: input.replay.terminalTreeDigest,
    },
  });
  return { state: "prepared", entry, candidate: candidate.value };
}

function refInvocation(candidate, challengeId, adapterOptions) {
  if (candidate.derivationKind === "feature_branch_create") return createFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.targetBranch}`, sourceRevision: candidate.sourceRevision, challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_initiation") return createFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.childBranch}`, sourceRevision: candidate.sourceFeatureHead, challengeId }, adapterOptions);
  return null;
}
function prInvocation(candidate, challengeId, publication, adapterOptions) {
  if (!publication || typeof publication.title !== "string" || typeof publication.body !== "string") return block("publication_input_required");
  if (candidate.derivationKind === "feature_workspace_draft_pr_create") return createFeatureIntegrationDraftPullRequestV1({ repositoryId: candidate.repositoryId, headBranch: candidate.sourceBranch, baseBranch: candidate.targetBranch, title: publication.title, body: publication.body, challengeId }, adapterOptions);
  if (candidate.derivationKind === "child_draft_pr_create") return createFeatureIntegrationDraftPullRequestV1({ repositoryId: candidate.repositoryId, headBranch: candidate.childBranch, baseBranch: candidate.targetBranch, title: publication.title, body: publication.body, challengeId }, adapterOptions);
  return null;
}

export function invokeFeatureIntegrationWorkspaceEffectV1(input, adapterOptions = {}) {
  if (!input || input.prepared?.state !== "prepared" || !challenge(input.challengeId)) return block("prepared_effect_required");
  const candidate = input.prepared.candidate;
  return refInvocation(candidate, input.challengeId, adapterOptions) ?? prInvocation(candidate, input.challengeId, input.publication, adapterOptions) ?? block("unsupported_workspace_effect");
}

export function observeFeatureIntegrationWorkspaceEffectV1(input, adapterOptions = {}) {
  if (!input || input.prepared?.state !== "prepared" || !challenge(input.challengeId)) return block("prepared_effect_required");
  const prepared = input.prepared, candidate = prepared.candidate, target = workspaceTarget(prepared), observedAt = trustedObservedAt(adapterOptions);
  if (!target) return block("unsupported_workspace_effect");
  if (!observedAt) return block("trusted_time_unavailable");
  const branch = observeFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: target.targetRef, challengeId: input.challengeId }, adapterOptions);
  if (target.targetBaseBranch === null) {
    if (branch.state !== "observed") return { state: "observed", observation: createWorkspaceObservation(prepared, input.challengeId, target, "uncertain", null, null, [], observedAt) };
    if (!branch.observation.exists) return { state: "observed", observation: createWorkspaceObservation(prepared, input.challengeId, target, "not_applied", null, null, [], observedAt) };
    const commit = observeFeatureIntegrationCommitV1({ repositoryId: candidate.repositoryId, headRevision: branch.observation.headRevision, challengeId: input.challengeId }, adapterOptions);
    const exact = commit.state === "observed" && branch.observation.headRevision === target.expectedHeadRevision && commit.observation.headRevision === branch.observation.headRevision && commit.observation.treeDigest === target.expectedTreeDigest;
    return { state: "observed", observation: createWorkspaceObservation(prepared, input.challengeId, target, exact ? "applied" : "uncertain", branch.observation.headRevision, commit.state === "observed" ? commit.observation.treeDigest : null, [], observedAt) };
  }
  const inventory = observeFeatureIntegrationDraftPullRequestsV1({ repositoryId: candidate.repositoryId, headBranch: target.targetRef.slice("refs/heads/".length), baseBranch: target.targetBaseBranch, challengeId: input.challengeId }, adapterOptions);
  if (branch.state !== "observed" || !branch.observation.exists || inventory.state !== "observed") return { state: "observed", observation: createWorkspaceObservation(prepared, input.challengeId, target, "uncertain", branch.state === "observed" && branch.observation.exists ? branch.observation.headRevision : null, null, inventory.state === "observed" ? inventory.observation.pullRequests : [], observedAt) };
  const commit = observeFeatureIntegrationCommitV1({ repositoryId: candidate.repositoryId, headRevision: branch.observation.headRevision, challengeId: input.challengeId }, adapterOptions);
  const pulls = inventory.observation.pullRequests;
  const branchExact = commit.state === "observed" && branch.observation.headRevision === target.expectedHeadRevision && commit.observation.headRevision === branch.observation.headRevision && (target.expectedTreeDigest === null || commit.observation.treeDigest === target.expectedTreeDigest);
  const pullExact = pulls.length === 1 && pulls[0].draft === true && pulls[0].headRevision === target.expectedHeadRevision && pulls[0].headBranch === target.targetRef.slice("refs/heads/".length) && pulls[0].baseBranch === target.targetBaseBranch;
  const status = !branchExact ? "uncertain" : pulls.length === 0 ? "not_applied" : pullExact ? "applied" : "uncertain";
  return { state: "observed", observation: createWorkspaceObservation(prepared, input.challengeId, target, status, branch.observation.headRevision, commit.state === "observed" ? commit.observation.treeDigest : null, pulls, observedAt) };
}

export function reconcileFeatureIntegrationWorkspaceEffectV1(input) {
  if (!input || input.prepared?.state !== "prepared" || !input.observation) return block("reconciliation_input_required");
  const { candidate, entry: prepared } = input.prepared;
  const checked = input.observation.state === "observed" ? exactWorkspaceObservation(input.prepared, input.observation.observation) : null;
  if (!checked) return block("observation_untrusted");
  const observation = checked.observation;
  const common = { preparationEntryDigest: prepared.entryDigest, observationProvenance: observation.observationProvenance, observedAt: observation.observedAt, effectObservation: observation };
  if (observation.status === "uncertain") {
    if (observation.targetBaseBranch !== null && observation.pullRequests.length > 1) return block("ambiguous_pull_requests");
    return block(observation.targetBaseBranch === null ? "branch_drift" : "pull_request_mismatch");
  }
  let entryKind; let payload;
  if (candidate.derivationKind === "feature_branch_create" || candidate.derivationKind === "child_initiation") {
    if (observation.status === "not_applied") return { state: "not_applied", entryKind: "effect_not_applied", payload: common };
    entryKind = candidate.derivationKind === "feature_branch_create" ? "feature_branch_creation_accepted" : "child_initiation_accepted";
    payload = candidate.derivationKind === "feature_branch_create"
      ? { ...common, headRevision: observation.observedHeadRevision, treeDigest: observation.observedTreeDigest }
      : { ...common, childId: candidate.childId, branch: candidate.childBranch, baseHeadRevision: observation.observedHeadRevision, baseTreeDigest: observation.observedTreeDigest };
  } else {
    if (observation.status === "not_applied") return { state: "not_applied", entryKind: "effect_not_applied", payload: common };
    const pull = observation.pullRequests[0];
    entryKind = candidate.derivationKind === "feature_workspace_draft_pr_create" ? "feature_workspace_accepted" : "child_publication_accepted";
    payload = { ...common, ...(candidate.childId ? { childId: candidate.childId } : {}), pullRequestId: pull.pullRequestId, sourceBranch: pull.headBranch, targetBranch: pull.baseBranch, headRevision: pull.headRevision, draft: true };
  }
  return { state: "accepted", entryKind, payload };
}

/** Executes at most one already-derived workspace stage and journals every boundary. */
export async function executeFeatureIntegrationWorkspaceStageV1(input, adapterOptions = {}) {
  const current = await readFeatureOperationJournalStoreV1(input.storeScope);
  if (current.state !== "accepted" || !current.value.journal) return current;
  const replay = replayFeatureOperationJournalV1(current.value.journal); if (replay.state !== "valid") return block("replay_invalid");
  const prepared = prepareFeatureIntegrationWorkspaceEffectV1({ replay: replay.value, candidate: input.candidate, requestDigest: input.requestDigest ?? requestDigest(input.candidate), previousEntryDigest: current.value.journal.latestAcceptedEntryDigest });
  if (prepared.state !== "prepared") return prepared;
  const appended = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: replay.value.nextEntrySequence, expectedLatestEntryDigest: current.value.journal.latestAcceptedEntryDigest, entry: prepared.entry });
  if (appended.state !== "accepted") return appended;
  const invocation = invokeFeatureIntegrationWorkspaceEffectV1({ prepared, challengeId: input.challengeId, publication: input.publication }, adapterOptions);
  const observation = observeFeatureIntegrationWorkspaceEffectV1({ prepared, challengeId: input.challengeId }, adapterOptions);
  const reconciled = reconcileFeatureIntegrationWorkspaceEffectV1({ prepared, observation });
  if (reconciled.state === "blocked") {
    const checkedObservation = observation.state === "observed" ? exactWorkspaceObservation(prepared, observation.observation) : null;
    if (!checkedObservation) return { state: "recovery_required", reason: reconciled.reason, invocation };
    const uncertain = createFeatureIntegrationEntryV1({ operationId: prepared.entry.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind: "effect_uncertain", previousEntryDigest: prepared.entry.entryDigest, payload: { preparationEntryDigest: prepared.entry.entryDigest, observationProvenance: checkedObservation.observation.observationProvenance, observedAt: checkedObservation.observation.observedAt, effectObservation: checkedObservation.observation } });
    const marked = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: uncertain.entrySequence, expectedLatestEntryDigest: prepared.entry.entryDigest, entry: uncertain });
    return marked.state === "accepted" ? { state: "recovery_required", reason: reconciled.reason, invocation, journal: marked.value.journal } : marked;
  }
  const terminal = createFeatureIntegrationEntryV1({ operationId: prepared.entry.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind: reconciled.entryKind, previousEntryDigest: prepared.entry.entryDigest, payload: reconciled.payload });
  const terminalResult = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: terminal.entrySequence, expectedLatestEntryDigest: prepared.entry.entryDigest, entry: terminal });
  return terminalResult.state === "accepted" ? { state: reconciled.state, journal: terminalResult.value.journal, invocation } : terminalResult;
}

const STORE_IDENTIFIER_V2 = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;

function storeAcceptedV2(value) { return { state: "accepted", value: Object.freeze(structuredClone(value)) }; }
function storeBlockedV2(reason) { return { state: "blocked", reason }; }
function storeSafeNameV2(operationId) { return createHash("sha256").update(operationId, "utf8").digest("hex"); }

function strictStoreScopeV2(input) {
  const value = exactDataRecord(input, ["repositoryRoot", "operationId", "lockOwnerId", "trustAnchor"]);
  if (!value || !text(value.repositoryRoot) || !STORE_IDENTIFIER_V2.test(value.operationId) || !STORE_IDENTIFIER_V2.test(value.lockOwnerId) ||
      !value.trustAnchor || typeof value.trustAnchor !== "object") return null;
  try { return structuredClone(value); }
  catch { return null; }
}

async function resolveStorePathsV2(scope) {
  try {
    const repositoryRoot = await realpath(scope.repositoryRoot);
    const directoryPath = join(repositoryRoot, ".shield", "feature-integration-v2");
    const journalPath = join(directoryPath, `${storeSafeNameV2(scope.operationId)}.json`);
    const lockPath = `${journalPath}.lock`;
    const rel = relative(repositoryRoot, journalPath);
    if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(journalPath) !== journalPath) return null;
    return { repositoryRoot, directoryPath, journalPath, lockPath };
  } catch { return null; }
}

async function pathKindV2(path, expected) {
  try {
    const stat = await lstat(path);
    return !stat.isSymbolicLink() && (expected === "file" ? stat.isFile() : stat.isDirectory()) ? expected : "unsafe";
  } catch (error) { return error?.code === "ENOENT" ? "missing" : "unsafe"; }
}

async function safeStoreParentsV2(paths, create) {
  for (const directory of [dirname(paths.directoryPath), paths.directoryPath]) {
    let kind = await pathKindV2(directory, "directory");
    if (kind === "missing" && create) {
      try { await mkdir(directory, { mode: 0o700 }); kind = await pathKindV2(directory, "directory"); }
      catch { return false; }
    }
    if (kind !== "directory") return false;
  }
  return true;
}

function sameFileIdentityV2(left, right) { return left.dev === right.dev && left.ino === right.ino; }

async function readRetainedJournalBytesV2(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptorBefore = await handle.stat();
    const pathBefore = await lstat(path);
    if (!descriptorBefore.isFile() || descriptorBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.isSymbolicLink() ||
        !sameFileIdentityV2(descriptorBefore, pathBefore)) return { state: "unsafe" };
    const bytes = await handle.readFile("utf8");
    const descriptorAfter = await handle.stat();
    const pathAfter = await lstat(path);
    if (!descriptorAfter.isFile() || descriptorAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.isSymbolicLink() ||
        !sameFileIdentityV2(descriptorBefore, descriptorAfter) || !sameFileIdentityV2(descriptorBefore, pathAfter) ||
        descriptorBefore.mode !== descriptorAfter.mode || descriptorBefore.mode !== pathAfter.mode) return { state: "unsafe" };
    return { state: "accepted", bytes, mode: descriptorBefore.mode & 0o777 };
  } catch (error) {
    if (error?.code === "ENOENT" && !handle) return { state: "missing" };
    return { state: error?.code === "ELOOP" || error?.code === "ENOENT" ? "unsafe" : "failed" };
  } finally { try { await handle?.close(); } catch {} }
}

function parseStoredJournalV2(bytes, scope) {
  try {
    if (!bytes.endsWith("\n") || bytes.slice(0, -1).includes("\n")) return storeBlockedV2("journal_invalid");
    const parsed = JSON.parse(bytes.slice(0, -1));
    const checked = validateFeatureOperationJournalV2(parsed);
    if (checked.state !== "valid" || checked.value.operationId !== scope.operationId ||
        `${canonicalFeatureIntegrationJsonV1(checked.value)}\n` !== bytes) return storeBlockedV2("journal_invalid");
    const replayed = secureReplayFeatureOperationJournalV2(checked.value, scope.trustAnchor);
    return replayed.state === "valid" ? storeAcceptedV2({ journal: checked.value, bytes }) : storeBlockedV2("replay_invalid");
  } catch { return storeBlockedV2("journal_invalid"); }
}

async function readStoredJournalV2(scope) {
  const paths = await resolveStorePathsV2(scope);
  if (!paths) return storeBlockedV2("repository_unavailable");
  if (!(await safeStoreParentsV2(paths, false))) {
    const kinds = await Promise.all([dirname(paths.directoryPath), paths.directoryPath].map((path) => pathKindV2(path, "directory")));
    return kinds.includes("missing") && !kinds.includes("unsafe")
      ? storeAcceptedV2({ journal: null, bytes: "", journalPath: paths.journalPath }) : storeBlockedV2("unsafe_file");
  }
  const retained = await readRetainedJournalBytesV2(paths.journalPath);
  if (retained.state === "missing") return storeAcceptedV2({ journal: null, bytes: "", journalPath: paths.journalPath });
  if (retained.state !== "accepted") return storeBlockedV2(retained.state === "unsafe" ? "unsafe_file" : "read_failed");
  const parsed = parseStoredJournalV2(retained.bytes, scope);
  return parsed.state === "accepted" ? storeAcceptedV2({ ...parsed.value, journalPath: paths.journalPath }) : parsed;
}

async function retainedLockOwnedV2(handle, path, ownerBytes, acquiredIdentity = null) {
  try {
    const descriptor = await handle.stat();
    const pathStat = await lstat(path);
    if (!descriptor.isFile() || descriptor.isSymbolicLink() || !pathStat.isFile() || pathStat.isSymbolicLink() ||
        !sameFileIdentityV2(descriptor, pathStat) || (acquiredIdentity && !sameFileIdentityV2(descriptor, acquiredIdentity)) || descriptor.size !== ownerBytes.length) return null;
    const observed = Buffer.alloc(ownerBytes.length);
    const { bytesRead } = await handle.read(observed, 0, observed.length, 0);
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    return bytesRead === ownerBytes.length && observed.equals(ownerBytes) && sameFileIdentityV2(descriptor, after) && sameFileIdentityV2(descriptor, pathAfter)
      ? { dev: descriptor.dev, ino: descriptor.ino } : null;
  } catch { return null; }
}

async function withStoreLockV2(scope, run) {
  const paths = await resolveStorePathsV2(scope);
  if (!paths) return storeBlockedV2("repository_unavailable");
  if (!(await safeStoreParentsV2(paths, true))) return storeBlockedV2("unsafe_file");
  let handle;
  const ownerBytes = Buffer.from(`${scope.lockOwnerId}\n`, "utf8");
  let acquiredIdentity;
  try {
    handle = await open(paths.lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(ownerBytes); await handle.sync();
    acquiredIdentity = await retainedLockOwnedV2(handle, paths.lockPath, ownerBytes);
    if (!acquiredIdentity) {
      try { await unlink(paths.lockPath); } catch {}
      return storeBlockedV2("lock_failed");
    }
    const result = await run(paths);
    if (!await retainedLockOwnedV2(handle, paths.lockPath, ownerBytes, acquiredIdentity)) {
      return { state: "recovery_required", reason: "durability_uncertain" };
    }
    try { await unlink(paths.lockPath); await handle.close(); handle = undefined; }
    catch { return { state: "recovery_required", reason: "durability_uncertain" }; }
    return result;
  } catch (error) {
    return storeBlockedV2(error?.code === "EEXIST" ? "compare_conflict" : "lock_failed");
  } finally {
    if (handle) {
      if (acquiredIdentity && await retainedLockOwnedV2(handle, paths.lockPath, ownerBytes, acquiredIdentity)) {
        try { await unlink(paths.lockPath); } catch {}
      }
      try { await handle.close(); } catch {}
    }
  }
}

async function replaceStoredJournalV2(paths, journal, mode) {
  const bytes = `${canonicalFeatureIntegrationJsonV1(journal)}\n`;
  const temporaryPath = join(paths.directoryPath, `.${storeSafeNameV2(journal.operationId)}.${randomUUID()}.tmp`);
  let handle;
  let renamed = false;
  try {
    handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    await handle.writeFile(bytes, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporaryPath, paths.journalPath); renamed = true;
    const file = await open(paths.journalPath, constants.O_RDONLY | constants.O_NOFOLLOW); await file.sync(); await file.close();
    const directory = await open(paths.directoryPath, constants.O_RDONLY | constants.O_DIRECTORY); await directory.sync(); await directory.close();
    const observed = await readRetainedJournalBytesV2(paths.journalPath);
    if (observed.state !== "accepted" || observed.bytes !== bytes) return { state: "recovery_required", reason: "durability_uncertain" };
    return storeAcceptedV2({ journal, bytes, journalPath: paths.journalPath });
  } catch {
    if (!renamed) { try { await unlink(temporaryPath); } catch {} return storeBlockedV2("write_failed"); }
    return { state: "recovery_required", reason: "durability_uncertain" };
  } finally { try { await handle?.close(); } catch {} }
}

/** Creates the V2-only durable journal store used by the hardened stage owner. */
export async function createFeatureOperationJournalStoreV2(input) {
  const scope = strictStoreScopeV2(input);
  if (!scope || !await resolveStorePathsV2(scope)) return { state: "blocked", reason: "invalid_input" };
  const store = {
    async initializeJournal(inputValue) {
      const value = exactDataRecord(inputValue, ["journal"]);
      const checked = value ? validateFeatureOperationJournalV2(value.journal) : { state: "invalid" };
      if (checked.state !== "valid" || checked.value.operationId !== scope.operationId ||
          secureReplayFeatureOperationJournalV2(checked.value, scope.trustAnchor).state !== "valid") return storeBlockedV2("journal_invalid");
      return withStoreLockV2(scope, async (paths) => {
        const current = await readStoredJournalV2(scope);
        if (current.state !== "accepted") return current;
        if (current.value.journal) return current.value.journal.journalDigest === checked.value.journalDigest ? current : storeBlockedV2("compare_conflict");
        return replaceStoredJournalV2(paths, checked.value, 0o600);
      });
    },
    async readJournal() { return readStoredJournalV2(scope); },
    async appendEntry(inputValue) {
      const value = exactDataRecord(inputValue, ["expectedJournalDigest", "expectedEntrySequence", "expectedLatestEntryDigest", "entry"]);
      if (!value || !DIGEST.test(value.expectedJournalDigest) || !Number.isSafeInteger(value.expectedEntrySequence) || value.expectedEntrySequence < 1 ||
          !DIGEST.test(value.expectedLatestEntryDigest)) return storeBlockedV2("invalid_input");
      return withStoreLockV2(scope, async (paths) => {
        const current = await readStoredJournalV2(scope);
        if (current.state !== "accepted" || !current.value.journal) return current.state === "accepted" ? storeBlockedV2("journal_missing") : current;
        const journal = current.value.journal;
        const existing = journal.entries[value.expectedEntrySequence];
        if (existing) return existing.entryDigest === value.entry?.entryDigest ? current : storeBlockedV2("compare_conflict");
        if (journal.journalDigest !== value.expectedJournalDigest || journal.entries.length !== value.expectedEntrySequence ||
            journal.latestAcceptedEntryDigest !== value.expectedLatestEntryDigest || value.entry?.entrySequence !== value.expectedEntrySequence ||
            value.entry?.previousEntryDigest !== value.expectedLatestEntryDigest) return storeBlockedV2("compare_conflict");
        let candidate;
        try { candidate = createFeatureOperationJournalV2([...journal.entries, value.entry]); }
        catch { return storeBlockedV2("journal_invalid"); }
        if (secureReplayFeatureOperationJournalV2(candidate, scope.trustAnchor).state !== "valid") return storeBlockedV2("replay_invalid");
        const stat = await lstat(paths.journalPath);
        return replaceStoredJournalV2(paths, candidate, stat.mode & 0o777);
      });
    },
    async recoverJournal(inputValue) {
      const value = exactDataRecord(inputValue, ["baselineJournalDigest", "candidateJournalDigest"]);
      if (!value || !DIGEST.test(value.baselineJournalDigest) || !DIGEST.test(value.candidateJournalDigest)) return storeBlockedV2("invalid_input");
      const current = await readStoredJournalV2(scope);
      if (current.state !== "accepted" || !current.value.journal) return storeBlockedV2("recovery_unverifiable");
      const digest = current.value.journal.journalDigest;
      if (digest === value.candidateJournalDigest) return storeAcceptedV2({ classification: "complete_candidate", journal: current.value.journal });
      if (digest === value.baselineJournalDigest) return storeAcceptedV2({ classification: "unchanged_baseline", journal: current.value.journal });
      return storeBlockedV2("recovery_unverifiable");
    },
  };
  return { state: "ready", store: Object.freeze(store) };
}

function stageResultV2(state, reason, appendedEntryDigest = null) {
  return reason ? { state, reason, appendedEntryDigest } : { state, appendedEntryDigest };
}

function exactStageInputV2(input) {
  return exactDataRecord(input, ["stage", "candidate", "request"]) ??
    exactDataRecord(input, ["stage", "signedChallenge"]);
}

async function readStageJournalV2(store, expected, trustAnchor) {
  let read;
  try { read = await store.readJournal(); }
  catch { return { state: "recovery_required", reason: "durability_uncertain" }; }
  if (read?.state === "recovery_required") return { state: "recovery_required", reason: "durability_uncertain" };
  if (read?.state !== "accepted" || !read.value?.journal) return { state: "blocked", reason: "compare_conflict" };
  if (canonicalFeatureIntegrationJsonV1(read.value.journal) !== canonicalFeatureIntegrationJsonV1(expected)) return { state: "blocked", reason: "compare_conflict" };
  const replayed = secureReplayFeatureOperationJournalV2(read.value.journal, trustAnchor);
  return replayed.state === "valid" ? { state: "accepted", journal: read.value.journal, replay: replayed.value } : { state: "blocked", reason: "replay_invalid" };
}

async function appendStageEntryV2(store, journal, entry, trustAnchor) {
  let expected;
  try { expected = createFeatureOperationJournalV2([...journal.entries, entry]); }
  catch { return { state: "blocked", reason: "replay_invalid" }; }
  const replayed = secureReplayFeatureOperationJournalV2(expected, trustAnchor);
  if (replayed.state !== "valid") return { state: "blocked", reason: replayed.reason === "GENESIS_INVALID" ? "authorization_invalid" : "replay_invalid" };
  let appended;
  try {
    appended = await store.appendEntry({ expectedJournalDigest: journal.journalDigest, expectedEntrySequence: entry.entrySequence,
      expectedLatestEntryDigest: journal.latestAcceptedEntryDigest, entry });
  } catch { appended = { state: "recovery_required" }; }
  if (appended?.state === "recovery_required") {
    let recovered;
    try { recovered = await store.recoverJournal({ baselineJournalDigest: journal.journalDigest, candidateJournalDigest: expected.journalDigest }); }
    catch { return { state: "recovery_required", reason: "durability_uncertain" }; }
    if (recovered?.state !== "accepted" || recovered.value?.classification !== "complete_candidate" ||
        canonicalFeatureIntegrationJsonV1(recovered.value.journal) !== canonicalFeatureIntegrationJsonV1(expected)) {
      return { state: "recovery_required", reason: "durability_uncertain" };
    }
  } else if (appended?.state !== "accepted" || !appended.value?.journal) {
    return { state: "blocked", reason: "compare_conflict" };
  }
  const readback = await readStageJournalV2(store, expected, trustAnchor);
  return readback.state === "accepted" ? { state: "accepted", journal: readback.journal, replay: readback.replay }
    : { state: "recovery_required", reason: "durability_uncertain" };
}

/** Owns one replay-bound transition stage from prepare through durable reconciliation. */
export async function executeFeatureIntegrationWorkspaceStageV2(input) {
  const value = exactDataRecord(input, ["stage", "replay", "journal", "stageInput", "storeScope", "trustAnchor", "repositoryProducer"]);
  if (!value || !["integration", "rollback"].includes(value.stage) ||
      !value.replay || typeof value.replay !== "object" || value.replay.nextStage !== value.stage || !value.journal || typeof value.journal !== "object" ||
      !value.stageInput || typeof value.stageInput !== "object" || value.stageInput.stage !== value.stage || !value.storeScope || typeof value.storeScope !== "object" ||
      !value.trustAnchor || typeof value.trustAnchor !== "object" || !value.repositoryProducer || typeof value.repositoryProducer !== "object") {
    return { state: "blocked", reason: "invalid_input", appendedEntryDigest: null };
  }
  const store = exactDataRecord(value.storeScope, ["initializeJournal", "readJournal", "appendEntry", "recoverJournal"]);
  const stageInput = exactStageInputV2(value.stageInput);
  if (!store || typeof store.initializeJournal !== "function" || typeof store.readJournal !== "function" || typeof store.appendEntry !== "function" ||
      typeof store.recoverJournal !== "function" || !stageInput ||
      typeof value.repositoryProducer.executeTransition !== "function" || typeof value.repositoryProducer.observeAndSignTransition !== "function") {
    return stageResultV2("blocked", "invalid_input");
  }
  const current = await readStageJournalV2(store, value.journal, value.trustAnchor);
  if (current.state !== "accepted") return stageResultV2(current.state, current.reason);
  if (canonicalFeatureIntegrationJsonV1(current.replay) !== canonicalFeatureIntegrationJsonV1(value.replay) || current.replay.nextStage !== value.stage) {
    return stageResultV2("blocked", "compare_conflict");
  }

  let journal = current.journal;
  let replay = current.replay;
  let preparedEntry;
  let candidate;
  let request;
  if (replay.pendingEffect) {
    preparedEntry = journal.entries.find((entry) => entry.entryDigest === replay.pendingEffect.preparationEntryDigest);
    candidate = preparedEntry?.payload?.candidate;
    request = replay.pendingEffect.request;
    if (!preparedEntry || preparedEntry.entryKind !== "effect_prepared" || !candidate || !request) return stageResultV2("blocked", "replay_invalid");
    if (replay.uncertainEffect) {
      if (!stageInput.signedChallenge) return stageResultV2("blocked", "invalid_input");
      const refresh = createFeatureIntegrationEntryV2({ operationId: journal.operationId, entrySequence: replay.nextEntrySequence,
        entryKind: "effect_challenge_refreshed", previousEntryDigest: journal.latestAcceptedEntryDigest,
        payload: { preparationEntryDigest: preparedEntry.entryDigest, signedChallenge: stageInput.signedChallenge } });
      const refreshed = await appendStageEntryV2(store, journal, refresh, value.trustAnchor);
      if (refreshed.state !== "accepted") return stageResultV2(refreshed.state, refreshed.reason);
      journal = refreshed.journal; replay = refreshed.replay;
    }
  } else {
    if (!stageInput.candidate || !stageInput.request || stageInput.request.signedChallenge === undefined) return stageResultV2("blocked", "invalid_input");
    candidate = stageInput.candidate; request = stageInput.request;
    let prepared;
    try {
      prepared = createFeatureIntegrationEntryV2({ operationId: replay.replayContext.operationId, entrySequence: replay.nextEntrySequence,
        entryKind: "effect_prepared", previousEntryDigest: journal.latestAcceptedEntryDigest,
        payload: { effectClass: "transition", candidate, candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey,
          request, requestDigest: request.requestDigest, expectedHeadRevision: replay.terminalHeadRevision,
          expectedTreeDigest: replay.terminalTreeDigest, signedCumulativeAuthority: null } });
    } catch { return stageResultV2("blocked", "authorization_invalid"); }
    const appended = await appendStageEntryV2(store, journal, prepared, value.trustAnchor);
    if (appended.state !== "accepted") return stageResultV2(appended.state, appended.reason);
    journal = appended.journal; replay = appended.replay; preparedEntry = prepared;
    try { await value.repositoryProducer.executeTransition({ request, preparationEntryDigest: prepared.entryDigest }); }
    catch { /* Independent observation determines whether the attempted effect applied. */ }
  }

  const signedChallenge = replay.pendingEffect.signedChallenges.at(-1);
  let signedObservation;
  try {
    signedObservation = await value.repositoryProducer.observeAndSignTransition({ request, preparationEntryDigest: preparedEntry.entryDigest,
      signedChallenge, ...(candidate.derivationKind === "child_revert_on_feature" ? { expectedRestoredTreeDigest: candidate.expectedRestoredTreeDigest } : {}) });
  } catch { return stageResultV2("recovery_required", "effect_uncertain"); }
  const status = signedObservation?.payload?.status;
  const entryKind = status === "applied" ? (candidate.derivationKind === "child_revert_on_feature" ? "rollback_accepted" : "integration_accepted")
    : status === "not_applied" ? "effect_not_applied" : status === "uncertain" ? "effect_uncertain" : null;
  if (!entryKind) return stageResultV2("recovery_required", "authentication_unavailable");
  let terminal;
  try {
    terminal = createFeatureIntegrationEntryV2({ operationId: journal.operationId, entrySequence: replay.nextEntrySequence,
      entryKind, previousEntryDigest: journal.latestAcceptedEntryDigest,
      payload: entryKind === "integration_accepted" || entryKind === "rollback_accepted"
        ? { preparationEntryDigest: preparedEntry.entryDigest, signedTransitionObservation: signedObservation }
        : { preparationEntryDigest: preparedEntry.entryDigest, signedObservation } });
  } catch { return stageResultV2("recovery_required", "authentication_unavailable"); }
  const appended = await appendStageEntryV2(store, journal, terminal, value.trustAnchor);
  if (appended.state !== "accepted") return stageResultV2(appended.state, appended.reason);
  return entryKind === "effect_uncertain" ? stageResultV2("recovery_required", "effect_uncertain", terminal.entryDigest)
    : stageResultV2("accepted", null, terminal.entryDigest);
}

function sortedUniqueStringsV2(value, validate) {
  const items = denseDataArray(value);
  return items && items.length > 0 && items.every(validate) && new Set(items).size === items.length &&
    items.every((item, index) => index === 0 || compareUtf16(items[index - 1], item) < 0) ? items : null;
}

export function computeGovernedRollbackWorkspaceReceiptDigestV2(input) {
  const value = input && typeof input === "object" ? structuredClone(input) : null;
  if (!value) throw new TypeError("Governed rollback workspace receipt is invalid.");
  delete value.completionReceiptDigest;
  return digestV2("shield.feature-integration.rollback-workspace-receipt.v2", value);
}

/** Produces the V2 rollback handoff only at the authenticated journal transition. */
export function createRollbackMissionHandoffReadyV2(input) {
  const value = exactDataRecord(input, ["replay"]);
  if (!value || value.replay?.nextStage !== "rollback_mission_handoff") return block("rollback_handoff_ineligible");
  return createRollbackMissionHandoffReadyV1(value);
}

/** Authenticates one governed rollback mission and durably accepts its V2 workspace receipt. */
export async function acceptGovernedRollbackWorkspaceV2(input) {
  const raw = exactDataRecord(input, ["replay", "journal", "handoff", "sourceJournal", "receipt", "storeScope", "trustAnchor"]);
  if (!raw || !raw.replay || typeof raw.replay !== "object" || !raw.journal || typeof raw.journal !== "object" ||
      !raw.trustAnchor || typeof raw.trustAnchor !== "object") return stageResultV2("blocked", "invalid_input");
  let value;
  try {
    value = { ...structuredClone({ replay: raw.replay, journal: raw.journal, handoff: raw.handoff, sourceJournal: raw.sourceJournal,
      receipt: raw.receipt, trustAnchor: raw.trustAnchor }), storeScope: raw.storeScope };
  } catch { return stageResultV2("blocked", "invalid_input"); }
  const store = exactDataRecord(raw.storeScope, ["initializeJournal", "readJournal", "appendEntry", "recoverJournal"]);
  if (!store || [store.initializeJournal, store.readJournal, store.appendEntry, store.recoverJournal].some((method) => typeof method !== "function")) {
    return stageResultV2("blocked", "invalid_input");
  }
  const current = await readStageJournalV2(store, value.journal, value.trustAnchor);
  if (current.state !== "accepted") return stageResultV2(current.state, current.reason);
  if (canonicalFeatureIntegrationJsonV1(current.replay) !== canonicalFeatureIntegrationJsonV1(value.replay)) return stageResultV2("blocked", "compare_conflict");
  const expectedHandoff = createRollbackMissionHandoffReadyV2({ replay: current.replay });
  if (expectedHandoff.state !== "rollback_mission_handoff_ready" ||
      canonicalFeatureIntegrationJsonV1(expectedHandoff) !== canonicalFeatureIntegrationJsonV1(value.handoff)) {
    return stageResultV2("blocked", "rollback_handoff_invalid");
  }
  const receiptFields = ["sourceMissionId", "repositoryId", "baseHeadRevision", "rollbackBranch", "restoredTreeDigest", "pullRequestId",
    "pullRequestHeadRevision", "pullRequestTargetBranch", "draft", "sourceAuthorityDigest", "sourceJournalDigest", "completionReceiptDigest",
    "sourceEffectKeys", "evidenceDigests"];
  const receipt = exactDataRecord(value.receipt, receiptFields);
  const sourceEffectKeys = receipt ? sortedUniqueStringsV2(receipt.sourceEffectKeys, (item) => text(item)) : null;
  const evidenceDigests = receipt ? sortedUniqueStringsV2(receipt.evidenceDigests, (item) => DIGEST.test(item)) : null;
  if (!receipt || !sourceEffectKeys || !evidenceDigests || evidenceDigests.length < 2 || !REVISION.test(receipt.baseHeadRevision) ||
      !REVISION.test(receipt.pullRequestHeadRevision) || !DIGEST.test(receipt.restoredTreeDigest) || !AUTHORITY_DIGEST_V2.test(receipt.sourceAuthorityDigest) ||
      !DIGEST.test(receipt.sourceJournalDigest) || !DIGEST.test(receipt.completionReceiptDigest) || !text(receipt.pullRequestId) ||
      !text(receipt.rollbackBranch) || !text(receipt.pullRequestTargetBranch) || receipt.draft !== true ||
      computeGovernedRollbackWorkspaceReceiptDigestV2(receipt) !== receipt.completionReceiptDigest) {
    return stageResultV2("blocked", "rollback_workspace_receipt_invalid");
  }
  if (receipt.sourceMissionId !== expectedHandoff.requiredSourceMissionId || receipt.repositoryId !== expectedHandoff.repositoryId ||
      receipt.baseHeadRevision !== expectedHandoff.currentHeadRevision || receipt.rollbackBranch !== expectedHandoff.rollbackBranchRequirement ||
      receipt.restoredTreeDigest !== expectedHandoff.expectedRestoredTreeDigest || receipt.pullRequestTargetBranch !== expectedHandoff.draftTargetRequirement ||
      sourceEffectKeys.includes(expectedHandoff.reservedFinalEffectKey)) return stageResultV2("blocked", "rollback_workspace_binding_mismatch");
  const source = replayProfileAwareMissionJournal(value.sourceJournal);
  const authority = source.state === "valid" ? source.value.implementationAuthority : null;
  const effects = source.state === "valid" ? source.value.effects.filter((effect) => effect.outcome === "completed" && sourceEffectKeys.includes(effect.effectKey)) : [];
  const evidenceRefs = [
    `feature-integration:restored-tree:${receipt.restoredTreeDigest}`,
    `feature-integration:rollback-head:${receipt.pullRequestHeadRevision}`,
    `feature-integration:rollback-pr:${receipt.pullRequestId}`,
    ...evidenceDigests.map((item) => `feature-integration:evidence:${item}`),
  ];
  if (source.state !== "valid" || source.value.missionId !== receipt.sourceMissionId || source.value.execution !== "completed" ||
      source.value.implementationAuthorityState !== "authorized" || source.value.implementationAuthorityDigest !== receipt.sourceAuthorityDigest ||
      computeProfileAwareMissionJournalDigestV1(value.sourceJournal) !== receipt.sourceJournalDigest || !authority || authority.seatId !== "may" ||
      authority.repositoryId !== receipt.repositoryId || authority.branch !== receipt.rollbackBranch || authority.headRevision !== receipt.baseHeadRevision ||
      !sourceEffectKeys.every((effectKey) => authority.approvedEffectKeys.includes(effectKey)) || effects.length !== sourceEffectKeys.length ||
      effects.some((effect) => effect.seatId !== "may") || evidenceRefs.some((reference) => !effects.some((effect) => effect.evidenceRefs.includes(reference)))) {
    return stageResultV2("blocked", "rollback_source_journal_invalid");
  }
  let entry;
  try {
    entry = createFeatureIntegrationEntryV2({ operationId: current.journal.operationId, entrySequence: current.replay.nextEntrySequence,
      entryKind: "rollback_workspace_accepted", previousEntryDigest: current.journal.latestAcceptedEntryDigest,
      payload: { childId: expectedHandoff.childId, sourceMissionId: receipt.sourceMissionId, completionReceiptDigest: receipt.completionReceiptDigest,
        sourceAuthorityDigest: receipt.sourceAuthorityDigest, sourceJournalDigest: receipt.sourceJournalDigest, rollbackBranch: receipt.rollbackBranch,
        pullRequestId: receipt.pullRequestId, pullRequestHeadRevision: receipt.pullRequestHeadRevision, targetBranch: receipt.pullRequestTargetBranch,
        restoredTreeDigest: receipt.restoredTreeDigest, sourceEffectKeys: [...sourceEffectKeys], evidenceDigests: [...evidenceDigests] } });
  } catch { return stageResultV2("blocked", "rollback_workspace_receipt_invalid"); }
  const appended = await appendStageEntryV2(store, current.journal, entry, value.trustAnchor);
  return appended.state === "accepted" ? stageResultV2("accepted", null, entry.entryDigest) : stageResultV2(appended.state, appended.reason);
}

export function createRollbackMissionHandoffReadyV1(input) {
  const replay = input?.replay;
  if (!replay || replay.pendingEffect || replay.cumulativeValidation !== "failed" || replay.replayContext.acceptedIntegrations.length === 0) return block("rollback_handoff_ineligible");
  const latest = [...replay.replayContext.acceptedIntegrations].reverse().find((item) => !item.reverted);
  if (!latest || latest.resultingHeadRevision !== replay.terminalHeadRevision || latest.resultingTreeDigest !== replay.terminalTreeDigest) return block("latest_integration_mismatch");
  const child = replay.replayContext.activePlan.children.find((item) => item.childId === latest.childId);
  const effectKey = child?.allowedEffectKeys.find((key) => key.startsWith("effect:child_revert_on_feature:"));
  if (!child || !effectKey || replay.replayContext.consumedEffectKeys.includes(effectKey)) return block("rollback_key_unavailable");
  return { state: "rollback_mission_handoff_ready", performsEffect: false, operationId: replay.replayContext.operationId, childId: child.childId, requiredSourceMissionId: `rollback:${child.childId}`, repositoryId: replay.replayContext.repositoryId, featureBranch: replay.replayContext.activePlan.featureBranch, currentHeadRevision: replay.terminalHeadRevision, currentTreeDigest: replay.terminalTreeDigest, expectedRestoredTreeDigest: latest.priorTreeDigest, revertedIntegrationReceiptDigest: latest.receiptDigest, reservedFinalEffectKey: effectKey, rollbackBranchRequirement: `rollback/${child.childId.replaceAll(":", "-")}`, draftTargetRequirement: replay.replayContext.activePlan.featureBranch };
}

export function acceptGovernedRollbackWorkspaceV1(input) {
  const handoff = input?.handoff, receipt = input?.receipt;
  if (!handoff || handoff.state !== "rollback_mission_handoff_ready" || !receipt || typeof receipt !== "object") return block("rollback_workspace_input_invalid");
  const required = ["sourceMissionId", "repositoryId", "baseHeadRevision", "rollbackBranch", "restoredTreeDigest", "pullRequestId", "pullRequestHeadRevision", "pullRequestTargetBranch", "draft", "sourceAuthorityDigest", "sourceJournalDigest", "completionReceiptDigest", "sourceEffectKeys", "evidenceDigests"];
  if (Reflect.ownKeys(receipt).length !== required.length || required.some((field) => !Object.hasOwn(receipt, field))) return block("rollback_workspace_receipt_invalid");
  if (receipt.sourceMissionId !== handoff.requiredSourceMissionId || receipt.repositoryId !== handoff.repositoryId || receipt.baseHeadRevision !== handoff.currentHeadRevision || receipt.rollbackBranch !== handoff.rollbackBranchRequirement || receipt.restoredTreeDigest !== handoff.expectedRestoredTreeDigest || receipt.pullRequestTargetBranch !== handoff.draftTargetRequirement || receipt.draft !== true || !Array.isArray(receipt.sourceEffectKeys) || !Array.isArray(receipt.evidenceDigests) || receipt.sourceEffectKeys.length === 0 || receipt.evidenceDigests.length < 2 || receipt.sourceEffectKeys.includes(handoff.reservedFinalEffectKey)) return block("rollback_workspace_binding_mismatch");
  if ([receipt.sourceAuthorityDigest, receipt.sourceJournalDigest, receipt.completionReceiptDigest, receipt.restoredTreeDigest, ...receipt.evidenceDigests].some((item) => !DIGEST.test(item))) return block("rollback_workspace_receipt_invalid");
  const source = replayProfileAwareMissionJournal(input.sourceJournal);
  const authority = source.state === "valid" ? source.value.implementationAuthority : null;
  const effects = source.state === "valid" ? source.value.effects.filter((effect) => effect.outcome === "completed" && receipt.sourceEffectKeys.includes(effect.effectKey)) : [];
  const exactEvidence = [`feature-integration:restored-tree:${receipt.restoredTreeDigest}`, `feature-integration:rollback-head:${receipt.pullRequestHeadRevision}`, `feature-integration:rollback-pr:${receipt.pullRequestId}`];
  if (source.state !== "valid" || source.value.missionId !== receipt.sourceMissionId || source.value.execution !== "completed" || source.value.implementationAuthorityState !== "authorized" || source.value.implementationAuthorityDigest !== receipt.sourceAuthorityDigest || computeProfileAwareMissionJournalDigestV1(input.sourceJournal) !== receipt.sourceJournalDigest || !authority || authority.repositoryId !== receipt.repositoryId || authority.branch !== receipt.rollbackBranch || authority.headRevision !== receipt.baseHeadRevision || effects.length !== receipt.sourceEffectKeys.length || exactEvidence.some((reference) => !effects.some((effect) => effect.evidenceRefs.includes(reference)))) return block("rollback_source_journal_invalid");
  const entry = createFeatureIntegrationEntryV1({ operationId: handoff.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "rollback_workspace_accepted", previousEntryDigest: input.previousEntryDigest, payload: { childId: handoff.childId, sourceMissionId: receipt.sourceMissionId, completionReceiptDigest: receipt.completionReceiptDigest, sourceAuthorityDigest: receipt.sourceAuthorityDigest, sourceJournalDigest: receipt.sourceJournalDigest, rollbackBranch: receipt.rollbackBranch, pullRequestId: receipt.pullRequestId, pullRequestHeadRevision: receipt.pullRequestHeadRevision, targetBranch: receipt.pullRequestTargetBranch, restoredTreeDigest: receipt.restoredTreeDigest, sourceEffectKeys: [...receipt.sourceEffectKeys].sort(), evidenceDigests: [...receipt.evidenceDigests].sort() } });
  return { state: "accepted", entry };
}

export function prepareFeatureIntegrationTransitionEffectV1(input) {
  const replay = input?.replay;
  const checked = validateFeatureOperationDerivedCandidateV1(input?.candidate);
  if (!replay || checked.state !== "valid" || !["child_merge_to_feature", "child_revert_on_feature"].includes(checked.value.derivationKind) || replay.pendingEffect || !DIGEST.test(input.requestDigest)) return block("transition_candidate_invalid");
  const candidate = checked.value;
  if (candidate.repositoryId !== replay.replayContext.repositoryId || candidate.operationId !== replay.replayContext.operationId || candidate.targetBranch !== replay.replayContext.activePlan.featureBranch || candidate.targetBranch === "main" || candidate.planDigest !== replay.replayContext.activePlanDigest || candidate.authorityDigest !== replay.replayContext.verifiedAuthorityDigest || replay.replayContext.consumedEffectKeys.includes(candidate.effectKey)) return block("transition_binding_mismatch");
  if (candidate.derivationKind === "child_merge_to_feature" && replay.nextStage !== "integration") return block("transition_stage_ineligible");
  if (candidate.derivationKind === "child_revert_on_feature" && replay.replayContext.lifecycle.state !== "rollback_pending") return block("transition_stage_ineligible");
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: replay.nextEntrySequence, entryKind: "effect_prepared", previousEntryDigest: input.previousEntryDigest, payload: { effectClass: "feature_operation", candidate, candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey, requestDigest: input.requestDigest, expectedHeadRevision: replay.terminalHeadRevision, expectedTreeDigest: replay.terminalTreeDigest } });
  return { state: "prepared", entry, candidate };
}

export function invokeFeatureIntegrationTransitionEffectV1(input, adapterOptions = {}) {
  const prepared = input?.prepared;
  if (!prepared || prepared.state !== "prepared" || !challenge(input.challengeId) || !Number.isInteger(input.pullRequestId)) return block("prepared_transition_required");
  const candidate = prepared.candidate;
  const expectedHeadRevision = candidate.derivationKind === "child_merge_to_feature" ? candidate.childHeadRevision : input.rollbackHeadRevision;
  if (!expectedHeadRevision) return block("transition_head_required");
  return integrateFeatureIntegrationPullRequestV1({ repositoryId: candidate.repositoryId, pullRequestId: input.pullRequestId, expectedHeadRevision, targetFeatureBranch: candidate.targetBranch, integrationMethod: candidate.integrationMethod ?? "merge_commit", challengeId: input.challengeId }, adapterOptions);
}

export function observeFeatureIntegrationTransitionV1(input, adapterOptions = {}) {
  const prepared = input?.prepared;
  if (!prepared || prepared.state !== "prepared" || !challenge(input.challengeId) || !Number.isInteger(input.pullRequestId)) return block("prepared_transition_required");
  const candidate = prepared.candidate;
  const pullRequest = observeFeatureIntegrationPullRequestV1({ repositoryId: candidate.repositoryId, pullRequestId: input.pullRequestId, challengeId: input.challengeId }, adapterOptions);
  const featureRef = observeFeatureIntegrationRefV1({ repositoryId: candidate.repositoryId, fullRef: `refs/heads/${candidate.targetBranch}`, challengeId: input.challengeId }, adapterOptions);
  if (pullRequest.state !== "observed" || featureRef.state !== "observed" || !featureRef.observation.exists) return block("transition_observation_unavailable");
  const commit = observeFeatureIntegrationCommitV1({ repositoryId: candidate.repositoryId, headRevision: featureRef.observation.headRevision, challengeId: input.challengeId }, adapterOptions);
  if (commit.state !== "observed") return block("transition_observation_unavailable");
  return { state: "observed", pullRequest: pullRequest.observation, featureRef: featureRef.observation, commit: commit.observation };
}

export function reconcileFeatureIntegrationTransitionV1(input) {
  const prepared = input?.prepared, observed = input?.observation, identity = input?.identity;
  if (!prepared || prepared.state !== "prepared" || observed?.state !== "observed" || !identity || new Set([identity.seatId, identity.reasoningRuntimeId, identity.modelId, identity.toolExecutorId]).size !== 4) return block("transition_reconciliation_invalid");
  const candidate = prepared.candidate, pull = observed.pullRequest, ref = observed.featureRef, commit = observed.commit;
  if (pull.challengeId !== input.challengeId || ref.challengeId !== input.challengeId || commit.challengeId !== input.challengeId || pull.baseBranch !== candidate.targetBranch || !pull.mergedAt || pull.mergeCommitRevision !== ref.headRevision || commit.headRevision !== ref.headRevision || ref.headRevision === input.priorHeadRevision) return block("transition_observation_mismatch");
  if (pull.checks.some((check) => !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(String(check.status).toUpperCase()))) return block("checks_not_passing");
  const common = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: candidate.operationId, repositoryId: candidate.repositoryId, planDigest: candidate.planDigest, authorityDigest: candidate.authorityDigest, childId: candidate.childId, effectKey: candidate.effectKey, attemptNumber: input.attemptNumber, priorHeadRevision: input.priorHeadRevision, priorTreeDigest: input.priorTreeDigest, resultingHeadRevision: ref.headRevision, resultingTreeDigest: commit.treeDigest, observationProvenance: input.challengeId, observedAt: input.observedAt, ...identity };
  let receipt, entryKind;
  if (candidate.derivationKind === "child_merge_to_feature") {
    receipt = { ...common, childMissionId: candidate.childId, requestDigest: prepared.entry.payload.requestDigest, integrationMethod: candidate.integrationMethod, reconciliationState: "reconciled_applied", childBranch: candidate.childBranch, childHeadRevision: candidate.childHeadRevision, childTreeDigest: candidate.childTreeDigest, childPullRequestId: String(input.pullRequestId), targetFeatureBranch: candidate.targetBranch, evidenceDigests: [...input.evidenceDigests].sort(), receiptDigest: `sha256:${"0".repeat(64)}` };
    receipt.receiptDigest = computeFeatureIntegrationReceiptDigestV1(receipt); entryKind = "integration_accepted";
  } else {
    receipt = { ...common, reconciliationState: "reconciled_applied", revertedIntegrationReceiptDigest: candidate.integrationReceiptDigest, rollbackWorkspaceReceiptDigest: input.rollbackWorkspaceReceiptDigest, receiptDigest: `sha256:${"0".repeat(64)}` };
    receipt.receiptDigest = computeFeatureRollbackReceiptDigestV1(receipt); entryKind = "rollback_accepted";
  }
  const entry = createFeatureIntegrationEntryV1({ operationId: candidate.operationId, entrySequence: prepared.entry.entrySequence + 1, entryKind, previousEntryDigest: prepared.entry.entryDigest, payload: { preparationEntryDigest: prepared.entry.entryDigest, receipt } });
  return { state: "accepted", receipt, entry };
}
