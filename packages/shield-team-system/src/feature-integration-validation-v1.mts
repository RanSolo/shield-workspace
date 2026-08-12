import { createHash } from "node:crypto";

import {
  canonicalFeatureIntegrationJsonV1,
  computeFeatureCumulativeValidationReceiptDigestV1,
  createFeatureIntegrationEntryV1,
  evaluateFeatureCumulativeValidationCandidateV1,
  replayFeatureOperationJournalV1,
  validateFeatureCumulativeValidationCandidateV1,
  validateFeatureCumulativeValidationRequestV1,
  verifySignedFeatureCumulativeValidationAuthorityV1,
  type FeatureCumulativeValidationCommandV1,
  type FeatureCumulativeValidationCandidateV1,
  type FeatureCumulativeValidationReceiptV1,
  type FeatureCumulativeValidationRequestV1,
  type FeatureIntegrationReplayProjectionV1,
  type FeatureOperationJournalEntryV1,
  type SignedFeatureCumulativeValidationAuthorityV1,
} from "./feature-integration-v1.mjs";
import { appendFeatureOperationJournalStoreV1, readFeatureOperationJournalStoreV1, type FeatureIntegrationStoreScopeV1 } from "./feature-integration-store-v1.mjs";
import { replayProfileAwareMissionJournal } from "./profile-aware-mission-v1.mjs";
import type { TrustedHumanBinding } from "./mission-v2.mjs";

export const FEATURE_INTEGRATION_VALIDATION_CONTRACT_VERSION = "feature.integration.validation.v1" as const;

