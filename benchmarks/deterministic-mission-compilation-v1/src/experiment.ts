import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from "node:crypto";

export const IDS = Object.freeze({
  experiment: "deterministic-mission-compilation-v1",
  trial: "stage-a-trial-002",
  ir: "mission-dispatch-ir.v1",
  envelope: "validated-dispatch.v1",
  validator: "shield-dispatch-validator@0.2.0-experiment",
  compiler: "shield-compiler@0.2.0-experiment",
  renderer: "canonical-chat-v2",
  controlArtifact: "human-control-handoff.v1",
  controlAssembler: "shield-control-assembler@0.1.0-experiment",
  assembly: "control-assembly.v1",
  sharedInstructions: "shared-runtime-instructions.v1",
  wrapper: "common-runtime-wrapper.v1",
  messageEnvelope: "runtime-message-envelope.v1",
  registry: "shield-dispatch-registry.v1",
  target: "codex-text.v1",
  provenance: "dispatch-provenance.v1",
  manifest: "compilation-manifest.v1",
  receipt: "dispatch-validation-receipt.v1",
} as const);

export type ClosedReason =
  | "INVALID_CANDIDATE" | "MISSING_RECEIPT" | "INVALID_RECEIPT"
  | "RECEIPT_BINDING_MISMATCH" | "CONTROL_ORDER_MISMATCH"
  | "CONTROL_SOURCE_MISMATCH" | "CONTROL_DELIMITER_MISMATCH"
  | "CONTROL_PROMPT_MISMATCH" | "SHARED_INSTRUCTION_MISMATCH"
  | "WRAPPER_MISMATCH" | "COMPILED_PROMPT_MISMATCH"
  | "MESSAGE_ENVELOPE_MISMATCH" | "IDENTITY_MISMATCH";

export type Result<T> = Readonly<{ state: "ok"; value: T } | { state: "invalid"; reason: ClosedReason }>;

const encoder = new TextEncoder();
export const utf8 = (value: string): Uint8Array => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("INVALID_CANDIDATE");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("INVALID_CANDIDATE");
  }
  return encoder.encode(value);
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
};

const canonical = (value: unknown): Uint8Array => utf8(JSON.stringify(value));

export function digest(domain: string, bytes: Uint8Array): string {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return createHash("sha256").update(utf8(domain)).update(length).update(bytes).digest("hex");
}

const exact = (value: unknown, fields: readonly string[]): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CANDIDATE");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error("INVALID_CANDIDATE");
  const keys = Object.keys(value);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new Error("INVALID_CANDIDATE");
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || descriptor.get || descriptor.set) throw new Error("INVALID_CANDIDATE");
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 100_000) throw new Error("INVALID_CANDIDATE");
  utf8(value);
  return value;
};

export const CONTROL_SOURCE_ORDER = Object.freeze([
  "control:fury-finding-41-v1",
  "control:coulson-authorization-41-v1",
  "control:validation-and-output-41-v1",
] as const);

export const CONTROL_DELIMITERS = Object.freeze({
  open: "# Human-authored May handoff v1\n\n",
  between: "\n--- SHIELD GOVERNED ARTIFACT BOUNDARY ---\n\n",
  close: "\n--- END HUMAN-AUTHORED HANDOFF ---\n",
});

export const CONTROL_SOURCE_TEXT = Object.freeze({
  "control:fury-finding-41-v1": `### FURY-41-CONFORMANCE-001 — Unicode case-fold compatibility regression

The prior direct policy used Unicode-aware \`/iu\` matching. The replacement uses ASCII-only folding, so paths formerly denied are now readable, listed, and searchable. Independently reproduced examples: \`private.Key\`, \`id_rſa\`, and \`toKen.json\`. This weakens the accepted Issue #34 boundary and violates the frozen compatibility rule; parity cannot be achieved by weakening the stricter tools.

Required disposition: preserve the former Unicode case-fold equivalents in the canonical direct matcher and generated ripgrep exclusions, with three-tool parity tests for the affected equivalence classes, or obtain explicit Coulson authority to narrow the threat boundary.
`,
  "control:coulson-authorization-41-v1": `Coulson authorizes **one bounded May conformance repair** for Mission #41/#59.

Authorized scope is limited to:

- preserving the prior Unicode \`/iu\` equivalence behavior, including reproduced cases such as \`K → k\` and \`ſ → s\`;
- applying that behavior consistently to direct sensitive-path matching and generated ripgrep exclusions;
- adding focused three-tool parity regression tests for the reproduced Unicode cases;
- rerunning the existing focused and integration validation defined for the mission.

This is a conformance correction within the approved architecture and existing implementation scope. It does not authorize new public APIs, broader normalization policy, unrelated Unicode handling, architecture changes, additional seats, or cleanup outside the affected paths and tests.

May retains repair ownership. After the bounded correction and validation, return the exact revision and evidence to Fury for conformance re-review.

PR #64 remains draft. No merge, scope expansion, or further edits are authorized without the required review or additional Coulson approval.
`,
  "control:validation-and-output-41-v1": `Validation obligations:
- focused-real-tool-parity
- repository-broker-suite
- workspace-suite
- packed-strict-consumer
- package-dry-run
- git-diff-check

Stop conditions:
- architecture-change-required
- stale-governance
- production-integration-required

Output contract: report changed files, tests run, and unresolved risks.
`,
});

