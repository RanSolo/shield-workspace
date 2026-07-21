import {
  base64,
  boundedString,
  canonicalBytes,
  closedRecord,
  deepFreeze,
  denseArray,
  domainDigest,
  fromBase64,
  utf8,
} from "./canonical.js";
import {
  IDS,
  type ContentArtifactV0,
  type ContentBindingV0,
  type ContentReferenceV0,
  type DeterministicSpecV0,
  type DispatchCandidateV0,
  type GovernanceBindingV0,
  type MissionDispatchIRV0,
  type ProvenanceBindingV0,
  type RegistryBundleV0,
  type RegistryEntryV0,
  type SourceMapEntryV0,
  type TaskFactsV0,
} from "./contracts.js";
import { fail } from "./errors.js";
import { REGISTRY_ENTRIES } from "./registry.js";

const IR_FIELDS = [
  "protocolVersion", "experimentId", "trialId", "replayId", "armId", "missionId",
  "subjectId", "repository", "branch", "baseCommit", "baseTree", "accountableSeat",
  "artifactOwner", "gate", "approvedFileScope", "taskFacts", "instructionRefs", "modeRef",
  "seatContractRef", "runtimeProfileRef", "outputContractRef", "validationObligations",
  "stopConditions", "contextReferences",
] as const;
const CANDIDATE_FIELDS = [
  "candidateVersion", "ir", "governance", "registry", "renderer", "targetProfile",
  "sourceArtifacts", "sourceMap",
] as const;
const TASK_FIELDS = [
  "findingId", "unicodeEquivalences", "regressionPaths", "parityTools",
  "forbiddenChangeClasses",
] as const;
const ARTIFACT_FIELDS = ["artifactId", "mediaType", "bytesBase64", "digest"] as const;
const SOURCE_MAP_FIELDS = [
  "fieldPath", "artifactId", "startByte", "endByte", "selectedBySeat", "judgmentRecordId",
] as const;
const GOVERNANCE_FIELDS = [
  "governanceContractId", "journalHeadEntryId", "journalSequence", "authorizationState",
  "digest",
] as const;
const SPEC_FIELDS = ["id", "version", "bytesBase64", "digest"] as const;
const REGISTRY_FIELDS = ["id", "entries", "bytesBase64", "digest"] as const;
const REGISTRY_ENTRY_FIELDS = ["id", "text"] as const;
const REF_FIELDS = ["artifactId", "digest"] as const;
const CONTENT_BINDING_FIELDS = ["artifactId", "artifactDigest", "byteLength"] as const;
const PROVENANCE_BINDING_FIELDS = [
  "fieldPath", "artifactId", "artifactDigest", "sourceStartByte", "sourceEndByte",
  "selectedValueDigest", "derivation", "selectedBySeat", "judgmentRecordId",
] as const;
const PAIR_FIELDS = ["from", "to"] as const;
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/@-]{0,254}[A-Za-z0-9])?$/u;

function identifier(input: unknown, maximum = 256): string {
  const value = boundedString(input, maximum);
  if (!IDENTIFIER.test(value)) fail("INVALID_CANDIDATE");
  return value;
}

export const APPROVED_FILES = Object.freeze([
  "packages/shield-team-system/scripts/model/repository-sensitive-policy.mjs",
  "packages/shield-team-system/scripts/model/repository-tools.mjs",
  "packages/shield-team-system/tests/repository-tools.test.mjs",
]);
export const REQUIRED_REGISTRY_IDS = Object.freeze([
  "OWNERSHIP-01", "AUTHORITY-01", "REVISION-01", "VALIDATION-01", "VALIDATION-02",
  "STOP-01", "STOP-02", "OUTPUT-01",
]);
export const REQUIRED_VALIDATIONS = Object.freeze([
  "focused-real-tool-parity", "repository-broker-suite", "workspace-suite",
  "packed-strict-consumer", "package-dry-run", "git-diff-check",
]);
export const REQUIRED_STOPS = Object.freeze([
  "architecture-change-required", "stale-governance", "production-integration-required",
]);

