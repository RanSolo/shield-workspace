import { concatBytes, utf8 } from "./canonical.js";
import {
  IDS,
  type ProvenanceSpanV0,
  type RegistryEntryV0,
  type ValidatedDispatchEnvelopeV0,
} from "./contracts.js";
import { fail } from "./errors.js";

interface RenderedDispatchV0 {
  readonly promptBytes: Uint8Array;
  readonly spans: readonly ProvenanceSpanV0[];
}

export function renderCanonicalChatV1(envelope: ValidatedDispatchEnvelopeV0): RenderedDispatchV0 {
  const byteParts: Uint8Array[] = [];
  const spans: ProvenanceSpanV0[] = [];
  let offset = 0;
  const append = (text: string, source: Omit<ProvenanceSpanV0, "startByte" | "endByte">) => {
    const bytes = utf8(text);
    byteParts.push(bytes);
    spans.push(Object.freeze({ startByte: offset, endByte: offset + bytes.byteLength, ...source }));
    offset += bytes.byteLength;
  };
  const fixed = (text: string) => append(text, {
    sourceKind: "renderer_spec", sourceId: envelope.renderer.digest, fieldPath: null,
    sourceStartByte: null, sourceEndByte: null, sourceDerivation: null,
    selectedBySeat: null, judgmentRecordId: null,
  });
  const mapped = (text: string, fieldPath: string) => {
    const source = envelope.provenanceBindings.find((entry) => entry.fieldPath === fieldPath);
    if (!source) fail("PROVENANCE_SOURCE_MISMATCH");
    append(text, {
      sourceKind: "governed_field", sourceId: source.artifactDigest, fieldPath,
      sourceStartByte: source.sourceStartByte, sourceEndByte: source.sourceEndByte,
      sourceDerivation: source.derivation,
      selectedBySeat: source.selectedBySeat, judgmentRecordId: source.judgmentRecordId,
    });
  };
  const line = (label: string, value: string, fieldPath: string) => {
    fixed(`${label}: `); mapped(value, fieldPath); fixed("\n");
  };
  const list = (label: string, values: readonly string[], basePath: string) => {
    fixed(`${label}:\n`);
    values.forEach((value, index) => { fixed("- "); mapped(value, `${basePath}.${index}`); fixed("\n"); });
  };
  const registryLine = (entry: RegistryEntryV0) => {
    fixed("- ");
    append(entry.text, {
      sourceKind: "registry_entry", sourceId: `${envelope.registry.id}:${entry.id}`,
      fieldPath: null, sourceStartByte: null, sourceEndByte: null,
      sourceDerivation: null,
      selectedBySeat: null, judgmentRecordId: null,
    });
    fixed("\n");
  };

  const ir = envelope.ir;
  fixed("# canonical-chat-v1\n");
  fixed("You are the accountable implementation seat. This prompt grants no authority.\n\n");
  fixed("## Dispatch binding\n");
  line("Experiment", ir.experimentId, "ir.experimentId");
  line("Trial", ir.trialId, "ir.trialId");
  line("Replay", ir.replayId, "ir.replayId");
  line("Arm", ir.armId, "ir.armId");
  line("Mission", ir.missionId, "ir.missionId");
  line("Subject", ir.subjectId, "ir.subjectId");
  line("Repository", ir.repository, "ir.repository");
  line("Branch", ir.branch, "ir.branch");
  line("Base commit", ir.baseCommit, "ir.baseCommit");
  line("Base tree", ir.baseTree, "ir.baseTree");
  line("Accountable seat", ir.accountableSeat, "ir.accountableSeat");
  line("Artifact owner", ir.artifactOwner, "ir.artifactOwner");
  line("Gate", ir.gate, "ir.gate");
  line("Mode", ir.modeRef, "ir.modeRef");
  line("Seat contract", ir.seatContractRef, "ir.seatContractRef");
  line("Runtime profile observation", ir.runtimeProfileRef, "ir.runtimeProfileRef");
  line("Output contract", ir.outputContractRef, "ir.outputContractRef");
  list("Approved files", ir.approvedFileScope, "ir.approvedFileScope");

  fixed("\n## Typed repair facts\n");
  line("Finding", ir.taskFacts.findingId, "ir.taskFacts.findingId");
  fixed("Unicode simple equivalents:\n");
  ir.taskFacts.unicodeEquivalences.forEach((pair, index) => {
    fixed("- "); mapped(pair.from, `ir.taskFacts.unicodeEquivalences.${index}.from`);
    fixed(" -> "); mapped(pair.to, `ir.taskFacts.unicodeEquivalences.${index}.to`); fixed("\n");
  });
  list("Regression paths", ir.taskFacts.regressionPaths, "ir.taskFacts.regressionPaths");
  list("Parity tools", ir.taskFacts.parityTools, "ir.taskFacts.parityTools");
  list("Forbidden change classes", ir.taskFacts.forbiddenChangeClasses, "ir.taskFacts.forbiddenChangeClasses");

  fixed("\n## Expanded governed obligations\n");
  for (const ref of ir.instructionRefs) {
    const entry = envelope.registry.entries.find((candidate) => candidate.id === ref);
    if (!entry) fail("OBLIGATION_MISSING");
    registryLine(entry);
  }
  list("Validation obligations", ir.validationObligations, "ir.validationObligations");
  list("Stop conditions", ir.stopConditions, "ir.stopConditions");

  fixed("\n## Content-addressed governed context\n");
  ir.contextReferences.forEach((reference, index) => {
    fixed("- "); mapped(reference.artifactId, `ir.contextReferences.${index}.artifactId`);
    fixed(" @ "); mapped(reference.digest, `ir.contextReferences.${index}.digest`); fixed("\n");
  });
  fixed("\nReturn only the required implementation report. Stop on any listed condition.\n");

  return Object.freeze({ promptBytes: concatBytes(byteParts), spans: Object.freeze(spans) });
}

export function validateProvenanceCoverage(
  promptBytes: Uint8Array,
  spans: readonly ProvenanceSpanV0[],
): void {
  let expectedStart = 0;
  for (const span of spans) {
    if (span.startByte < expectedStart) fail("PROVENANCE_OVERLAP");
    if (span.startByte > expectedStart) fail("PROVENANCE_GAP");
    if (span.endByte <= span.startByte || span.endByte > promptBytes.byteLength) {
      fail("PROVENANCE_SOURCE_MISMATCH");
    }
    expectedStart = span.endByte;
  }
  if (expectedStart !== promptBytes.byteLength) fail("PROVENANCE_GAP");
}

export const RENDERER_ID = IDS.renderer;
