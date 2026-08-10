const FACTORY_FIELDS = ["launchExternalFixture"];
const CONTEXT_FIELDS = ["fixtureRoot", "operatorInput", "releaseBaselineBytes", "launcherHostContext"];
const OPERATOR_FIELDS = [
  "packageArtifactPath", "externalRepositoryRoot", "baseRevision", "headRevision",
  "hostConfiguration", "blindStatus", "priorSolutionsVisible", "requireSimmons",
];
const HOST_FIELDS = ["baselineBytes", "authoritativeReceiptJournalPath", "attributionContext", "toolingContext"];
const PLAN_FIELDS = [
  "runnerContractVersion", "cycleId", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "seatId", "activatedModes", "actionId", "effectClass",
  "effectKey", "validationId", "stopCondition",
];
const RESULT_FIELDS = [
  "runnerContractVersion", "outcome", "missionId", "subjectId", "revisionId",
  "evaluatedThroughSequence", "cycleId", "seatId", "actionId", "effectClass",
  "effectKey", "summary", "evidenceRefs",
];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  if (!plain(value) || Reflect.ownKeys(value).length !== fields.length) return false;
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
  });
}

function validPlan(plan) {
  return exact(plan, PLAN_FIELDS) && plan.runnerContractVersion === 1 &&
    [plan.cycleId, plan.missionId, plan.subjectId, plan.seatId, plan.actionId,
      plan.effectKey, plan.validationId].every((value) => typeof value === "string" && IDENTIFIER.test(value)) &&
    typeof plan.revisionId === "string" && REVISION.test(plan.revisionId) &&
    Number.isSafeInteger(plan.evaluatedThroughSequence) && plan.evaluatedThroughSequence >= 0 &&
    ["behavioral_implementation", "verification", "coordination"].includes(plan.effectClass) &&
    plan.stopCondition === "after_one_cycle" && Array.isArray(plan.activatedModes);
}

function validateRunnerExecutorResult(value) {
  if (!exact(value, RESULT_FIELDS) || value.runnerContractVersion !== 1 ||
      !["completed", "failed", "uncertain"].includes(value.outcome) ||
      ![value.missionId, value.subjectId, value.cycleId, value.seatId, value.actionId,
        value.effectKey].every((item) => typeof item === "string" && IDENTIFIER.test(item)) ||
      typeof value.revisionId !== "string" || !REVISION.test(value.revisionId) ||
      !Number.isSafeInteger(value.evaluatedThroughSequence) || value.evaluatedThroughSequence < 0 ||
      !["behavioral_implementation", "verification", "coordination"].includes(value.effectClass) ||
      typeof value.summary !== "string" || value.summary.trim().length === 0 ||
      !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0 || value.evidenceRefs.length > 15 ||
      value.evidenceRefs.some((item) => typeof item !== "string" || !IDENTIFIER.test(item))) {
    throw new Error("feature_flight_executor_result_malformed");
  }
  return value;
}

function resultFor(plan, outcome, summary, evidenceRef) {
  return validateRunnerExecutorResult({
    runnerContractVersion: 1,
    outcome,
    missionId: plan.missionId,
    subjectId: plan.subjectId,
    revisionId: plan.revisionId,
    evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId,
    seatId: plan.seatId,
    actionId: plan.actionId,
    effectClass: plan.effectClass,
    effectKey: plan.effectKey,
    summary,
    evidenceRefs: [evidenceRef],
  });
}

function uncertain(plan) {
  return resultFor(
    plan,
    "uncertain",
    "External fixture outcome is structurally uncertain.",
    `fixture:uncertain:${plan.cycleId}`,
  );
}

export function createFeatureFlightAdapterV1(input) {
  if (!exact(input, FACTORY_FIELDS) || typeof input.launchExternalFixture !== "function") {
    throw new Error("feature_flight_adapter_factory_not_closed");
  }
  const launchExternalFixture = input.launchExternalFixture;
  return async function featureFlightAdapter(...args) {
    if (args.length !== 3) throw new Error("feature_flight_adapter_arguments_not_closed");
    const [plan, _decision, adapterContext] = args;
    if (!validPlan(plan)) throw new Error("feature_flight_adapter_plan_malformed");
    if (!exact(adapterContext, CONTEXT_FIELDS) || !Object.isFrozen(adapterContext) ||
        typeof adapterContext.fixtureRoot !== "string" ||
        !exact(adapterContext.operatorInput, OPERATOR_FIELDS) || !Object.isFrozen(adapterContext.operatorInput) ||
        !exact(adapterContext.launcherHostContext, HOST_FIELDS) || !Object.isFrozen(adapterContext.launcherHostContext) ||
        adapterContext.launcherHostContext.baselineBytes !== adapterContext.releaseBaselineBytes ||
        adapterContext.launcherHostContext.authoritativeReceiptJournalPath !== null ||
        adapterContext.launcherHostContext.attributionContext !== null ||
        adapterContext.launcherHostContext.toolingContext !== null) {
      throw new Error("feature_flight_adapter_context_not_closed");
    }

    let launched;
    try {
      launched = await launchExternalFixture({
        fixtureRoot: adapterContext.fixtureRoot,
        operatorInput: adapterContext.operatorInput,
        hostContext: adapterContext.launcherHostContext,
      });
    } catch {
      return uncertain(plan);
    }
    if (!plain(launched)) return uncertain(plan);
    const stateField = Object.getOwnPropertyDescriptor(launched, "state");
    if (stateField?.enumerable !== true || !Object.hasOwn(stateField, "value") || typeof stateField.value !== "string") return uncertain(plan);
    const state = stateField.value;
    if (state === "ready") {
      return resultFor(plan, "completed", "External fixture preflight completed.", `fixture:ready:${plan.cycleId}`);
    }
    if (state === "blocked" || state === "invalid") {
      return resultFor(plan, "failed", "External fixture preflight did not complete.", `fixture:${state}:${plan.cycleId}`);
    }
    return uncertain(plan);
  };
}
