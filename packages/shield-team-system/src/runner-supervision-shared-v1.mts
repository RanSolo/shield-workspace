export interface ExecutionEffectPayloadValidationMessages {
  contractVersionUnsupported(label: string): string;
  fieldInvalid(label: string, field: string): string;
  effectClassUnsupported(label: string): string;
  outcomeUnsupported(label: string): string;
  summaryInvalid(label: string): string;
  evidenceRefsMustBeArray(label: string): string;
  evidenceRefsInvalid(label: string, index: number): string;
  evidenceRefsDuplicate(label: string, value: string): string;
  evidenceRefsTooMany(label: string): string;
}

export interface RunnerSupervisedEffectCandidateValidationMessages {
  contractVersionUnsupported(label: string): string;
  kindUnsupported(label: string): string;
  authorityUnsupported(label: string): string;
  journalSchemaUnsupported(label: string): string;
  missionIdentityInvalid(label: string): string;
  revisionInvalid(label: string): string;
  expectedPreviousSequenceInvalid(label: string): string;
  intendedJournalSequenceInvalid(label: string): string;
  payloadIdentityDrift(label: string): string;
  sequenceBindingInvalid(label: string): string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function validateEvidenceRefs(
  value: unknown,
  label: string,
  isIdentifier: (value: unknown) => boolean,
  messages: ExecutionEffectPayloadValidationMessages,
): string[] {
  if (!Array.isArray(value)) return [messages.evidenceRefsMustBeArray(label)];
  if (Object.getPrototypeOf(value) !== Array.prototype) return [messages.evidenceRefsMustBeArray(label)];
  const errors: string[] = [];
  for (const field of Reflect.ownKeys(value)) {
    if (field === "length") continue;
    if (typeof field !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(field)) {
      errors.push(`${label} has unknown field: ${String(field)}.`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      errors.push(`${label}[${field}] must be an enumerable data field.`);
    }
  }
  if (errors.length > 0) return errors;
  if (value.length === 0 || value.length > 16) return [messages.evidenceRefsTooMany(label)];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      errors.push(`${label} must not contain sparse positions.`);
      continue;
    }
    const ref = Object.getOwnPropertyDescriptor(value, String(index))?.value;
    if (!isIdentifier(ref)) errors.push(messages.evidenceRefsInvalid(label, index));
    else if (seen.has(ref)) errors.push(messages.evidenceRefsDuplicate(label, ref));
    else seen.add(ref);
  }
  return errors;
}

export function validateExecutionEffectPayloadCommon(
  input: unknown,
  label: string,
  isIdentifier: (value: unknown) => boolean,
  isRevisionValid: (value: unknown) => boolean,
  isSequenceValid: (value: unknown) => boolean,
  isEffectClassSupported: (value: unknown) => boolean,
  isSummaryValid: (value: unknown) => boolean,
  evidenceRefsLabel: (label: string) => string,
  messages: ExecutionEffectPayloadValidationMessages,
): string[] {
  if (!isPlainObject(input)) return [`${label} must be a plain object.`];
  const errors: string[] = [];
  if (input.runnerContractVersion !== 1) errors.push(messages.contractVersionUnsupported(label));
  for (const field of [
    "cycleId", "subjectId", "seatId", "actionId", "effectKey",
    "authorizationDecisionId", "reasonCode",
  ] as const) {
    if (!isIdentifier(input[field])) errors.push(messages.fieldInvalid(label, field));
  }
  if (!isRevisionValid(input.revisionId)) errors.push(messages.fieldInvalid(label, "revisionId"));
  if (!isEffectClassSupported(input.effectClass)) errors.push(messages.effectClassUnsupported(label));
  if (!isSequenceValid(input.evaluatedThroughSequence)) errors.push(messages.fieldInvalid(label, "evaluatedThroughSequence"));
  if (input.outcome !== "completed" && input.outcome !== "uncertain") errors.push(messages.outcomeUnsupported(label));
  if (!isSummaryValid(input.summary)) errors.push(messages.summaryInvalid(label));
  errors.push(...validateEvidenceRefs(input.evidenceRefs, evidenceRefsLabel(label), isIdentifier, messages));
  return errors;
}

export function validateRunnerSupervisedEffectCandidateCommon(
  input: unknown,
  label: string,
  isIdentifier: (value: unknown) => boolean,
  validatePayload: (value: unknown, label: string) => string[],
  payloadLabel: (label: string) => string,
  messages: RunnerSupervisedEffectCandidateValidationMessages,
): string[] {
  if (!isPlainObject(input)) return [`${label} must be a plain object.`];
  const errors: string[] = [];
  if (input.runnerContractVersion !== 1) errors.push(messages.contractVersionUnsupported(label));
  if (input.candidateKind !== "runner.supervised_effect_record") errors.push(messages.kindUnsupported(label));
  if (input.authority !== "non_authoritative") errors.push(messages.authorityUnsupported(label));
  if (input.journalSchemaVersion !== 5 && input.journalSchemaVersion !== 6) errors.push(messages.journalSchemaUnsupported(label));
  for (const field of ["missionId", "subjectId", "revisionId"] as const) {
    if (!isIdentifier(input[field])) errors.push(messages.missionIdentityInvalid(label));
  }
  if (!Number.isInteger(input.expectedPreviousSequence) || (input.expectedPreviousSequence as number) < 0) {
    errors.push(messages.expectedPreviousSequenceInvalid(label));
  }
  if (!Number.isInteger(input.intendedJournalSequence) || (input.intendedJournalSequence as number) < 1) {
    errors.push(messages.intendedJournalSequenceInvalid(label));
  }
  errors.push(...validatePayload(input.payload, payloadLabel(label)));
  if (errors.length > 0) return errors;
  const candidate = input as {
    subjectId: string;
    revisionId: string;
    expectedPreviousSequence: number;
    intendedJournalSequence: number;
    payload: { subjectId: string; revisionId: string; evaluatedThroughSequence: number };
  };
  if (candidate.payload.subjectId !== candidate.subjectId || candidate.payload.revisionId !== candidate.revisionId) {
    return [messages.payloadIdentityDrift(label)];
  }
  if (
    candidate.payload.evaluatedThroughSequence !== candidate.expectedPreviousSequence ||
    candidate.intendedJournalSequence !== candidate.expectedPreviousSequence + 1
  ) {
    return [messages.sequenceBindingInvalid(label)];
  }
  return [];
}
