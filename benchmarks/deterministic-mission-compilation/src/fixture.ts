import { base64, canonicalBytes, deepFreeze, domainDigest, utf8 } from "./canonical.js";
import {
  IDS,
  type ContentArtifactV0,
  type DispatchCandidateV0,
  type GovernanceBindingV0,
  type SourceMapEntryV0,
} from "./contracts.js";
import { createRegistry } from "./registry.js";

export const HISTORICAL_ACCEPTED_REVISION_IDENTITY_ONLY =
  "200251bb8730cad3f1e0e70d8830ce2d52c532ba";

export const COULSON_AUTHORIZATION_TEXT = `Coulson authorizes **one bounded May conformance repair** for Mission #41/#59.

Authorized scope is limited to:

- preserving the prior Unicode \`/iu\` equivalence behavior, including reproduced cases such as \`K → k\` and \`ſ → s\`;
- applying that behavior consistently to direct sensitive-path matching and generated ripgrep exclusions;
- adding focused three-tool parity regression tests for the reproduced Unicode cases;
- rerunning the existing focused and integration validation defined for the mission.

This is a conformance correction within the approved architecture and existing implementation scope. It does not authorize new public APIs, broader normalization policy, unrelated Unicode handling, architecture changes, additional seats, or cleanup outside the affected paths and tests.

May retains repair ownership. After the bounded correction and validation, return the exact revision and evidence to Fury for conformance re-review.

PR #64 remains draft. No merge, scope expansion, or further edits are authorized without the required review or additional Coulson approval.
`;

export const GOVERNED_SOURCE_TEXT = deepFreeze({
  furyFinding: `### FURY-41-CONFORMANCE-001 — Unicode case-fold compatibility regression

The prior direct policy used Unicode-aware \`/iu\` matching. The replacement uses ASCII-only folding, so paths formerly denied are now readable, listed, and searchable. Independently reproduced examples: \`private.Key\`, \`id_rſa\`, and \`toKen.json\`. This weakens the accepted Issue #34 boundary and violates the frozen compatibility rule; parity cannot be achieved by weakening the stricter tools.

Required disposition: preserve the former Unicode case-fold equivalents in the canonical direct matcher and generated ripgrep exclusions, with three-tool parity tests for the affected equivalence classes, or obtain explicit Coulson authority to narrow the threat boundary.
`,
  coulsonAuthorization: COULSON_AUTHORIZATION_TEXT,
  validationOutput: `validation.focused=focused-real-tool-parity
validation.integration=repository-broker-suite
validation.workspace=workspace-suite
validation.consumer=packed-strict-consumer
validation.pack=package-dry-run
validation.diff=git-diff-check
output=report-files-tests-risks
stop.architecture=architecture-change-required
stop.stale=stale-governance
stop.production=production-integration-required
`,
  hillJudgment: `judgmentRecordId=hill-dispatch-judgment-41-59-v0
experimentId=deterministic-mission-compilation
trialId=stage-a-trial-001
replayId=historical-replay-41-59
armId=compiled-arm
missionId=issue-41
subjectId=issue-59
repository=RanSolo/shield-workspace
branch=codex/issue-41-adaptive-refinement
baseCommit=afdbf71b8ece2a2506a0b6a7b213267c7896f8d1
baseTree=2169142438703609a1c3a7e2a613db1997faca8b
acceptedRevisionIdentityOnly=200251bb8730cad3f1e0e70d8830ce2d52c532ba
accountableSeat=may
artifactOwner=may
gate=implementation-repair
file.0=packages/shield-team-system/scripts/model/repository-sensitive-policy.mjs
file.1=packages/shield-team-system/scripts/model/repository-tools.mjs
file.2=packages/shield-team-system/tests/repository-tools.test.mjs
modeRef=delivery-mode.v0
seatContractRef=melinda-may-implementer.v0
runtimeProfileRef=runtime-profile-historical-observation.v0
outputContractRef=report-files-tests-risks
parity.0=readFile
parity.1=listFiles
parity.2=searchRepo
forbidden.0=broader_normalization
forbidden.1=public_api
forbidden.2=new_policy_cases
forbidden.3=architecture
forbidden.4=authority
forbidden.5=runtime
forbidden.6=broker
forbidden.7=journal
forbidden.8=kernel
forbidden.9=additional_files
forbidden.10=unrelated_cleanup
`,
});

function artifact(artifactId: string, text: string): ContentArtifactV0 {
  const bytes = utf8(text);
  return Object.freeze({
    artifactId,
    mediaType: "text/plain; charset=utf-8",
    bytesBase64: base64(bytes),
    digest: domainDigest("shield:dispatch:source-artifact:v0", bytes),
  });
}

function rangeFor(text: string, needle: string): readonly [number, number] {
  const first = text.indexOf(needle);
  if (first < 0 || text.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`fixture_source_range_not_unique:${needle}`);
  }
  return Object.freeze([
    utf8(text.slice(0, first)).byteLength,
    utf8(text.slice(0, first + needle.length)).byteLength,
  ]);
}