export const SHARED_RUNTIME_INSTRUCTIONS = `# Shared runtime instructions v1

The accountable seat and artifact owner is May. These instructions describe the authorized replay and grant no authority.
Operate only in the supplied isolated repository at the exact bound base commit. Do not access the network, parent workspace, opposite arm, accepted artifact, or sealed grading output.
Attempt only the approved three-file repair. Apply every validation obligation and stop condition in the arm prompt.
Report changed files, validation performed, and unresolved risks. Stop if scope, revision, governance, or required context is stale or inconsistent.
`;

export interface SourceArtifact {
  readonly artifactId: string;
  readonly bytesBase64: string;
  readonly digest: string;
}

export interface ControlAssemblySpec {
  readonly id: typeof IDS.assembly;
  readonly assemblerId: typeof IDS.controlAssembler;
  readonly encoding: "utf-8";
  readonly normalization: "none";
  readonly sourceOrder: readonly string[];
  readonly openBase64: string;
  readonly betweenBase64: string;
  readonly closeBase64: string;
}

const sourceArtifact = (artifactId: string): SourceArtifact => {
  const text = CONTROL_SOURCE_TEXT[artifactId as keyof typeof CONTROL_SOURCE_TEXT];
  if (text === undefined) throw new Error("CONTROL_SOURCE_MISMATCH");
  const bytes = utf8(text);
  return Object.freeze({ artifactId, bytesBase64: Buffer.from(bytes).toString("base64"), digest: digest("shield:control:source:v1", bytes) });
};

export function createControlBundle() {
  const sources = Object.freeze(CONTROL_SOURCE_ORDER.map(sourceArtifact));
  const spec: ControlAssemblySpec = Object.freeze({
    id: IDS.assembly,
    assemblerId: IDS.controlAssembler,
    encoding: "utf-8",
    normalization: "none",
    sourceOrder: CONTROL_SOURCE_ORDER,
    openBase64: Buffer.from(utf8(CONTROL_DELIMITERS.open)).toString("base64"),
    betweenBase64: Buffer.from(utf8(CONTROL_DELIMITERS.between)).toString("base64"),
    closeBase64: Buffer.from(utf8(CONTROL_DELIMITERS.close)).toString("base64"),
  });
  return Object.freeze({ sources, spec });
}