export type FeatureCumulativeCommandV1 = FeatureCumulativeValidationCommandV1;
export interface FeatureCumulativeCommandReceiptV1 { commandId: string; targetIds: readonly string[]; exitCode: number; stdoutDigest: string; stderrDigest: string; cached: boolean }
export interface FeatureCumulativeMackEvidenceV1 { evidenceDigest: string; repositoryId: string; headRevision: string; treeDigest: string; transitionReceiptDigest: string; targetIds: readonly string[]; validationIds: readonly string[]; accepted: boolean; synthetic: boolean }
export type FeatureValidationRunnerV1 = (executable: string, args: readonly string[]) => { exitCode: number; stdout: string; stderr: string; cached?: boolean };
type Result<T> = { state: "accepted"; value: Readonly<T> } | { state: "blocked"; reason: string } | { state: "effect_uncertain"; reason: string; receipts: readonly FeatureCumulativeCommandReceiptV1[] };
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function hash(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function block<T>(reason: string): Result<T> { return { state: "blocked", reason }; }
function accepted<T>(value: T): Result<T> { return { state: "accepted", value: Object.freeze(structuredClone(value)) }; }

function authorizeCommandExecution(input: { preparedEntry: FeatureOperationJournalEntryV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; trustedBindings: readonly TrustedHumanBinding[]; implementationJournal: unknown; request: FeatureCumulativeValidationRequestV1; commands: readonly FeatureCumulativeCommandV1[] }): Result<true> {
  const cumulative = verifySignedFeatureCumulativeValidationAuthorityV1(input.signedAuthority, input.trustedBindings);
  const request = validateFeatureCumulativeValidationRequestV1(input.request);
  const preparedCandidate = validateFeatureCumulativeValidationCandidateV1(input.preparedEntry?.payload?.candidate);
  const schema9 = replayProfileAwareMissionJournal(input.implementationJournal);
  if (cumulative.state !== "valid" || request.state !== "valid" || preparedCandidate.state !== "valid" || schema9.state !== "valid" || schema9.value.implementationAuthorityState !== "authorized" || !schema9.value.implementationAuthority || schema9.value.implementationAuthorityDigest === null) return block("implementation_authority_inactive");
  const authority = schema9.value.implementationAuthority, cumulativeAuthority = cumulative.value, candidate = preparedCandidate.value;
  const requestCommands = request.value.commands;
  if (input.preparedEntry.entryKind !== "effect_prepared" || input.preparedEntry.operationId !== cumulativeAuthority.operationId || input.preparedEntry.payload.effectClass !== "cumulative_validation" || input.preparedEntry.payload.requestDigest !== request.value.requestDigest || input.preparedEntry.payload.effectKey !== cumulativeAuthority.effectKey ||
      input.preparedEntry.payload.candidateDigest !== candidate.candidateDigest || candidate.operationId !== cumulativeAuthority.operationId || candidate.authorityDigest !== cumulativeAuthority.authorityDigest || candidate.requestDigest !== request.value.requestDigest || candidate.effectKey !== cumulativeAuthority.effectKey || candidate.terminalHeadRevision !== request.value.terminalHeadRevision || candidate.terminalTreeDigest !== request.value.terminalTreeDigest || candidate.transitionReceiptDigest !== request.value.transitionReceiptDigest || candidate.transitionReceiptDigest !== cumulativeAuthority.transitionReceiptDigest ||
      authority.missionId !== cumulativeAuthority.missionId || authority.repositoryId !== input.request.repositoryId || authority.headRevision !== input.request.terminalHeadRevision ||
      !authority.approvedActionIds.includes("validation:run") || !authority.approvedEffectClasses.includes("verification") || !authority.approvedEffectKeys.includes(cumulativeAuthority.effectKey) || !authority.approvedCapabilities.includes("command_execution") ||
      cumulativeAuthority.requestDigest !== input.request.requestDigest || cumulativeAuthority.repositoryId !== input.request.repositoryId || cumulativeAuthority.terminalHeadRevision !== input.request.terminalHeadRevision || cumulativeAuthority.terminalTreeDigest !== input.request.terminalTreeDigest || cumulativeAuthority.transitionReceiptDigest !== input.request.transitionReceiptDigest ||
      canonicalFeatureIntegrationJsonV1(cumulativeAuthority.commandIds) !== canonicalFeatureIntegrationJsonV1(input.request.commandIds) || canonicalFeatureIntegrationJsonV1(cumulativeAuthority.targetIds) !== canonicalFeatureIntegrationJsonV1(input.request.targetIds) ||
      !Array.isArray(input.commands) || canonicalFeatureIntegrationJsonV1(input.commands) !== canonicalFeatureIntegrationJsonV1(requestCommands) ||
      input.request.commandIds.some((commandId) => !authority.validationCommandIds.includes(commandId))) return block("implementation_authority_mismatch");
  return accepted(true);
}

export function prepareFeatureCumulativeValidationV1(input: { replay: FeatureIntegrationReplayProjectionV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; request: FeatureCumulativeValidationRequestV1; candidate: FeatureCumulativeValidationCandidateV1; trustedBindings: readonly TrustedHumanBinding[]; observedAt: string; previousEntryDigest: string }): Result<{ entry: FeatureOperationJournalEntryV1; candidate: FeatureCumulativeValidationCandidateV1 }> {
  if (!input?.replay || input.replay.nextStage !== "cumulative_validation" || input.replay.pendingEffect) return block("validation_stage_ineligible");
  const evaluation = evaluateFeatureCumulativeValidationCandidateV1(input);
  if (evaluation.state !== "eligible") return block(evaluation.reason);
  const entry = createFeatureIntegrationEntryV1({ operationId: input.replay.replayContext.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "effect_prepared", previousEntryDigest: input.previousEntryDigest, payload: { effectClass: "cumulative_validation", candidate: evaluation.candidate, candidateDigest: evaluation.candidate.candidateDigest, effectKey: evaluation.candidate.effectKey, requestDigest: evaluation.candidate.requestDigest, expectedHeadRevision: evaluation.candidate.terminalHeadRevision, expectedTreeDigest: evaluation.candidate.terminalTreeDigest } });
  return accepted({ entry, candidate: evaluation.candidate });
}

export function executeFeatureCumulativeValidationCommandsV1(input: { preparedEntry: FeatureOperationJournalEntryV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; trustedBindings: readonly TrustedHumanBinding[]; implementationJournal: unknown; request: FeatureCumulativeValidationRequestV1; commands: readonly FeatureCumulativeCommandV1[]; run: FeatureValidationRunnerV1 }): Result<{ outcome: "passed" | "failed"; receipts: readonly FeatureCumulativeCommandReceiptV1[] }> {
  if (!input || !Array.isArray(input.commands) || input.commands.length !== input.request?.commandIds?.length || input.commands.some((command: FeatureCumulativeCommandV1, index: number) => command.commandId !== input.request.commandIds[index] || typeof command.executable !== "string" || command.executable.length === 0 || !Array.isArray(command.args) || !Array.isArray(command.targetIds) || command.targetIds.some((target: string) => !input.request.targetIds.includes(target)))) return block("validation_execution_input_invalid");
  const authorized = authorizeCommandExecution(input);
  if (authorized.state !== "accepted") return authorized;
  const receipts: FeatureCumulativeCommandReceiptV1[] = [];
  for (const command of input.commands) {
    let result;
    try { result = input.run(command.executable, command.args); }
    catch { return { state: "effect_uncertain", reason: "runner_threw", receipts }; }
    if (!result || !Number.isInteger(result.exitCode) || typeof result.stdout !== "string" || typeof result.stderr !== "string") return { state: "effect_uncertain", reason: "runner_result_invalid", receipts };
    receipts.push({ commandId: command.commandId, targetIds: [...command.targetIds], exitCode: result.exitCode, stdoutDigest: hash(result.stdout), stderrDigest: hash(result.stderr), cached: result.cached === true });
  }
  return accepted({ outcome: receipts.every((receipt) => receipt.exitCode === 0) ? "passed" : "failed", receipts });
}

export function acceptFeatureCumulativeValidationV1(input: { replay: FeatureIntegrationReplayProjectionV1; preparedEntry: FeatureOperationJournalEntryV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; trustedBindings: readonly TrustedHumanBinding[]; request: FeatureCumulativeValidationRequestV1; execution: { outcome: "passed" | "failed"; receipts: readonly FeatureCumulativeCommandReceiptV1[] }; mackEvidence: FeatureCumulativeMackEvidenceV1; identity: { seatId: string; reasoningRuntimeId: string; modelId: string; toolExecutorId: string }; observedAt: { value: string; provenance: "hostTrusted" }; observationProvenance: string }): Result<{ receipt: FeatureCumulativeValidationReceiptV1; entry: FeatureOperationJournalEntryV1 }> {
  const verified = verifySignedFeatureCumulativeValidationAuthorityV1(input?.signedAuthority, input?.trustedBindings);
  const request = validateFeatureCumulativeValidationRequestV1(input?.request);
  const preparedCandidate = validateFeatureCumulativeValidationCandidateV1(input?.preparedEntry?.payload?.candidate);
  const evidence = input?.mackEvidence, transition = input?.replay?.replayContext?.transitions?.at(-1);
  if (verified.state !== "valid" || request.state !== "valid" || preparedCandidate.state !== "valid") return block("validation_acceptance_binding_mismatch");
  const authority = verified.value, candidate = preparedCandidate.value;
  if (input.replay.nextStage !== "cumulative_validation" || input.replay.pendingEffect || !transition || transition.kind === "genesis" || transition.receiptDigest !== authority.transitionReceiptDigest ||
      input.preparedEntry.entryKind !== "effect_prepared" || input.preparedEntry.entrySequence !== input.replay.nextEntrySequence || input.preparedEntry.operationId !== authority.operationId || input.preparedEntry.payload.effectClass !== "cumulative_validation" || input.preparedEntry.payload.candidateDigest !== candidate.candidateDigest || input.preparedEntry.payload.effectKey !== authority.effectKey || input.preparedEntry.payload.requestDigest !== authority.requestDigest || input.preparedEntry.payload.expectedHeadRevision !== authority.terminalHeadRevision || input.preparedEntry.payload.expectedTreeDigest !== authority.terminalTreeDigest ||
      candidate.operationId !== authority.operationId || candidate.authorityDigest !== authority.authorityDigest || candidate.requestDigest !== authority.requestDigest || candidate.effectKey !== authority.effectKey || candidate.terminalHeadRevision !== authority.terminalHeadRevision || candidate.terminalTreeDigest !== authority.terminalTreeDigest || candidate.transitionReceiptDigest !== authority.transitionReceiptDigest ||
      request.value.operationId !== authority.operationId || request.value.repositoryId !== authority.repositoryId || request.value.requestDigest !== authority.requestDigest || request.value.terminalHeadRevision !== authority.terminalHeadRevision || request.value.terminalTreeDigest !== authority.terminalTreeDigest || request.value.transitionReceiptDigest !== authority.transitionReceiptDigest ||
      authority.planDigest !== input.replay.replayContext.activePlanDigest || authority.featureAuthorityDigest !== input.replay.replayContext.verifiedAuthorityDigest || authority.terminalHeadRevision !== input.replay.terminalHeadRevision || authority.terminalTreeDigest !== input.replay.terminalTreeDigest ||
      canonicalFeatureIntegrationJsonV1(authority.commandIds) !== canonicalFeatureIntegrationJsonV1(request.value.commandIds) || canonicalFeatureIntegrationJsonV1(authority.targetIds) !== canonicalFeatureIntegrationJsonV1(request.value.targetIds) || canonicalFeatureIntegrationJsonV1(authority.validationIds) !== canonicalFeatureIntegrationJsonV1(request.value.validationIds)) return block("validation_acceptance_binding_mismatch");
  if (!evidence || !DIGEST.test(evidence.evidenceDigest) || evidence.repositoryId !== authority.repositoryId || evidence.headRevision !== authority.terminalHeadRevision || evidence.treeDigest !== authority.terminalTreeDigest || evidence.transitionReceiptDigest !== authority.transitionReceiptDigest || evidence.accepted !== true || evidence.synthetic !== false || canonicalFeatureIntegrationJsonV1(evidence.targetIds) !== canonicalFeatureIntegrationJsonV1(authority.targetIds) || canonicalFeatureIntegrationJsonV1(evidence.validationIds) !== canonicalFeatureIntegrationJsonV1(authority.validationIds)) return block("mack_evidence_invalid");
  if (!input.execution || !Array.isArray(input.execution.receipts) || input.execution.receipts.length !== authority.commandIds.length || input.execution.receipts.some((receipt, index) => receipt.commandId !== authority.commandIds[index] || canonicalFeatureIntegrationJsonV1(receipt.targetIds) !== canonicalFeatureIntegrationJsonV1(request.value.commands[index].targetIds) || !Number.isInteger(receipt.exitCode) || !DIGEST.test(receipt.stdoutDigest) || !DIGEST.test(receipt.stderrDigest) || typeof receipt.cached !== "boolean") || input.execution.outcome !== (input.execution.receipts.every((receipt) => receipt.exitCode === 0) ? "passed" : "failed")) return block("validation_execution_incomplete");
  if (!input.identity || Object.values(input.identity).some((value) => typeof value !== "string" || value.length === 0) || new Set(Object.values(input.identity)).size !== 4 || !input.observationProvenance || input.observedAt?.provenance !== "hostTrusted" || !Number.isFinite(Date.parse(input.observedAt.value))) return block("runtime_identity_invalid");
  const receipt: FeatureCumulativeValidationReceiptV1 = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: authority.operationId, repositoryId: authority.repositoryId, planDigest: authority.planDigest, featureAuthorityDigest: authority.featureAuthorityDigest, cumulativeAuthorityDigest: authority.authorityDigest, effectKey: authority.effectKey, requestDigest: authority.requestDigest, transitionReceiptDigest: authority.transitionReceiptDigest, terminalHeadRevision: authority.terminalHeadRevision, terminalTreeDigest: authority.terminalTreeDigest, commandIds: [...authority.commandIds], targetIds: [...authority.targetIds], validationIds: [...authority.validationIds], mackEvidenceDigest: evidence.evidenceDigest, checkObservationDigests: input.execution.receipts.map((receipt) => hash(JSON.stringify(receipt))).sort(), outcome: input.execution.outcome, reconciliationState: "applied", observationProvenance: input.observationProvenance, observedAt: input.observedAt, ...input.identity, receiptDigest: `sha256:${"0".repeat(64)}` };
  receipt.receiptDigest = computeFeatureCumulativeValidationReceiptDigestV1(receipt);
  const entryKind = receipt.outcome === "passed" ? "cumulative_validation_accepted" : "cumulative_validation_failed";
  const entry = createFeatureIntegrationEntryV1({ operationId: authority.operationId, entrySequence: input.preparedEntry.entrySequence + 1, entryKind, previousEntryDigest: input.preparedEntry.entryDigest, payload: { preparationEntryDigest: input.preparedEntry.entryDigest, receipt } });
  return accepted({ receipt, entry });
}