function exactStrings(input: unknown, expected: readonly string[], reason: "OBLIGATION_MISSING" | "OUT_OF_SCOPE_FILE"): readonly string[] {
  const values = denseArray(input, 64).map((value) => boundedString(value, 512));
  if (values.length !== expected.length || values.some((value, index) => value !== expected[index])) {
    fail(reason);
  }
  return Object.freeze(values);
}

function normalizeTaskFacts(input: unknown): TaskFactsV0 {
  const record = closedRecord(input, TASK_FIELDS);
  if (record.findingId !== "FURY-41-CONFORMANCE-001") fail("INVALID_CANDIDATE");
  const pairInputs = denseArray(record.unicodeEquivalences, 2);
  const pairs = pairInputs.map((pairInput) => {
    const pair = closedRecord(pairInput, PAIR_FIELDS);
    if (!((pair.from === "K" && pair.to === "k") || (pair.from === "ſ" && pair.to === "s"))) {
      fail("INVALID_CANDIDATE");
    }
    return Object.freeze({ from: pair.from, to: pair.to });
  });
  if (pairs.length !== 2 || pairs[0]?.from !== "K" || pairs[1]?.from !== "ſ") {
    fail("INVALID_CANDIDATE");
  }
  const regressionPaths = exactStrings(
    record.regressionPaths,
    ["private.Key", "id_rſa", "toKen.json"],
    "OBLIGATION_MISSING",
  ) as unknown as TaskFactsV0["regressionPaths"];
  const parityTools = exactStrings(
    record.parityTools,
    ["readFile", "listFiles", "searchRepo"],
    "OBLIGATION_MISSING",
  ) as unknown as TaskFactsV0["parityTools"];
  const forbidden = exactStrings(record.forbiddenChangeClasses, [
    "broader_normalization", "public_api", "new_policy_cases", "architecture", "authority",
    "runtime", "broker", "journal", "kernel", "additional_files", "unrelated_cleanup",
  ], "OBLIGATION_MISSING");
  return deepFreeze({
    findingId: "FURY-41-CONFORMANCE-001",
    unicodeEquivalences: pairs,
    regressionPaths,
    parityTools,
    forbiddenChangeClasses: forbidden,
  });
}

function normalizeReference(input: unknown): ContentReferenceV0 {
  const record = closedRecord(input, REF_FIELDS);
  return Object.freeze({
    artifactId: identifier(record.artifactId, 128),
    digest: boundedString(record.digest, 64),
  });
}

export function normalizeIR(input: unknown): MissionDispatchIRV0 {
  const record = closedRecord(input, IR_FIELDS);
  if (record.protocolVersion !== IDS.ir || record.accountableSeat !== "may" ||
      record.artifactOwner !== "may" || record.gate !== "implementation-repair") {
    fail(record.accountableSeat !== "may" || record.artifactOwner !== "may"
      ? "AUTHORITY_INTRODUCED" : "INVALID_CANDIDATE");
  }
  const baseCommit = boundedString(record.baseCommit, 40);
  const baseTree = boundedString(record.baseTree, 40);
  if (!/^[0-9a-f]{40}$/u.test(baseCommit) || !/^[0-9a-f]{40}$/u.test(baseTree)) {
    fail("INVALID_CANDIDATE");
  }
  const contextReferences = denseArray(record.contextReferences, 16).map(normalizeReference);
  if (contextReferences.length < 3 || new Set(contextReferences.map((ref) => ref.artifactId)).size !== contextReferences.length) {
    fail("CONTEXT_DIGEST_MISMATCH");
  }
  return deepFreeze({
    protocolVersion: IDS.ir,
    experimentId: identifier(record.experimentId),
    trialId: identifier(record.trialId),
    replayId: identifier(record.replayId),
    armId: identifier(record.armId),
    missionId: identifier(record.missionId),
    subjectId: identifier(record.subjectId),
    repository: identifier(record.repository),
    branch: identifier(record.branch),
    baseCommit,
    baseTree,
    accountableSeat: "may",
    artifactOwner: "may",
    gate: "implementation-repair",
    approvedFileScope: exactStrings(record.approvedFileScope, APPROVED_FILES, "OUT_OF_SCOPE_FILE"),
    taskFacts: normalizeTaskFacts(record.taskFacts),
    instructionRefs: exactStrings(record.instructionRefs, REQUIRED_REGISTRY_IDS, "OBLIGATION_MISSING"),
    modeRef: identifier(record.modeRef),
    seatContractRef: identifier(record.seatContractRef),
    runtimeProfileRef: identifier(record.runtimeProfileRef),
    outputContractRef: identifier(record.outputContractRef),
    validationObligations: exactStrings(record.validationObligations, REQUIRED_VALIDATIONS, "OBLIGATION_MISSING"),
    stopConditions: exactStrings(record.stopConditions, REQUIRED_STOPS, "OBLIGATION_MISSING"),
    contextReferences,
  });
}