export function assembleControlPrompt(bundleInput: unknown): Result<Readonly<{ bytes: Uint8Array; digest: string }>> {
  try {
    const bundle = exact(bundleInput, ["sources", "spec"]);
    if (!Array.isArray(bundle.sources) || bundle.sources.length !== CONTROL_SOURCE_ORDER.length) throw new Error("CONTROL_ORDER_MISMATCH");
    const spec = exact(bundle.spec, ["id", "assemblerId", "encoding", "normalization", "sourceOrder", "openBase64", "betweenBase64", "closeBase64"]);
    if (spec.id !== IDS.assembly || spec.assemblerId !== IDS.controlAssembler || spec.encoding !== "utf-8" || spec.normalization !== "none") throw new Error("IDENTITY_MISMATCH");
    if (!Array.isArray(spec.sourceOrder) || JSON.stringify(spec.sourceOrder) !== JSON.stringify(CONTROL_SOURCE_ORDER)) throw new Error("CONTROL_ORDER_MISMATCH");
    const delimiterValues = [spec.openBase64, spec.betweenBase64, spec.closeBase64].map((value) => Buffer.from(string(value), "base64"));
    const expectedDelimiterValues = [CONTROL_DELIMITERS.open, CONTROL_DELIMITERS.between, CONTROL_DELIMITERS.close].map((value) => Buffer.from(utf8(value)));
    if (delimiterValues.some((value, index) => !value.equals(expectedDelimiterValues[index]!))) throw new Error("CONTROL_DELIMITER_MISMATCH");
    const sources = bundle.sources.map((input, index) => {
      const item = exact(input, ["artifactId", "bytesBase64", "digest"]);
      if (item.artifactId !== CONTROL_SOURCE_ORDER[index]) throw new Error("CONTROL_ORDER_MISMATCH");
      const bytes = Buffer.from(string(item.bytesBase64), "base64");
      if (item.digest !== digest("shield:control:source:v1", bytes)) throw new Error("CONTROL_SOURCE_MISMATCH");
      const expected = sourceArtifact(string(item.artifactId));
      if (item.bytesBase64 !== expected.bytesBase64 || item.digest !== expected.digest) throw new Error("CONTROL_SOURCE_MISMATCH");
      return bytes;
    });
    const bytes = concat(delimiterValues[0]!, sources[0]!, delimiterValues[1]!, sources[1]!, delimiterValues[1]!, sources[2]!, delimiterValues[2]!);
    return Object.freeze({ state: "ok", value: Object.freeze({ bytes, digest: digest("shield:control:prompt:v1", bytes) }) });
  } catch (error) {
    const reason = error instanceof Error && ["CONTROL_ORDER_MISMATCH", "CONTROL_SOURCE_MISMATCH", "CONTROL_DELIMITER_MISMATCH", "IDENTITY_MISMATCH"].includes(error.message)
      ? error.message as ClosedReason : "INVALID_CANDIDATE";
    return Object.freeze({ state: "invalid", reason });
  }
}

export const REGISTRY = Object.freeze([
  "May retains ownership of the implementation artifact.",
  "Do not expand the approved scope or create authority.",
  "Operate only on the exact bound repository revision.",
  "Preserve Unicode /iu equivalence for K to k and ſ to s across readFile, listFiles, and searchRepo.",
  "Change only repository-sensitive-policy.mjs, repository-tools.mjs, and repository-tools.test.mjs.",
  "Run focused-real-tool-parity, repository-broker-suite, workspace-suite, packed-strict-consumer, package-dry-run, and git-diff-check.",
  "Stop for architecture change, stale governance, or production integration.",
  "Report changed files, tests run, and unresolved risks.",
]);

export interface DispatchIRV1 {
  readonly protocolVersion: typeof IDS.ir;
  readonly experimentId: typeof IDS.experiment;
  readonly trialId: typeof IDS.trial;
  readonly missionId: "issue-41";
  readonly subjectId: "issue-59";
  readonly repository: "RanSolo/shield-workspace";
  readonly branch: "codex/issue-41-adaptive-refinement";
  readonly baseCommit: "afdbf71b8ece2a2506a0b6a7b213267c7896f8d1";
  readonly baseTree: "2169142438703609a1c3a7e2a613db1997faca8b";
  readonly accountableSeat: "may";
  readonly artifactOwner: "may";
  readonly approvedFiles: readonly string[];
  readonly registry: readonly string[];
}

export const createIR = (): DispatchIRV1 => Object.freeze({
  protocolVersion: IDS.ir,
  experimentId: IDS.experiment,
  trialId: IDS.trial,
  missionId: "issue-41",
  subjectId: "issue-59",
  repository: "RanSolo/shield-workspace",
  branch: "codex/issue-41-adaptive-refinement",
  baseCommit: "afdbf71b8ece2a2506a0b6a7b213267c7896f8d1",
  baseTree: "2169142438703609a1c3a7e2a613db1997faca8b",
  accountableSeat: "may",
  artifactOwner: "may",
  approvedFiles: Object.freeze([
    "packages/shield-team-system/scripts/model/repository-sensitive-policy.mjs",
    "packages/shield-team-system/scripts/model/repository-tools.mjs",
    "packages/shield-team-system/tests/repository-tools.test.mjs",
  ]),
  registry: REGISTRY,
});