function sourceEntry(
  fieldPath: string,
  artifactId: string,
  text: string,
  uniqueNeedle: string,
  value: string,
  judgment = false,
): SourceMapEntryV0 {
  const lineRange = rangeFor(text, uniqueNeedle);
  const line = text.slice(
    Buffer.from(text).subarray(0, lineRange[0]).toString("utf8").length,
    Buffer.from(text).subarray(0, lineRange[1]).toString("utf8").length,
  );
  const valueIndex = line.indexOf(value);
  if (valueIndex < 0) throw new Error(`fixture_value_not_found:${fieldPath}`);
  const linePrefix = line.slice(0, valueIndex);
  const startByte = lineRange[0] + utf8(linePrefix).byteLength;
  return Object.freeze({
    fieldPath,
    artifactId,
    startByte,
    endByte: startByte + utf8(value).byteLength,
    selectedBySeat: judgment ? "hill" : null,
    judgmentRecordId: judgment ? "hill-dispatch-judgment-41-59-v0" : null,
  });
}

function fullEntry(fieldPath: string, item: ContentArtifactV0): SourceMapEntryV0 {
  return Object.freeze({
    fieldPath, artifactId: item.artifactId, startByte: 0,
    endByte: Buffer.from(item.bytesBase64, "base64").byteLength,
    selectedBySeat: null, judgmentRecordId: null,
  });
}