function normalizeArtifact(input: unknown): ContentArtifactV0 {
  const record = closedRecord(input, ARTIFACT_FIELDS);
  const mediaType = record.mediaType;
  if (mediaType !== "text/plain; charset=utf-8" && mediaType !== "application/json") {
    fail("INVALID_CANDIDATE");
  }
  const bytesBase64 = boundedString(record.bytesBase64, 1_000_000);
  const bytes = fromBase64(bytesBase64);
  const digest = boundedString(record.digest, 64);
  if (domainDigest("shield:dispatch:source-artifact:v0", bytes) !== digest) {
    fail("CONTENT_DIGEST_MISMATCH");
  }
  return Object.freeze({
    artifactId: identifier(record.artifactId, 128), mediaType, bytesBase64, digest,
  });
}

function normalizeSourceMap(input: unknown, artifacts: readonly ContentArtifactV0[]): SourceMapEntryV0 {
  const record = closedRecord(input, SOURCE_MAP_FIELDS);
  const artifactId = identifier(record.artifactId, 128);
  const artifact = artifacts.find((candidate) => candidate.artifactId === artifactId);
  if (!artifact || !Number.isSafeInteger(record.startByte) || !Number.isSafeInteger(record.endByte) ||
      (record.startByte as number) < 0 || (record.endByte as number) <= (record.startByte as number) ||
      (record.endByte as number) > fromBase64(artifact.bytesBase64).byteLength) {
    fail("SOURCE_MAP_INVALID");
  }
  if (!(record.selectedBySeat === null || record.selectedBySeat === "hill") ||
      !(record.judgmentRecordId === null || typeof record.judgmentRecordId === "string") ||
      ((record.selectedBySeat === null) !== (record.judgmentRecordId === null))) {
    fail("SOURCE_MAP_INVALID");
  }
  return Object.freeze({
    fieldPath: identifier(record.fieldPath, 256), artifactId,
    startByte: record.startByte as number, endByte: record.endByte as number,
    selectedBySeat: record.selectedBySeat,
    judgmentRecordId: record.judgmentRecordId === null ? null : identifier(record.judgmentRecordId, 128),
  });
}

type ExpectedSource = Readonly<
  | { kind: "value"; value: string }
  | { kind: "artifact"; artifactId: string; digest: string }
>;