const IR_FIELDS = ["protocolVersion", "experimentId", "trialId", "missionId", "subjectId", "repository", "branch", "baseCommit", "baseTree", "accountableSeat", "artifactOwner", "approvedFiles", "registry"];

function normalizeIR(input: unknown): DispatchIRV1 {
  const value = exact(input, IR_FIELDS);
  const expected = createIR();
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("INVALID_CANDIDATE");
  return expected;
}

interface ReceiptPayload {
  readonly format: typeof IDS.receipt;
  readonly validatorId: typeof IDS.validator;
  readonly compilerId: typeof IDS.compiler;
  readonly irDigest: string;
  readonly governanceDigest: string;
  readonly registryDigest: string;
  readonly rendererDigest: string;
  readonly targetDigest: string;
  readonly dispatchId: string;
}

export interface ValidatedEnvelopeV1 {
  readonly envelopeVersion: typeof IDS.envelope;
  readonly ir: DispatchIRV1;
  readonly governanceDigest: string;
  readonly registryDigest: string;
  readonly rendererDigest: string;
  readonly targetDigest: string;
  readonly receiptPayload: ReceiptPayload;
  readonly signatureBase64: string;
}

export function createExperimentKeypair() {
  const pair = generateKeyPairSync("ed25519");
  return Object.freeze({ publicKey: pair.publicKey, privateKey: pair.privateKey });
}

function expectedReceiptPayload(ir: DispatchIRV1): ReceiptPayload {
  const irDigest = digest("shield:dispatch:ir:v1", canonical(ir));
  const governanceDigest = digest("shield:dispatch:governance:v1", utf8("mission-journal:issue-41:sequence-59:authorized-repair"));
  const registryDigest = digest("shield:dispatch:registry:v1", canonical(REGISTRY));
  const rendererDigest = digest("shield:dispatch:renderer:v1", utf8(IDS.renderer));
  const targetDigest = digest("shield:dispatch:target:v1", utf8(IDS.target));
  return Object.freeze({
    format: IDS.receipt, validatorId: IDS.validator, compilerId: IDS.compiler,
    irDigest, governanceDigest, registryDigest, rendererDigest, targetDigest,
    dispatchId: digest("shield:dispatch:id:v1", canonical({ irDigest, governanceDigest, trial: IDS.trial })),
  });
}

export function validateCandidate(irInput: unknown, privateKey: KeyObject): ValidatedEnvelopeV1 {
  const ir = normalizeIR(irInput);
  const receiptPayload = expectedReceiptPayload(ir);
  const { governanceDigest, registryDigest, rendererDigest, targetDigest } = receiptPayload;
  const signatureBase64 = signBytes(null, canonical(receiptPayload), privateKey).toString("base64");
  return Object.freeze({ envelopeVersion: IDS.envelope, ir, governanceDigest, registryDigest, rendererDigest, targetDigest, receiptPayload, signatureBase64 });
}

interface ProvenanceSpanV1 {
  readonly startByte: number;
  readonly endByte: number;
  readonly sourceKind: "renderer-spec" | "governed-field" | "registry-entry";
  readonly sourceId: string;
  readonly fieldPath: string | null;
}

const renderCompiledPrompt = (ir: DispatchIRV1): Readonly<{ bytes: Uint8Array; spans: readonly ProvenanceSpanV1[] }> => {
  const parts: Uint8Array[] = [];
  const spans: ProvenanceSpanV1[] = [];
  let offset = 0;
  const append = (text: string, sourceKind: ProvenanceSpanV1["sourceKind"], sourceId: string, fieldPath: string | null) => {
    const bytes = utf8(text);
    parts.push(bytes);
    spans.push(Object.freeze({ startByte: offset, endByte: offset + bytes.byteLength, sourceKind, sourceId, fieldPath }));
    offset += bytes.byteLength;
  };
  const fixed = (text: string) => append(text, "renderer-spec", IDS.renderer, null);
  const field = (label: string, value: string, fieldPath: string) => {
    fixed(`${label}: `);
    append(value, "governed-field", digest("shield:dispatch:ir-field:v1", utf8(`${fieldPath}\u0000${value}`)), fieldPath);
    fixed("\n");
  };
  fixed("# canonical-chat-v2\nThis structured dispatch grants no authority.\n\n");
  field("Mission", ir.missionId, "ir.missionId");
  field("Subject", ir.subjectId, "ir.subjectId");
  field("Repository", ir.repository, "ir.repository");
  field("Branch", ir.branch, "ir.branch");
  field("Base commit", ir.baseCommit, "ir.baseCommit");
  field("Base tree", ir.baseTree, "ir.baseTree");
  field("Accountable seat", ir.accountableSeat, "ir.accountableSeat");
  field("Artifact owner", ir.artifactOwner, "ir.artifactOwner");
  fixed("\nApproved files:\n");
  ir.approvedFiles.forEach((item, index) => {
    fixed("- ");
    append(item, "governed-field", digest("shield:dispatch:ir-field:v1", utf8(`ir.approvedFiles.${index}\u0000${item}`)), `ir.approvedFiles.${index}`);
    fixed("\n");
  });
  fixed("\nGoverned obligations:\n");
  ir.registry.forEach((item, index) => {
    fixed("- ");
    append(item, "registry-entry", digest("shield:dispatch:registry-entry:v1", utf8(item)), `registry.${index}`);
    fixed("\n");
  });
  return Object.freeze({ bytes: concat(...parts), spans: Object.freeze(spans) });
};