export function createHistoricalCandidate(): DispatchCandidateV0 {
  const sources = deepFreeze([
    artifact("source:fury-finding-41", GOVERNED_SOURCE_TEXT.furyFinding),
    artifact("source:coulson-authorization-41", GOVERNED_SOURCE_TEXT.coulsonAuthorization),
    artifact("source:validation-output-41", GOVERNED_SOURCE_TEXT.validationOutput),
    artifact("source:hill-judgment-41", GOVERNED_SOURCE_TEXT.hillJudgment),
  ]);
  const [fury, coulson, validation, hill] = sources;
  if (!fury || !coulson || !validation || !hill) throw new Error("fixture_sources_missing");
  const hillField = (fieldPath: string, key: string, value: string) =>
    sourceEntry(fieldPath, hill.artifactId, GOVERNED_SOURCE_TEXT.hillJudgment, `${key}=${value}`, value, true);
  const validationField = (fieldPath: string, key: string, value: string) =>
    sourceEntry(fieldPath, validation.artifactId, GOVERNED_SOURCE_TEXT.validationOutput, `${key}=${value}`, value);
  const furyField = (fieldPath: string, value: string) =>
    sourceEntry(fieldPath, fury.artifactId, GOVERNED_SOURCE_TEXT.furyFinding, value, value);

  const contextReferences = sources.map(({ artifactId, digest }) => Object.freeze({ artifactId, digest }));
  const ir = deepFreeze({
    protocolVersion: IDS.ir,
    experimentId: "deterministic-mission-compilation",
    trialId: "stage-a-trial-001",
    replayId: "historical-replay-41-59",
    armId: "compiled-arm",
    missionId: "issue-41",
    subjectId: "issue-59",
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-41-adaptive-refinement",
    baseCommit: "afdbf71b8ece2a2506a0b6a7b213267c7896f8d1",
    baseTree: "2169142438703609a1c3a7e2a613db1997faca8b",
    accountableSeat: "may",
    artifactOwner: "may",
    gate: "implementation-repair",
    approvedFileScope: [
      "packages/shield-team-system/scripts/model/repository-sensitive-policy.mjs",
      "packages/shield-team-system/scripts/model/repository-tools.mjs",
      "packages/shield-team-system/tests/repository-tools.test.mjs",
    ],
    taskFacts: {
      findingId: "FURY-41-CONFORMANCE-001",
      unicodeEquivalences: [{ from: "K", to: "k" }, { from: "ſ", to: "s" }],
      regressionPaths: ["private.Key", "id_rſa", "toKen.json"],
      parityTools: ["readFile", "listFiles", "searchRepo"],
      forbiddenChangeClasses: [
        "broader_normalization", "public_api", "new_policy_cases", "architecture", "authority",
        "runtime", "broker", "journal", "kernel", "additional_files", "unrelated_cleanup",
      ],
    },
    instructionRefs: [
      "OWNERSHIP-01", "AUTHORITY-01", "REVISION-01", "VALIDATION-01", "VALIDATION-02",
      "STOP-01", "STOP-02", "OUTPUT-01",
    ],
    modeRef: "delivery-mode.v0",
    seatContractRef: "melinda-may-implementer.v0",
    runtimeProfileRef: "runtime-profile-historical-observation.v0",
    outputContractRef: "report-files-tests-risks",
    validationObligations: [
      "focused-real-tool-parity", "repository-broker-suite", "workspace-suite",
      "packed-strict-consumer", "package-dry-run", "git-diff-check",
    ],
    stopConditions: [
      "architecture-change-required", "stale-governance", "production-integration-required",
    ],
    contextReferences,
  } as const);

  const sourceMap: SourceMapEntryV0[] = [];
  for (const [path, key, value] of [
    ["ir.experimentId", "experimentId", ir.experimentId], ["ir.trialId", "trialId", ir.trialId],
    ["ir.replayId", "replayId", ir.replayId], ["ir.armId", "armId", ir.armId],
    ["ir.missionId", "missionId", ir.missionId], ["ir.subjectId", "subjectId", ir.subjectId],
    ["ir.repository", "repository", ir.repository], ["ir.branch", "branch", ir.branch],
    ["ir.baseCommit", "baseCommit", ir.baseCommit], ["ir.baseTree", "baseTree", ir.baseTree],
    ["ir.accountableSeat", "accountableSeat", ir.accountableSeat],
    ["ir.artifactOwner", "artifactOwner", ir.artifactOwner], ["ir.gate", "gate", ir.gate],
    ["ir.modeRef", "modeRef", ir.modeRef], ["ir.seatContractRef", "seatContractRef", ir.seatContractRef],
    ["ir.runtimeProfileRef", "runtimeProfileRef", ir.runtimeProfileRef],
    ["ir.outputContractRef", "outputContractRef", ir.outputContractRef],
  ] as const) sourceMap.push(hillField(path, key, value));
  ir.approvedFileScope.forEach((value, index) => sourceMap.push(hillField(`ir.approvedFileScope.${index}`, `file.${index}`, value)));
  sourceMap.push(furyField("ir.taskFacts.findingId", ir.taskFacts.findingId));
  ir.taskFacts.unicodeEquivalences.forEach((pair, index) => {
    const needle = index === 0 ? "`K → k`" : "`ſ → s`";
    sourceMap.push(sourceEntry(
      `ir.taskFacts.unicodeEquivalences.${index}.from`, coulson.artifactId,
      GOVERNED_SOURCE_TEXT.coulsonAuthorization, needle, pair.from,
    ));
    sourceMap.push(sourceEntry(
      `ir.taskFacts.unicodeEquivalences.${index}.to`, coulson.artifactId,
      GOVERNED_SOURCE_TEXT.coulsonAuthorization, needle, pair.to,
    ));
  });
  ir.taskFacts.regressionPaths.forEach((value, index) => sourceMap.push(furyField(`ir.taskFacts.regressionPaths.${index}`, value)));
  ir.taskFacts.parityTools.forEach((value, index) => sourceMap.push(hillField(
    `ir.taskFacts.parityTools.${index}`, `parity.${index}`, value,
  )));
  ir.taskFacts.forbiddenChangeClasses.forEach((value, index) => sourceMap.push(hillField(
    `ir.taskFacts.forbiddenChangeClasses.${index}`, `forbidden.${index}`, value,
  )));
  ir.validationObligations.forEach((value, index) => sourceMap.push(validationField(
    `ir.validationObligations.${index}`,
    ["validation.focused", "validation.integration", "validation.workspace", "validation.consumer", "validation.pack", "validation.diff"][index] ?? "",
    value,
  )));
  ir.stopConditions.forEach((value, index) => sourceMap.push(validationField(
    `ir.stopConditions.${index}`,
    ["stop.architecture", "stop.stale", "stop.production"][index] ?? "",
    value,
  )));
  ir.contextReferences.forEach((_, index) => {
    sourceMap.push(fullEntry(`ir.contextReferences.${index}.artifactId`, sources[index] as ContentArtifactV0));
    sourceMap.push(fullEntry(`ir.contextReferences.${index}.digest`, sources[index] as ContentArtifactV0));
  });

  const governanceContent = {
    governanceContractId: "mission-governance-historical-observation.v0",
    journalHeadEntryId: "pr64:fury:conformance-repair-authorized",
    journalSequence: 12,
    authorizationState: "authorized" as const,
  };
  const governance: GovernanceBindingV0 = Object.freeze({
    ...governanceContent,
    digest: domainDigest("shield:dispatch:governance:v0", canonicalBytes(governanceContent)),
  });
  const rendererBytes = canonicalBytes({
    id: IDS.renderer, version: "1", lineEnding: "LF", labels: "fixed", variableEncoding: "utf8",
  });
  const targetBytes = canonicalBytes({
    id: IDS.target, version: "0", transport: "text", encoding: "utf8", normalization: "none",
  });
  return deepFreeze({
    candidateVersion: "dispatch-candidate.v0",
    ir,
    governance,
    registry: createRegistry(),
    renderer: {
      id: IDS.renderer, version: "1", bytesBase64: base64(rendererBytes),
      digest: domainDigest("shield:dispatch:renderer-spec:v0", rendererBytes),
    },
    targetProfile: {
      id: IDS.target, version: "0", bytesBase64: base64(targetBytes),
      digest: domainDigest("shield:dispatch:target-profile:v0", targetBytes),
    },
    sourceArtifacts: sources,
    sourceMap,
  });
}