function expectedSourceFields(ir: MissionDispatchIRV0): ReadonlyMap<string, ExpectedSource> {
  const fields = new Map<string, ExpectedSource>();
  const value = (path: string, fieldValue: string) => fields.set(path, Object.freeze({ kind: "value", value: fieldValue }));
  for (const [path, fieldValue] of [
    ["ir.experimentId", ir.experimentId], ["ir.trialId", ir.trialId],
    ["ir.replayId", ir.replayId], ["ir.armId", ir.armId], ["ir.missionId", ir.missionId],
    ["ir.subjectId", ir.subjectId], ["ir.repository", ir.repository], ["ir.branch", ir.branch],
    ["ir.baseCommit", ir.baseCommit], ["ir.baseTree", ir.baseTree],
    ["ir.accountableSeat", ir.accountableSeat], ["ir.artifactOwner", ir.artifactOwner],
    ["ir.gate", ir.gate], ["ir.modeRef", ir.modeRef], ["ir.seatContractRef", ir.seatContractRef],
    ["ir.runtimeProfileRef", ir.runtimeProfileRef], ["ir.outputContractRef", ir.outputContractRef],
    ["ir.taskFacts.findingId", ir.taskFacts.findingId],
  ] as const) value(path, fieldValue);
  ir.approvedFileScope.forEach((item, index) => value(`ir.approvedFileScope.${index}`, item));
  ir.taskFacts.unicodeEquivalences.forEach((item, index) => {
    value(`ir.taskFacts.unicodeEquivalences.${index}.from`, item.from);
    value(`ir.taskFacts.unicodeEquivalences.${index}.to`, item.to);
  });
  ir.taskFacts.regressionPaths.forEach((item, index) => value(`ir.taskFacts.regressionPaths.${index}`, item));
  ir.taskFacts.parityTools.forEach((item, index) => value(`ir.taskFacts.parityTools.${index}`, item));
  ir.taskFacts.forbiddenChangeClasses.forEach((item, index) => value(`ir.taskFacts.forbiddenChangeClasses.${index}`, item));
  ir.validationObligations.forEach((item, index) => value(`ir.validationObligations.${index}`, item));
  ir.stopConditions.forEach((item, index) => value(`ir.stopConditions.${index}`, item));
  ir.contextReferences.forEach((item, index) => {
    const source = Object.freeze({ kind: "artifact" as const, artifactId: item.artifactId, digest: item.digest });
    fields.set(`ir.contextReferences.${index}.artifactId`, source);
    fields.set(`ir.contextReferences.${index}.digest`, source);
  });
  return fields;
}

function deriveProvenanceBindings(
  ir: MissionDispatchIRV0,
  artifacts: readonly ContentArtifactV0[],
  sourceMap: readonly SourceMapEntryV0[],
): readonly ProvenanceBindingV0[] {
  const expected = expectedSourceFields(ir);
  if (sourceMap.length !== expected.size) fail("SOURCE_MAP_INVALID");
  const bindings: ProvenanceBindingV0[] = [];
  for (const entry of sourceMap) {
    const source = expected.get(entry.fieldPath);
    const artifact = artifacts.find((item) => item.artifactId === entry.artifactId);
    if (!source || !artifact) fail("SOURCE_MAP_INVALID");
    const artifactBytes = fromBase64(artifact.bytesBase64);
    if (source.kind === "artifact") {
      if (entry.artifactId !== source.artifactId || artifact.digest !== source.digest ||
          entry.startByte !== 0 || entry.endByte !== artifactBytes.byteLength) {
        fail("PROVENANCE_SOURCE_MISMATCH");
      }
      const value = entry.fieldPath.endsWith(".digest") ? source.digest : source.artifactId;
      bindings.push(Object.freeze({
        fieldPath: entry.fieldPath, artifactId: entry.artifactId, artifactDigest: artifact.digest,
        sourceStartByte: entry.startByte, sourceEndByte: entry.endByte,
        selectedValueDigest: domainDigest("shield:dispatch:selected-value:v0", utf8(value)),
        derivation: entry.fieldPath.endsWith(".digest")
          ? "mechanical_artifact_digest" : "mechanical_artifact_id",
        selectedBySeat: entry.selectedBySeat, judgmentRecordId: entry.judgmentRecordId,
      }));
      continue;
    }
    const mappedBytes = artifactBytes.subarray(entry.startByte, entry.endByte);
    if (Buffer.compare(Buffer.from(mappedBytes), Buffer.from(utf8(source.value))) !== 0) {
      fail("PROVENANCE_SOURCE_MISMATCH");
    }
    bindings.push(Object.freeze({
      fieldPath: entry.fieldPath, artifactId: entry.artifactId, artifactDigest: artifact.digest,
      sourceStartByte: entry.startByte, sourceEndByte: entry.endByte,
      selectedValueDigest: domainDigest("shield:dispatch:selected-value:v0", utf8(source.value)),
      derivation: "literal_selection", selectedBySeat: entry.selectedBySeat,
      judgmentRecordId: entry.judgmentRecordId,
    }));
  }
  return deepFreeze(bindings);
}