export async function executeFeatureCumulativeValidationStageV1(input: { storeScope: FeatureIntegrationStoreScopeV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; request: FeatureCumulativeValidationRequestV1; candidate: FeatureCumulativeValidationCandidateV1; trustedBindings: readonly TrustedHumanBinding[]; implementationJournal: unknown; commands: readonly FeatureCumulativeCommandV1[]; run: FeatureValidationRunnerV1; mackEvidence: FeatureCumulativeMackEvidenceV1; identity: { seatId: string; reasoningRuntimeId: string; modelId: string; toolExecutorId: string }; observedAt: { value: string; provenance: "hostTrusted" }; observationProvenance: string }): Promise<Result<{ receipt: FeatureCumulativeValidationReceiptV1; journalDigest: string }>> {
  const current = await readFeatureOperationJournalStoreV1(input.storeScope);
  if (current.state !== "accepted" || !current.value.journal) return block(current.state === "blocked" ? current.code : "journal_unavailable");
  const replayed = replayFeatureOperationJournalV1(current.value.journal); if (replayed.state !== "valid") return block("replay_invalid");
  const prepared = prepareFeatureCumulativeValidationV1({ replay: replayed.value, signedAuthority: input.signedAuthority, request: input.request, candidate: input.candidate, trustedBindings: input.trustedBindings, observedAt: replayed.value.latestObservedAt.value, previousEntryDigest: current.value.journal.latestAcceptedEntryDigest });
  if (prepared.state !== "accepted") return prepared;
  const executionAuthorization = authorizeCommandExecution({ preparedEntry: prepared.value.entry, signedAuthority: input.signedAuthority, trustedBindings: input.trustedBindings, implementationJournal: input.implementationJournal, request: input.request, commands: input.commands });
  if (executionAuthorization.state !== "accepted") return executionAuthorization;
  const preparedAppend = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: replayed.value.nextEntrySequence, expectedLatestEntryDigest: current.value.journal.latestAcceptedEntryDigest, entry: prepared.value.entry });
  if (preparedAppend.state !== "accepted") return block(preparedAppend.state === "blocked" ? preparedAppend.code : "durability_uncertain");
  const execution = executeFeatureCumulativeValidationCommandsV1({ preparedEntry: prepared.value.entry, signedAuthority: input.signedAuthority, trustedBindings: input.trustedBindings, implementationJournal: input.implementationJournal, request: input.request, commands: input.commands, run: input.run });
  if (execution.state === "effect_uncertain") {
    const uncertain = createFeatureIntegrationEntryV1({ operationId: prepared.value.entry.operationId, entrySequence: prepared.value.entry.entrySequence + 1, entryKind: "effect_uncertain", previousEntryDigest: prepared.value.entry.entryDigest, payload: { preparationEntryDigest: prepared.value.entry.entryDigest, observationProvenance: input.observationProvenance, observedAt: input.observedAt } });
    await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: uncertain.entrySequence, expectedLatestEntryDigest: prepared.value.entry.entryDigest, entry: uncertain });
    return execution;
  }
  if (execution.state !== "accepted") return execution;
  const terminal = acceptFeatureCumulativeValidationV1({ replay: replayed.value, preparedEntry: prepared.value.entry, signedAuthority: input.signedAuthority, trustedBindings: input.trustedBindings, request: input.request, execution: execution.value, mackEvidence: input.mackEvidence, identity: input.identity, observedAt: input.observedAt, observationProvenance: input.observationProvenance });
  if (terminal.state !== "accepted") return terminal;
  const appended = await appendFeatureOperationJournalStoreV1({ ...input.storeScope, expectedEntrySequence: terminal.value.entry.entrySequence, expectedLatestEntryDigest: prepared.value.entry.entryDigest, entry: terminal.value.entry });
  return appended.state === "accepted" ? accepted({ receipt: terminal.value.receipt, journalDigest: appended.value.journal.journalDigest }) : block(appended.state === "blocked" ? appended.code : "durability_uncertain");
}
