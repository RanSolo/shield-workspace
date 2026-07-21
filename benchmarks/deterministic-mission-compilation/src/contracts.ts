export const IDS = Object.freeze({
  ir: "mission-dispatch-ir.v0",
  envelope: "validated-dispatch.v0",
  validator: "shield-dispatch-validator@0.1.0-experiment",
  compiler: "shield-compiler@0.1.0-experiment",
  renderer: "canonical-chat-v1",
  registry: "shield-dispatch-registry.v0",
  target: "codex-text.v0",
  provenance: "dispatch-provenance.v0",
  manifest: "compilation-manifest.v0",
  receipt: "dispatch-validation-receipt.v0",
} as const);

export type ClosedReason =
  | "INVALID_CANDIDATE"
  | "UNKNOWN_FIELD"
  | "MISSING_FIELD"
  | "SPARSE_ARRAY"
  | "ACCESSOR_FIELD"
  | "EXCESSIVE_VALUE"
  | "UNPAIRED_SURROGATE"
  | "UNSAFE_VALUE"
  | "OBLIGATION_MISSING"
  | "OUT_OF_SCOPE_FILE"
  | "AUTHORITY_INTRODUCED"
  | "SOURCE_MAP_INVALID"
  | "CONTENT_DIGEST_MISMATCH"
  | "IR_DIGEST_MISMATCH"
  | "GOVERNANCE_DIGEST_MISMATCH"
  | "REGISTRY_DIGEST_MISMATCH"
  | "FIXTURE_DIGEST_MISMATCH"
  | "CONTEXT_DIGEST_MISMATCH"
  | "RENDERER_DIGEST_MISMATCH"
  | "TARGET_DIGEST_MISMATCH"
  | "MISSING_RECEIPT"
  | "MALFORMED_RECEIPT"
  | "FORGED_RECEIPT"
  | "RECEIPT_EXPIRED"
  | "RECEIPT_REVOKED"
  | "RECEIPT_BINDING_MISMATCH"
  | "PROVENANCE_GAP"
  | "PROVENANCE_OVERLAP"
  | "PROVENANCE_SOURCE_MISMATCH"
  | "PROHIBITED_DEPENDENCY"
  | "OPERATIONAL_INPUT_INFLUENCE"
  | "CROSS_DOMAIN_DIGEST";

export type Result<T> =
  | Readonly<{ state: "ok"; value: T }>
  | Readonly<{ state: "invalid"; reason: ClosedReason }>;

export interface TaskFactsV0 {
  readonly findingId: "FURY-41-CONFORMANCE-001";
  readonly unicodeEquivalences: readonly Readonly<{ from: "K" | "ſ"; to: "k" | "s" }>[];
  readonly regressionPaths: readonly ["private.Key", "id_rſa", "toKen.json"];
  readonly parityTools: readonly ["readFile", "listFiles", "searchRepo"];
  readonly forbiddenChangeClasses: readonly string[];
}

export interface MissionDispatchIRV0 {
  readonly protocolVersion: "mission-dispatch-ir.v0";
  readonly experimentId: string;
  readonly trialId: string;
  readonly replayId: string;
  readonly armId: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repository: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly baseTree: string;
  readonly accountableSeat: "may";
  readonly artifactOwner: "may";
  readonly gate: "implementation-repair";
  readonly approvedFileScope: readonly string[];
  readonly taskFacts: TaskFactsV0;
  readonly instructionRefs: readonly string[];
  readonly modeRef: string;
  readonly seatContractRef: string;
  readonly runtimeProfileRef: string;
  readonly outputContractRef: string;
  readonly validationObligations: readonly string[];
  readonly stopConditions: readonly string[];
  readonly contextReferences: readonly ContentReferenceV0[];
}

export interface ContentArtifactV0 {
  readonly artifactId: string;
  readonly mediaType: "text/plain; charset=utf-8" | "application/json";
  readonly bytesBase64: string;
  readonly digest: string;
}

export interface ContentReferenceV0 {
  readonly artifactId: string;
  readonly digest: string;
}

export interface SourceMapEntryV0 {
  readonly fieldPath: string;
  readonly artifactId: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly selectedBySeat: "hill" | null;
  readonly judgmentRecordId: string | null;
}

export interface ContentBindingV0 {
  readonly artifactId: string;
  readonly artifactDigest: string;
  readonly byteLength: number;
}

export interface ProvenanceBindingV0 {
  readonly fieldPath: string;
  readonly artifactId: string;
  readonly artifactDigest: string;
  readonly sourceStartByte: number;
  readonly sourceEndByte: number;
  readonly selectedValueDigest: string;
  readonly derivation: "literal_selection" | "mechanical_artifact_id" | "mechanical_artifact_digest";
  readonly selectedBySeat: "hill" | null;
  readonly judgmentRecordId: string | null;
}

export interface RegistryEntryV0 {
  readonly id: string;
  readonly text: string;
}

