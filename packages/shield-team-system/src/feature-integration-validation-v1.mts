import { createHash } from "node:crypto";

import {
  computeFeatureCumulativeValidationReceiptDigestV1,
  createFeatureIntegrationEntryV1,
  evaluateFeatureCumulativeValidationCandidateV1,
  type FeatureCumulativeValidationCandidateV1,
  type FeatureCumulativeValidationReceiptV1,
  type FeatureCumulativeValidationRequestV1,
  type FeatureIntegrationReplayProjectionV1,
  type FeatureOperationJournalEntryV1,
  type SignedFeatureCumulativeValidationAuthorityV1,
} from "./feature-integration-v1.mjs";
import type { TrustedHumanBinding } from "./mission-v2.mjs";

export const FEATURE_INTEGRATION_VALIDATION_CONTRACT_VERSION = "feature.integration.validation.v1" as const;

export interface FeatureCumulativeCommandV1 { commandId: string; executable: string; args: readonly string[]; targetIds: readonly string[] }
export interface FeatureCumulativeCommandReceiptV1 { commandId: string; targetIds: readonly string[]; exitCode: number; stdoutDigest: string; stderrDigest: string; cached: boolean }
export interface FeatureCumulativeMackEvidenceV1 { evidenceDigest: string; repositoryId: string; headRevision: string; targetIds: readonly string[]; validationIds: readonly string[]; accepted: boolean; synthetic: boolean }
export type FeatureValidationRunnerV1 = (executable: string, args: readonly string[]) => { exitCode: number; stdout: string; stderr: string; cached?: boolean };
type Result<T> = { state: "accepted"; value: Readonly<T> } | { state: "blocked"; reason: string } | { state: "effect_uncertain"; reason: string; receipts: readonly FeatureCumulativeCommandReceiptV1[] };
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function hash(value: string): string { return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`; }
function block<T>(reason: string): Result<T> { return { state: "blocked", reason }; }
function accepted<T>(value: T): Result<T> { return { state: "accepted", value: Object.freeze(structuredClone(value)) }; }

export function prepareFeatureCumulativeValidationV1(input: { replay: FeatureIntegrationReplayProjectionV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; request: FeatureCumulativeValidationRequestV1; candidate: FeatureCumulativeValidationCandidateV1; trustedBindings: readonly TrustedHumanBinding[]; observedAt: string; previousEntryDigest: string }): Result<{ entry: FeatureOperationJournalEntryV1; candidate: FeatureCumulativeValidationCandidateV1 }> {
  if (!input?.replay || input.replay.nextStage !== "cumulative_validation" || input.replay.pendingEffect) return block("validation_stage_ineligible");
  const evaluation = evaluateFeatureCumulativeValidationCandidateV1(input);
  if (evaluation.state !== "eligible") return block(evaluation.reason);
  const entry = createFeatureIntegrationEntryV1({ operationId: input.replay.replayContext.operationId, entrySequence: input.replay.nextEntrySequence, entryKind: "effect_prepared", previousEntryDigest: input.previousEntryDigest, payload: { effectClass: "cumulative_validation", candidate: evaluation.candidate, candidateDigest: evaluation.candidate.candidateDigest, effectKey: evaluation.candidate.effectKey, requestDigest: evaluation.candidate.requestDigest, expectedHeadRevision: evaluation.candidate.terminalHeadRevision, expectedTreeDigest: evaluation.candidate.terminalTreeDigest } });
  return accepted({ entry, candidate: evaluation.candidate });
}

export function executeFeatureCumulativeValidationCommandsV1(input: { preparedEntry: FeatureOperationJournalEntryV1; request: FeatureCumulativeValidationRequestV1; commands: readonly FeatureCumulativeCommandV1[]; run: FeatureValidationRunnerV1 }): Result<{ outcome: "passed" | "failed"; receipts: readonly FeatureCumulativeCommandReceiptV1[] }> {
  if (input?.preparedEntry?.entryKind !== "effect_prepared" || input.preparedEntry.payload.effectClass !== "cumulative_validation" || !Array.isArray(input.commands) || input.commands.length !== input.request.commandIds.length || input.commands.some((command: FeatureCumulativeCommandV1, index: number) => command.commandId !== input.request.commandIds[index] || !Array.isArray(command.args) || !Array.isArray(command.targetIds) || command.targetIds.some((target: string) => !input.request.targetIds.includes(target)))) return block("validation_execution_input_invalid");
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

export function acceptFeatureCumulativeValidationV1(input: { replay: FeatureIntegrationReplayProjectionV1; preparedEntry: FeatureOperationJournalEntryV1; signedAuthority: SignedFeatureCumulativeValidationAuthorityV1; request: FeatureCumulativeValidationRequestV1; execution: { outcome: "passed" | "failed"; receipts: readonly FeatureCumulativeCommandReceiptV1[] }; mackEvidence: FeatureCumulativeMackEvidenceV1; identity: { seatId: string; reasoningRuntimeId: string; modelId: string; toolExecutorId: string }; observedAt: { value: string; provenance: "hostTrusted" }; observationProvenance: string }): Result<{ receipt: FeatureCumulativeValidationReceiptV1; entry: FeatureOperationJournalEntryV1 }> {
  const authority = input?.signedAuthority?.payload, evidence = input?.mackEvidence;
  if (!authority || input.preparedEntry.entryKind !== "effect_prepared" || input.preparedEntry.payload.effectClass !== "cumulative_validation" || input.preparedEntry.payload.effectKey !== authority.effectKey || authority.requestDigest !== input.request.requestDigest || authority.terminalHeadRevision !== input.replay.terminalHeadRevision || authority.terminalTreeDigest !== input.replay.terminalTreeDigest) return block("validation_acceptance_binding_mismatch");
  if (!evidence || !DIGEST.test(evidence.evidenceDigest) || evidence.repositoryId !== authority.repositoryId || evidence.headRevision !== authority.terminalHeadRevision || evidence.accepted !== true || evidence.synthetic !== false || JSON.stringify(evidence.targetIds) !== JSON.stringify(authority.targetIds) || JSON.stringify(evidence.validationIds) !== JSON.stringify(authority.validationIds)) return block("mack_evidence_invalid");
  if (!input.execution || input.execution.receipts.length !== authority.commandIds.length || input.execution.receipts.some((receipt, index) => receipt.commandId !== authority.commandIds[index])) return block("validation_execution_incomplete");
  if (new Set(Object.values(input.identity)).size !== 4 || !input.observationProvenance) return block("runtime_identity_invalid");
  const receipt: FeatureCumulativeValidationReceiptV1 = { schemaVersion: 1, contractVersion: "feature.integration.v1", operationId: authority.operationId, repositoryId: authority.repositoryId, planDigest: authority.planDigest, featureAuthorityDigest: authority.featureAuthorityDigest, cumulativeAuthorityDigest: authority.authorityDigest, requestDigest: authority.requestDigest, transitionReceiptDigest: authority.transitionReceiptDigest, terminalHeadRevision: authority.terminalHeadRevision, terminalTreeDigest: authority.terminalTreeDigest, commandIds: [...authority.commandIds], targetIds: [...authority.targetIds], validationIds: [...authority.validationIds], mackEvidenceDigest: evidence.evidenceDigest, checkObservationDigests: input.execution.receipts.map((receipt) => hash(JSON.stringify(receipt))), outcome: input.execution.outcome, reconciliationState: "applied", observationProvenance: input.observationProvenance, observedAt: input.observedAt, ...input.identity, receiptDigest: `sha256:${"0".repeat(64)}` };
  receipt.receiptDigest = computeFeatureCumulativeValidationReceiptDigestV1(receipt);
  const entryKind = receipt.outcome === "passed" ? "cumulative_validation_accepted" : "cumulative_validation_failed";
  const entry = createFeatureIntegrationEntryV1({ operationId: authority.operationId, entrySequence: input.preparedEntry.entrySequence + 1, entryKind, previousEntryDigest: input.preparedEntry.entryDigest, payload: { preparationEntryDigest: input.preparedEntry.entryDigest, receipt } });
  return accepted({ receipt, entry });
}