function assertCompleteProvenance(bytes: Uint8Array, spans: readonly ProvenanceSpanV1[]): void {
  let offset = 0;
  for (const span of spans) {
    if (span.startByte !== offset || span.endByte <= span.startByte || span.endByte > bytes.byteLength) {
      throw new Error("INVALID_CANDIDATE");
    }
    offset = span.endByte;
  }
  if (offset !== bytes.byteLength) throw new Error("INVALID_CANDIDATE");
}

export interface CompilationOutputV1 {
  readonly promptBytes: Uint8Array;
  readonly promptDigest: string;
  readonly provenanceBytes: Uint8Array;
  readonly manifestBytes: Uint8Array;
}

export function compileDispatch(input: unknown, publicKey: KeyObject): Result<CompilationOutputV1> {
  try {
    const value = exact(input, ["envelopeVersion", "ir", "governanceDigest", "registryDigest", "rendererDigest", "targetDigest", "receiptPayload", "signatureBase64"]);
    if (value.envelopeVersion !== IDS.envelope) throw new Error("IDENTITY_MISMATCH");
    const ir = normalizeIR(value.ir);
    const payload = exact(value.receiptPayload, ["format", "validatorId", "compilerId", "irDigest", "governanceDigest", "registryDigest", "rendererDigest", "targetDigest", "dispatchId"]);
    if (payload.format !== IDS.receipt || payload.validatorId !== IDS.validator || payload.compilerId !== IDS.compiler) throw new Error("RECEIPT_BINDING_MISMATCH");
    const expected = expectedReceiptPayload(ir);
    for (const field of ["irDigest", "governanceDigest", "registryDigest", "rendererDigest", "targetDigest", "dispatchId"] as const) {
      if (payload[field] !== expected[field]) throw new Error("RECEIPT_BINDING_MISMATCH");
    }
    for (const field of ["governanceDigest", "registryDigest", "rendererDigest", "targetDigest"] as const) {
      if (value[field] !== expected[field]) throw new Error("RECEIPT_BINDING_MISMATCH");
    }
    if (!verifyBytes(null, canonical(payload), publicKey, Buffer.from(string(value.signatureBase64), "base64"))) throw new Error("INVALID_RECEIPT");
    const rendered = renderCompiledPrompt(ir);
    const promptBytes = rendered.bytes;
    assertCompleteProvenance(promptBytes, rendered.spans);
    const promptDigest = digest("shield:compiled:prompt:v1", promptBytes);
    const provenance = Object.freeze({ format: IDS.provenance, promptDigest, irDigest: payload.irDigest, registryDigest: payload.registryDigest, rendererDigest: payload.rendererDigest, spans: rendered.spans });
    const provenanceBytes = canonical(provenance);
    const manifestBytes = canonical(Object.freeze({ format: IDS.manifest, compilerId: IDS.compiler, validatorId: IDS.validator, rendererId: IDS.renderer, targetId: IDS.target, promptDigest, provenanceDigest: digest("shield:compiled:provenance:v1", provenanceBytes) }));
    return Object.freeze({ state: "ok", value: Object.freeze({ promptBytes, promptDigest, provenanceBytes, manifestBytes }) });
  } catch (error) {
    const allowed = ["IDENTITY_MISMATCH", "RECEIPT_BINDING_MISMATCH", "INVALID_RECEIPT"];
    const reason = error instanceof Error && allowed.includes(error.message) ? error.message as ClosedReason : "INVALID_CANDIDATE";
    return Object.freeze({ state: "invalid", reason });
  }
}