export interface RegistryBundleV0 {
  readonly id: "shield-dispatch-registry.v0";
  readonly entries: readonly RegistryEntryV0[];
  readonly bytesBase64: string;
  readonly digest: string;
}

export interface GovernanceBindingV0 {
  readonly governanceContractId: string;
  readonly journalHeadEntryId: string;
  readonly journalSequence: number;
  readonly authorizationState: "authorized";
  readonly digest: string;
}

export interface DeterministicSpecV0 {
  readonly id: string;
  readonly version: string;
  readonly bytesBase64: string;
  readonly digest: string;
}

export interface DispatchCandidateV0 {
  readonly candidateVersion: "dispatch-candidate.v0";
  readonly ir: MissionDispatchIRV0;
  readonly governance: GovernanceBindingV0;
  readonly registry: RegistryBundleV0;
  readonly renderer: DeterministicSpecV0;
  readonly targetProfile: DeterministicSpecV0;
  readonly sourceArtifacts: readonly ContentArtifactV0[];
  readonly sourceMap: readonly SourceMapEntryV0[];
}

export interface ReceiptPayloadV0 {
  readonly receiptFormat: "dispatch-validation-receipt.v0";
  readonly keyId: string;
  readonly validatorId: string;
  readonly compilerId: string;
  readonly experimentId: string;
  readonly trialId: string;
  readonly replayId: string;
  readonly armId: string;
  readonly singleDispatchId: string;
  readonly repository: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly baseTree: string;
  readonly accountableSeat: string;
  readonly artifactOwner: string;
  readonly gate: string;
  readonly governanceHeadEntryId: string;
  readonly governanceSequence: number;
  readonly irDigest: string;
  readonly governanceDigest: string;
  readonly registryDigest: string;
  readonly fixtureDigest: string;
  readonly contextDigest: string;
  readonly rendererDigest: string;
  readonly targetProfileDigest: string;
  readonly issuanceCounter: number;
  readonly expiresAfterCounter: number;
}

export interface ValidationReceiptV0 {
  readonly format: "dispatch-validation-receipt.v0";
  readonly payloadBase64: string;
  readonly payloadDigest: string;
  readonly signatureBase64: string;
}

export interface ValidatedDispatchEnvelopeV0 {
  readonly envelopeVersion: "validated-dispatch.v0";
  readonly ir: MissionDispatchIRV0;
  readonly irBytesBase64: string;
  readonly governance: GovernanceBindingV0;
  readonly registry: RegistryBundleV0;
  readonly renderer: DeterministicSpecV0;
  readonly targetProfile: DeterministicSpecV0;
  readonly sourceBindings: readonly ContentBindingV0[];
  readonly provenanceBindings: readonly ProvenanceBindingV0[];
  readonly fixtureDigest: string;
  readonly contextDigest: string;
  readonly receipt: ValidationReceiptV0;
}

export interface HostObservationV0 {
  readonly observationVersion: "trusted-host-observation.v0";
  readonly keyId: string;
  readonly validatorId: string;
  readonly compilerId: string;
  readonly singleDispatchId: string;
  readonly expectedIrDigest: string;
  readonly expectedGovernanceDigest: string;
  readonly expectedRegistryDigest: string;
  readonly expectedFixtureDigest: string;
  readonly expectedContextDigest: string;
  readonly expectedRendererDigest: string;
  readonly expectedTargetProfileDigest: string;
  readonly issuanceCounter: number;
  readonly expiresAfterCounter: number;
  readonly currentAuthorization: "authorized";
}

export interface ReceiptTrustV0 {
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly currentCounter: number;
  readonly revokedDispatchIds: readonly string[];
}

export interface ProvenanceSpanV0 {
  readonly startByte: number;
  readonly endByte: number;
  readonly sourceKind: "renderer_spec" | "registry_entry" | "governed_field";
  readonly sourceId: string;
  readonly fieldPath: string | null;
  readonly sourceStartByte: number | null;
  readonly sourceEndByte: number | null;
  readonly sourceDerivation: ProvenanceBindingV0["derivation"] | null;
  readonly selectedBySeat: "hill" | null;
  readonly judgmentRecordId: string | null;
}

export interface CompilationManifestV0 {
  readonly format: "compilation-manifest.v0";
  readonly compilerId: string;
  readonly rendererId: string;
  readonly targetProfileId: string;
  readonly irDigest: string;
  readonly governanceDigest: string;
  readonly registryDigest: string;
  readonly fixtureDigest: string;
  readonly contextDigest: string;
  readonly rendererDigest: string;
  readonly targetProfileDigest: string;
  readonly promptDigest: string;
  readonly provenanceDigest: string;
  readonly promptByteLength: number;
  readonly provenanceByteLength: number;
}

export interface CompilationOutputV0 {
  readonly promptBytes: Uint8Array;
  readonly provenanceBytes: Uint8Array;
  readonly manifestBytes: Uint8Array;
  readonly manifest: CompilationManifestV0;
}
