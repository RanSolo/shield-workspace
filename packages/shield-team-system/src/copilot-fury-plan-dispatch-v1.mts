import {
  dispatchCopilotFuryPlanReviewCoreV1,
  resolveCommittedTransitionPlanSourceV1,
  type CopilotFuryPlanDispatchDependenciesV1,
  type CopilotFuryPlanDispatchResultV1,
} from "./copilot-fury-plan-dispatch-core-v1.mjs";

export {
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_SUCCESSOR_EVIDENCE_CONTRACT_VERSION_V3,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_EVIDENCE_ROOT,
  COPILOT_FURY_PLAN_DISPATCH_REPOSITORY_CARD_REF,
  COPILOT_FURY_PLAN_DISPATCH_USER_CARD_REF,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERY_PROTOCOL,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_SUCCESSOR_RECEIPT_ID,
  COPILOT_FURY_PLAN_DISPATCH_RECOVERABLE_RESULT_RECEIPT_ID,
  COPILOT_FURY_DISPATCH_CAPABILITY_CONTRACT_VERSION,
  COPILOT_FURY_DISPATCH_CAPABILITY_NEXT_ACTIONS,
  validateAndProjectCopilotFuryDispatchCapabilityReportV1,
  parseCopilotAgentCardV1,
  validateCopilotFuryPlanDispatchRequestV1,
  validateCopilotFuryPlanResultV1,
  deriveCopilotSdkSessionIdV1,
  validateCopilotFurySuccessorExecutionConfigurationV3,
  evaluateCopilotFuryRecoveryEligibilityV1,
  createCopilotFuryPlanExecutorV1,
  probeCopilotFuryDispatchCapabilityV1,
} from "./copilot-fury-plan-dispatch-core-v1.mjs";

export type {
  CopilotFuryDispatchCapabilityReasonV1,
  CopilotFuryDispatchCapabilityReportV1,
  CopilotAgentHandoffV1,
  CopilotAgentCardV1,
  CopilotFuryCardSelectionV1,
  CopilotFuryPlanDispatchRequestV1,
  CopilotFuryPlanFindingV1,
  CopilotFuryPlanResultV1,
  CopilotFuryResolvedCardIdentityV1,
  CopilotFuryDispatchCapabilityDependenciesV1,
  CopilotFurySdkConfigurationV1,
  CopilotFuryExecutorPreflightInputV1,
  CopilotFuryExecutorPreflightResultV1,
  CopilotFuryExecutorObservationsV1,
  CopilotFuryExecutorRunResultV1,
  CopilotFuryExecutorRunInputV1,
  CopilotFuryClientOptionsProjectionV1,
  CopilotFuryExecutionIdentityV1,
  CopilotFuryRecoveryClaimExpectationV1,
  CopilotFuryRecoveryEligibilityV1,
  CopilotFuryPlanExecutorV1,
  CopilotFuryPlanDispatchDependenciesV1,
  CopilotFuryPlanDispatchHandoffV1,
  CopilotFuryPlanDispatchResultV1,
  CopilotFuryProductionExecutorDependenciesV1,
} from "./copilot-fury-plan-dispatch-core-v1.mjs";

export async function dispatchCopilotFuryPlanReviewV1(
  input: unknown,
  dependencies: CopilotFuryPlanDispatchDependenciesV1 = {},
): Promise<CopilotFuryPlanDispatchResultV1> {
  const resolved = await resolveCommittedTransitionPlanSourceV1(input);
  if (resolved.state === "invalid") return resolved.result;
  return dispatchCopilotFuryPlanReviewCoreV1(resolved.request, resolved.source, dependencies);
}