export function normalizeContentBindings(input: unknown): readonly ContentBindingV0[] {
  const bindings = denseArray(input, 16).map((item) => {
    const record = closedRecord(item, CONTENT_BINDING_FIELDS);
    const artifactDigest = boundedString(record.artifactDigest, 64);
    if (!/^[0-9a-f]{64}$/u.test(artifactDigest) || !Number.isSafeInteger(record.byteLength) ||
        (record.byteLength as number) < 1 || (record.byteLength as number) > 1_000_000) {
      fail("FIXTURE_DIGEST_MISMATCH");
    }
    return Object.freeze({
      artifactId: identifier(record.artifactId, 128), artifactDigest,
      byteLength: record.byteLength as number,
    });
  });
  if (bindings.length < 3 || new Set(bindings.map((item) => item.artifactId)).size !== bindings.length) {
    fail("FIXTURE_DIGEST_MISMATCH");
  }
  return Object.freeze(bindings);
}

export function normalizeProvenanceBindings(
  input: unknown,
  ir: MissionDispatchIRV0,
  sourceBindings: readonly ContentBindingV0[],
): readonly ProvenanceBindingV0[] {
  const expected = expectedSourceFields(ir);
  const bindings = denseArray(input, 256).map((item) => {
    const record = closedRecord(item, PROVENANCE_BINDING_FIELDS);
    const fieldPath = identifier(record.fieldPath, 256);
    const source = expected.get(fieldPath);
    const artifactId = identifier(record.artifactId, 128);
    const artifact = sourceBindings.find((binding) => binding.artifactId === artifactId);
    const artifactDigest = boundedString(record.artifactDigest, 64);
    const selectedValueDigest = boundedString(record.selectedValueDigest, 64);
    if (!source || !artifact || artifact.artifactDigest !== artifactDigest ||
        !/^[0-9a-f]{64}$/u.test(selectedValueDigest) ||
        !Number.isSafeInteger(record.sourceStartByte) || !Number.isSafeInteger(record.sourceEndByte) ||
        (record.sourceStartByte as number) < 0 ||
        (record.sourceEndByte as number) <= (record.sourceStartByte as number) ||
        (record.sourceEndByte as number) > artifact.byteLength ||
        !(record.selectedBySeat === null || record.selectedBySeat === "hill") ||
        !(record.judgmentRecordId === null || typeof record.judgmentRecordId === "string") ||
        ((record.selectedBySeat === null) !== (record.judgmentRecordId === null))) {
      fail("PROVENANCE_SOURCE_MISMATCH");
    }
    const expectedValue = source.kind === "value"
      ? source.value : fieldPath.endsWith(".digest") ? source.digest : source.artifactId;
    const expectedDerivation = source.kind === "value"
      ? "literal_selection" : fieldPath.endsWith(".digest")
        ? "mechanical_artifact_digest" : "mechanical_artifact_id";
    if (record.derivation !== expectedDerivation ||
        selectedValueDigest !== domainDigest("shield:dispatch:selected-value:v0", utf8(expectedValue)) ||
        (source.kind === "artifact" && (artifactId !== source.artifactId ||
          artifactDigest !== source.digest || record.sourceStartByte !== 0 ||
          record.sourceEndByte !== artifact.byteLength))) {
      fail("PROVENANCE_SOURCE_MISMATCH");
    }
    return Object.freeze({
      fieldPath, artifactId, artifactDigest,
      sourceStartByte: record.sourceStartByte as number,
      sourceEndByte: record.sourceEndByte as number,
      selectedValueDigest, derivation: expectedDerivation,
      selectedBySeat: record.selectedBySeat,
      judgmentRecordId: record.judgmentRecordId === null ? null : identifier(record.judgmentRecordId, 128),
    });
  });
  if (bindings.length !== expected.size || new Set(bindings.map((item) => item.fieldPath)).size !== bindings.length) {
    fail("SOURCE_MAP_INVALID");
  }
  return deepFreeze(bindings);
}

