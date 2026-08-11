export * from "../dist/feature-integration-v1.mjs";
export * from "../dist/feature-integration-store-v1.mjs";
export * from "../dist/feature-integration-evidence-v1.mjs";
export * from "../dist/feature-integration-validation-v1.mjs";

export declare const FEATURE_INTEGRATION_CONTROLLER_CONTRACT_VERSION: "feature.integration.controller.v1";
export declare function runFeatureIntegrationControllerV1(input: Record<string, unknown>, dependencies?: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function prepareFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>): Record<string, unknown>;
export declare function invokeFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export declare function observeFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export declare function reconcileFeatureIntegrationWorkspaceEffectV1(input: Record<string, unknown>): Record<string, unknown>;
export declare function executeFeatureIntegrationWorkspaceStageV1(input: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function createRollbackMissionHandoffReadyV1(input: Record<string, unknown>): Record<string, unknown>;
export declare function acceptGovernedRollbackWorkspaceV1(input: Record<string, unknown>): Record<string, unknown>;
export declare function prepareFeatureIntegrationTransitionEffectV1(input: Record<string, unknown>): Record<string, unknown>;
export declare function invokeFeatureIntegrationTransitionEffectV1(input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export declare function observeFeatureIntegrationTransitionV1(input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export declare function reconcileFeatureIntegrationTransitionV1(input: Record<string, unknown>): Record<string, unknown>;