export function createSharedArtifacts() {
  const sharedBytes = utf8(SHARED_RUNTIME_INSTRUCTIONS);
  const sharedDigest = digest("shield:runtime:shared-instructions:v1", sharedBytes);
  const wrapperBytes = utf8(`# common-runtime-wrapper.v1
Experiment: ${IDS.experiment}
Trial: ${IDS.trial}
Accountable seat: may
Authority: descriptive-only
Shared instructions digest: ${sharedDigest}

`);
  return Object.freeze({
    sharedBytes,
    sharedDigest,
    wrapperBytes,
    wrapperDigest: digest("shield:runtime:wrapper:v1", wrapperBytes),
  });
}

export function createRuntimeEnvelope(arm: "control" | "compiled", promptBytes: Uint8Array) {
  const shared = createSharedArtifacts();
  const systemBytes = concat(shared.wrapperBytes, shared.sharedBytes);
  const promptDomain = arm === "control" ? "shield:control:prompt:v1" : "shield:compiled:prompt:v1";
  const value = Object.freeze({
    format: IDS.messageEnvelope,
    targetProfileId: IDS.target,
    targetProfileDigest: digest("shield:dispatch:target:v1", utf8(IDS.target)),
    wrapperDigest: shared.wrapperDigest,
    sharedInstructionDigest: shared.sharedDigest,
    armPromptDigest: digest(promptDomain, promptBytes),
    messages: Object.freeze([
      Object.freeze({ role: "system", bytesBase64: Buffer.from(systemBytes).toString("base64") }),
      Object.freeze({ role: "user", bytesBase64: Buffer.from(promptBytes).toString("base64") }),
    ]),
  });
  const bytes = canonical(value);
  return Object.freeze({ value, bytes, digest: digest(`shield:runtime:message-envelope:${arm}:v1`, bytes) });
}

export function verifyRuntimeEnvelope(
  arm: "control" | "compiled",
  promptBytes: Uint8Array,
  envelopeInput: unknown,
): Result<Readonly<{ bytes: Uint8Array; digest: string }>> {
  try {
    const expected = createRuntimeEnvelope(arm, promptBytes);
    const record = exact(envelopeInput, [
      "format", "targetProfileId", "targetProfileDigest", "wrapperDigest",
      "sharedInstructionDigest", "armPromptDigest", "messages",
    ]);
    if (!Array.isArray(record.messages) || record.messages.length !== 2) throw new Error("MESSAGE_ENVELOPE_MISMATCH");
    const roles = ["system", "user"];
    record.messages.forEach((message, index) => {
      const item = exact(message, ["role", "bytesBase64"]);
      if (item.role !== roles[index] || typeof item.bytesBase64 !== "string") throw new Error("MESSAGE_ENVELOPE_MISMATCH");
    });
    const bytes = canonical(record);
    if (Buffer.compare(Buffer.from(bytes), Buffer.from(expected.bytes)) !== 0) throw new Error("MESSAGE_ENVELOPE_MISMATCH");
    return Object.freeze({ state: "ok", value: Object.freeze({ bytes, digest: expected.digest }) });
  } catch {
    return Object.freeze({ state: "invalid", reason: "MESSAGE_ENVELOPE_MISMATCH" });
  }
}

export function constructCandidate() {
  const keypair = createExperimentKeypair();
  const envelope = validateCandidate(createIR(), keypair.privateKey);
  const compiled = compileDispatch(envelope, keypair.publicKey);
  if (compiled.state !== "ok") throw new Error(compiled.reason);
  const controlBundle = createControlBundle();
  const control = assembleControlPrompt(controlBundle);
  if (control.state !== "ok") throw new Error(control.reason);
  const shared = createSharedArtifacts();
  const controlEnvelope = createRuntimeEnvelope("control", control.value.bytes);
  const compiledEnvelope = createRuntimeEnvelope("compiled", compiled.value.promptBytes);
  return Object.freeze({ controlBundle, control: control.value, compiled: compiled.value, shared, controlEnvelope, compiledEnvelope });
}