export function normalizeSpec(input: unknown, expectedId: string, reason: "RENDERER_DIGEST_MISMATCH" | "TARGET_DIGEST_MISMATCH"): DeterministicSpecV0 {
  const record = closedRecord(input, SPEC_FIELDS);
  if (record.id !== expectedId) fail(reason);
  const bytesBase64 = boundedString(record.bytesBase64, 100_000);
  const bytes = fromBase64(bytesBase64);
  const digest = boundedString(record.digest, 64);
  const expectedVersion = reason === "RENDERER_DIGEST_MISMATCH" ? "1" : "0";
  if (record.version !== expectedVersion) fail(reason);
  const domain = reason === "RENDERER_DIGEST_MISMATCH"
    ? "shield:dispatch:renderer-spec:v0" : "shield:dispatch:target-profile:v0";
  const expectedBytes = reason === "RENDERER_DIGEST_MISMATCH"
    ? canonicalBytes({ id: IDS.renderer, version: "1", lineEnding: "LF", labels: "fixed", variableEncoding: "utf8" })
    : canonicalBytes({ id: IDS.target, version: "0", transport: "text", encoding: "utf8", normalization: "none" });
  if (Buffer.compare(Buffer.from(bytes), Buffer.from(expectedBytes)) !== 0 ||
      domainDigest(domain, bytes) !== digest) fail(reason);
  return Object.freeze({ id: expectedId, version: expectedVersion, bytesBase64, digest });
}

export function normalizeRegistry(input: unknown): RegistryBundleV0 {
  const record = closedRecord(input, REGISTRY_FIELDS);
  if (record.id !== IDS.registry) fail("REGISTRY_DIGEST_MISMATCH");
  const entries = denseArray(record.entries, 8).map((entryInput) => {
    const entry = closedRecord(entryInput, REGISTRY_ENTRY_FIELDS);
    return Object.freeze({ id: boundedString(entry.id), text: boundedString(entry.text, 512) });
  }) as readonly RegistryEntryV0[];
  if (entries.length !== 8 || entries.some((entry, index) => entry.id !== REQUIRED_REGISTRY_IDS[index])) {
    fail("OBLIGATION_MISSING");
  }
  if (entries.some((entry, index) => entry.text !== REGISTRY_ENTRIES[index]?.text)) {
    fail("OBLIGATION_MISSING");
  }
  const bytesBase64 = boundedString(record.bytesBase64, 100_000);
  const bytes = fromBase64(bytesBase64);
  if (base64(canonicalBytes({ id: IDS.registry, entries })) !== bytesBase64 ||
      domainDigest("shield:dispatch:registry:v0", bytes) !== record.digest) {
    fail("REGISTRY_DIGEST_MISMATCH");
  }
  return deepFreeze({ id: IDS.registry, entries, bytesBase64, digest: boundedString(record.digest, 64) });
}

export function normalizeGovernance(input: unknown): GovernanceBindingV0 {
  const record = closedRecord(input, GOVERNANCE_FIELDS);
  if (record.authorizationState !== "authorized" || !Number.isSafeInteger(record.journalSequence) ||
      (record.journalSequence as number) < 0) fail("GOVERNANCE_DIGEST_MISMATCH");
  const content = {
    governanceContractId: boundedString(record.governanceContractId),
    journalHeadEntryId: boundedString(record.journalHeadEntryId),
    journalSequence: record.journalSequence as number,
    authorizationState: "authorized" as const,
  };
  const digest = boundedString(record.digest, 64);
  if (domainDigest("shield:dispatch:governance:v0", canonicalBytes(content)) !== digest) {
    fail("GOVERNANCE_DIGEST_MISMATCH");
  }
  return Object.freeze({ ...content, digest });
}

export function normalizeCandidate(input: unknown): DispatchCandidateV0 {
  const record = closedRecord(input, CANDIDATE_FIELDS);
  if (record.candidateVersion !== "dispatch-candidate.v0") fail("INVALID_CANDIDATE");
  const ir = normalizeIR(record.ir);
  const sourceArtifacts = denseArray(record.sourceArtifacts, 16).map(normalizeArtifact);
  if (sourceArtifacts.length < 3 || new Set(sourceArtifacts.map((item) => item.artifactId)).size !== sourceArtifacts.length) {
    fail("FIXTURE_DIGEST_MISMATCH");
  }
  const sourceMap = denseArray(record.sourceMap, 256).map((item) => normalizeSourceMap(item, sourceArtifacts));
  if (new Set(sourceMap.map((item) => item.fieldPath)).size !== sourceMap.length) fail("SOURCE_MAP_INVALID");
  deriveProvenanceBindings(ir, sourceArtifacts, sourceMap);
  for (const reference of ir.contextReferences) {
    const artifact = sourceArtifacts.find((item) => item.artifactId === reference.artifactId);
    if (!artifact || artifact.digest !== reference.digest) fail("CONTEXT_DIGEST_MISMATCH");
  }
  return deepFreeze({
    candidateVersion: "dispatch-candidate.v0", ir,
    governance: normalizeGovernance(record.governance),
    registry: normalizeRegistry(record.registry),
    renderer: normalizeSpec(record.renderer, IDS.renderer, "RENDERER_DIGEST_MISMATCH"),
    targetProfile: normalizeSpec(record.targetProfile, IDS.target, "TARGET_DIGEST_MISMATCH"),
    sourceArtifacts, sourceMap,
  });
}

export function candidateDigests(candidate: DispatchCandidateV0): Readonly<{
  irBytes: Uint8Array; irDigest: string; fixtureDigest: string; contextDigest: string;
}> {
  const irBytes = canonicalBytes(candidate.ir);
  const fixtureBytes = canonicalBytes(candidateProvenanceBundle(candidate));
  const contextBytes = canonicalBytes(candidate.ir.contextReferences);
  return Object.freeze({
    irBytes,
    irDigest: domainDigest("shield:dispatch:ir:v0", irBytes),
    fixtureDigest: domainDigest("shield:dispatch:fixture:v0", fixtureBytes),
    contextDigest: domainDigest("shield:dispatch:context:v0", contextBytes),
  });
}

export function candidateProvenanceBundle(candidate: DispatchCandidateV0): Readonly<{
  sourceBindings: readonly ContentBindingV0[];
  provenanceBindings: readonly ProvenanceBindingV0[];
}> {
  const sourceBindings = candidate.sourceArtifacts.map((artifact) => Object.freeze({
    artifactId: artifact.artifactId,
    artifactDigest: artifact.digest,
    byteLength: fromBase64(artifact.bytesBase64).byteLength,
  }));
  return deepFreeze({
    sourceBindings,
    provenanceBindings: deriveProvenanceBindings(candidate.ir, candidate.sourceArtifacts, candidate.sourceMap),
  });
}
