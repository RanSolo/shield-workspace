import { evaluateSeatDispatchAttributionV1 } from "@shield/team-system/dispatch-receipts";
import { FIXTURE_MANIFEST } from "./fixture-manifest.mjs";

const DEFINITION_FIELDS = Object.freeze([
  "evidenceId",
  "authority",
  "requirement",
  "state",
  "evidenceIdentity",
  "provenance",
  "measurementClass",
  "accountableSeat",
  "dispatchReceipt",
  "verifiedHumanEvidenceRef",
  "evidenceRef"
]);

const DEFINITION_IDS = Object.freeze([
  "package.artifact.digest",
  "external.base.revision",
  "external.head.revision",
  "host.configuration",
  "blind.status",
  "model.runtime.executor.identity",
  "clocks.timing",
  "usage.observability",
  "installation.friction",
  "human.interventions",
  "coulson.authorization",
  "fitz.technical-review",
  "simmons.product-review",
  "fury.revision-history",
  "stale.evidence",
  "review.publish.scope",
  "host.adapter.failure",
  "host.manual-fallback",
  "defect.failure-injection",
  "defect.rollback"
]);

const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,127}$/u;
const LOWER_HEX_SHA_256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

const AGENT_SEAT_SET = Object.freeze(new Set([
  "daisy",
  "hill",
  "fury",
  "may",
  "mack"
]));

const REPLAY_ANCHOR_KIND = "trusted-journal-replay-anchor";
const REPLAY_ANCHOR_FIELDS = Object.freeze([
  "kind",
  "producerContractVersion",
  "producerDigest",
  "anchorDigest",
  "anchorRevision",
  "parentMissionId",
  "parentMissionRevision",
  "parentSessionId",
  "childTaskId",
  "childSessionId",
  "repositoryId",
  "repositoryWorkspaceId",
  "repositoryRevision",
  "subjectId",
  "subjectRevision",
  "artifactId",
  "artifactRevision",
  "accountableSeatId",
  "currentSequence",
  "lifecycle"
]);

const RECEIPT_PROJECTION_FIELDS = Object.freeze([
  "receiptId",
  "dispatchId",
  "parentMissionId",
  "parentMissionRevision",
  "parentSessionId",
  "childTaskId",
  "childSessionId",
  "accountableSeatId",
  "repositoryId",
  "repositoryWorkspaceId",
  "repositoryRevision",
  "subjectId",
  "subjectRevision",
  "artifactId",
  "artifactRevision",
  "state",
  "schemaVersion",
  "contractVersion",
  "configuredRuntime",
  "requestedRuntime",
  "toolExecution",
  "runtimeSelfReportHistory",
  "runtimeHostHistory",
  "executorSelfReportHistory",
  "executorHostHistory",
  "inputEvidenceRefs",
  "outputEvidenceRefs",
  "lastEventTimestamp",
  "startedAt",
  "logSequence",
  "lastEntryDigest",
  "previousLogDigest",
  "lifecycleSequence",
  "previousLifecycleDigest"
]);

const HUMAN_AUTHORITY_SEAT = Object.freeze({
  "coulson.authorization": "coulson",
  "fitz.technical-review": "fitz",
  "simmons.product-review": "simmons"
});

const DEFINITION_STATES = Object.freeze(new Set(["missing", "waiting", "recorded"]));

const DEFINITION_FIELDS_CLOSED = Object.freeze(["state", "authority", "requirement", "evidenceId"]);
const HISTORY_KIND_PREFIXES = Object.freeze(["runtime.", "executor.", "tool."]);
const SEAT_DISPATCH_STATES = Object.freeze([
  "started",
  "interrupted",
  "resumed",
  "completed",
  "failed",
  "cancelled"
]);

function plain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function parseReplayAnchor(value) {
  if (!plain(value) || !exact(value, REPLAY_ANCHOR_FIELDS)) return null;
  if (value.kind !== REPLAY_ANCHOR_KIND) return null;
  if (typeof value.producerContractVersion !== "string" ||
      !isCanonicalId(value.producerContractVersion) ||
      typeof value.producerDigest !== "string" ||
      typeof value.anchorDigest !== "string" ||
      !LOWER_HEX_SHA_256.test(value.anchorDigest) ||
      !LOWER_HEX_SHA_256.test(value.producerDigest) ||
      typeof value.anchorRevision !== "string" ||
      !OID.test(value.anchorRevision) ||
      !Number.isSafeInteger(value.currentSequence) ||
      value.currentSequence < 0 ||
      typeof value.lifecycle !== "string" ||
      !isCanonicalId(value.lifecycle) ||
      !AGENT_SEAT_SET.has(value.accountableSeatId)) {
    return null;
  }
  for (const field of ["producerContractVersion", "parentMissionId", "parentSessionId",
    "childTaskId", "childSessionId", "repositoryId", "repositoryWorkspaceId",
    "subjectId", "artifactId", "lifecycle"]) {
    if (!isCanonicalId(value[field])) return null;
  }
  for (const field of ["parentMissionRevision", "repositoryRevision", "subjectRevision", "artifactRevision"]) {
    if (typeof value[field] !== "string" || !OID.test(value[field])) return null;
  }
  return Object.freeze({ ...value });
}

function arrayClosed(value) {
  return Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Reflect.ownKeys(value).every((key) =>
      key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key))
    );
}

function isCanonicalId(value) {
  return typeof value === "string" &&
    value.normalize("NFC") === value &&
    CANONICAL_ID.test(value);
}

function isEvidenceRef(value) {
  return typeof value === "string" && EVIDENCE_REF.test(value);
}

function validateSourceRef(value) {
  return plain(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "sourceId") &&
    Object.hasOwn(value, "sourceDigest") &&
    isCanonicalId(value.sourceId) &&
    typeof value.sourceDigest === "string" &&
    LOWER_HEX_SHA_256.test(value.sourceDigest);
}

function isHistoryArray(value) {
  if (!arrayClosed(value)) return false;
  for (const entry of value) {
    if (!plain(entry) ||
        typeof entry.kind !== "string" ||
        HISTORY_KIND_PREFIXES.every((prefix) => !entry.kind.startsWith(prefix))) {
      return false;
    }
  }
  return true;
}

function isSeatDispatchReceiptProjection(value) {
  if (!plain(value) || !exact(value, RECEIPT_PROJECTION_FIELDS)) return false;
  if (typeof value.schemaVersion !== "number" || value.schemaVersion !== 1) return false;
  if (typeof value.contractVersion !== "string" || value.contractVersion.length === 0) return false;
  if (!isCanonicalId(value.receiptId) || !isCanonicalId(value.dispatchId)) return false;
  for (const field of ["parentMissionId", "parentSessionId", "childTaskId", "childSessionId",
    "accountableSeatId", "repositoryId", "repositoryWorkspaceId", "subjectId", "artifactId"]) {
    if (!isCanonicalId(value[field])) return false;
  }
  for (const field of ["parentMissionRevision", "repositoryRevision", "subjectRevision", "artifactRevision"]) {
    if (typeof value[field] !== "string" || !OID.test(value[field])) return false;
  }
  if (!isHistoryArray(value.runtimeSelfReportHistory) ||
      !isHistoryArray(value.runtimeHostHistory) ||
      !isHistoryArray(value.executorSelfReportHistory) ||
      !isHistoryArray(value.executorHostHistory)) return false;
  if (!arrayClosed(value.inputEvidenceRefs) ||
      !isEvidenceList(value.outputEvidenceRefs, true) ||
      typeof value.lastEventTimestamp !== "string" ||
      typeof value.startedAt !== "string" ||
      !Number.isSafeInteger(value.logSequence) ||
      !Number.isSafeInteger(value.lifecycleSequence) ||
      (value.lastEntryDigest !== null && typeof value.lastEntryDigest !== "string") ||
      (value.previousLogDigest !== null && typeof value.previousLogDigest !== "string") ||
      (value.previousLifecycleDigest !== null && typeof value.previousLifecycleDigest !== "string") ||
      !SEAT_DISPATCH_STATES.includes(value.state)) {
    return false;
  }
  return true;
}

function isEvidenceList(value, allowNull) {
  return value === null ? allowNull : arrayClosed(value);
}

const DEFINITIONS = Object.freeze([
  Object.freeze({
    evidenceId: "package.artifact.digest",
    authority: "measured",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "external.base.revision",
    authority: "measured",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "external.head.revision",
    authority: "measured",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "host.configuration",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "blind.status",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "model.runtime.executor.identity",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "clocks.timing",
    authority: "measured",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "usage.observability",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "installation.friction",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "human.interventions",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "coulson.authorization",
    authority: "human-only",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "fitz.technical-review",
    authority: "human-only",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "waiting",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "simmons.product-review",
    authority: "human-only",
    requirement: "conditional",
    measurementClass: "measured",
    pendingState: "waiting",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "fury.revision-history",
    authority: "revision-bound-contract",
    requirement: "required",
    measurementClass: "derived",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "stale.evidence",
    authority: "revision-bound-contract",
    requirement: "required",
    measurementClass: "derived",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "review.publish.scope",
    authority: "permission-contract",
    requirement: "required",
    measurementClass: "derived",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "host.adapter.failure",
    authority: "adapter-candidate",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: true
  }),
  Object.freeze({
    evidenceId: "host.manual-fallback",
    authority: "operator-recorded",
    requirement: "required",
    measurementClass: "not-observable",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "defect.failure-injection",
    authority: "fixture-grader",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: false
  }),
  Object.freeze({
    evidenceId: "defect.rollback",
    authority: "fixture-grader",
    requirement: "required",
    measurementClass: "measured",
    pendingState: "missing",
    requiresAttribution: false
  })
]);

const DEFINITION_BY_ID = Object.freeze(DEFINITIONS.reduce((memo, definition) => {
  memo[definition.evidenceId] = definition;
  return memo;
}, Object.create(null)));

const DEFINITION_ORDER_OK = Object.freeze(DEFINITION_IDS.every((evidenceId) => Object.hasOwn(DEFINITION_BY_ID, evidenceId)));

if (!DEFINITION_ORDER_OK) {
  throw new Error("EVIDENCE_DEFINITION_MISMATCH");
}

function createPendingEntry(definition) {
  return Object.freeze({
    evidenceId: definition.evidenceId,
    authority: definition.authority,
    requirement: definition.requirement,
    state: definition.pendingState,
    evidenceIdentity: null,
    provenance: null,
    measurementClass: null,
    accountableSeat: null,
    dispatchReceipt: null,
    verifiedHumanEvidenceRef: null,
    evidenceRef: null
  });
}

function closeEvidenceEntry(entry, definition) {
  if (!exact(entry, DEFINITION_FIELDS)) return "evidence_entry_malformed";
  if (!DEFINITION_FIELDS_CLOSED.every((field) => entry[field] !== undefined)) {
    return "evidence_entry_malformed";
  }
  if (entry.evidenceId !== definition.evidenceId ||
      entry.authority !== definition.authority ||
      entry.requirement !== definition.requirement ||
      !DEFINITION_STATES.has(entry.state)) {
    return "evidence_entry_malformed";
  }
  if (entry.state !== "recorded") {
    if (entry.state !== definition.pendingState) return "evidence_entry_malformed";
    if (entry.evidenceIdentity !== null ||
        entry.provenance !== null ||
        entry.measurementClass !== null ||
        entry.accountableSeat !== null ||
        entry.dispatchReceipt !== null ||
        entry.verifiedHumanEvidenceRef !== null ||
        entry.evidenceRef !== null) {
      return "evidence_entry_malformed";
    }
    return null;
  }

  if (entry.measurementClass !== definition.measurementClass) return "evidence_measurement_class_malformed";
  if (!isEvidenceRef(entry.evidenceRef)) {
    return "evidence_entry_malformed";
  }
  if (!isCanonicalId(entry.evidenceIdentity) || !validateSourceRef(entry.provenance)) {
    return "evidence_identity_malformed";
  }
  if (definition.authority === "human-only") {
    if (HUMAN_AUTHORITY_SEAT[definition.evidenceId] !== entry.accountableSeat ||
        !validateSourceRef(entry.verifiedHumanEvidenceRef) ||
        entry.dispatchReceipt !== null) {
      return "evidence_entry_malformed";
    }
    return null;
  }

  if (!AGENT_SEAT_SET.has(entry.accountableSeat)) return "evidence_entry_malformed";
  if (entry.verifiedHumanEvidenceRef !== null) return "evidence_entry_malformed";
  if (definition.requiresAttribution && entry.dispatchReceipt === null) return "evidence_entry_malformed";
  if (!definition.requiresAttribution && entry.dispatchReceipt !== null) return "evidence_entry_malformed";
  if (entry.dispatchReceipt !== null && !isSeatDispatchReceiptProjection(entry.dispatchReceipt)) {
    return "evidence_entry_malformed";
  }
  return null;
}

function toJson(value) {
  return JSON.stringify(value);
}

function validateAttributionInput(input) {
  if (!plain(input)) return false;
  if (!Object.hasOwn(input, "rawReceiptEntries") && !Object.hasOwn(input, "replayResult")) return false;
  const keys = Object.keys(input);
  for (const key of keys) {
    if (key !== "rawReceiptEntries" && key !== "replayResult") return false;
  }
  if (input.rawReceiptEntries !== undefined && !arrayClosed(input.rawReceiptEntries)) return false;
  if (input.replayResult !== undefined && !plain(input.replayResult)) return false;
  return true;
}

function expectedEntries(requireSimmons = false) {
  return DEFINITIONS
    .filter((definition) => definition.evidenceId !== "simmons.product-review" || requireSimmons)
    .map((definition) => createPendingEntry(definition));
}

export function createEvidenceInventory({ requireSimmons = false } = {}) {
  return Object.freeze(expectedEntries(requireSimmons));
}

export function gradeEvidenceInventory(inventory, options = {}) {
  const { requireSimmons = false, attributionInputs = {}, replayAnchor } = options;
  const expected = Object.freeze(expectedEntries(requireSimmons));
  const reasons = FIXTURE_MANIFEST.dependencyBlockers.map(
    ({ issue, code, currentFixtureState }) =>
      `dependency_contract_unavailable:${issue}:${code}:${currentFixtureState}`,
  );

  const verifiedAnchor = parseReplayAnchor(replayAnchor);
  if (verifiedAnchor === null) {
    reasons.push("evidence_replay_anchor_missing");
    return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
  }

  if (!arrayClosed(inventory) || inventory.length !== expected.length) {
    reasons.push("evidence_inventory_not_closed");
    return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
  }

  const usedReceiptIds = new Set();

  for (let index = 0; index < expected.length; index += 1) {
    const definition = DEFINITION_BY_ID[expected[index].evidenceId];
    if (definition === undefined) {
      reasons.push("evidence_inventory_not_closed");
      return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
    }

    const entry = inventory[index];
    const malformed = closeEvidenceEntry(entry, definition);
    if (malformed === "evidence_entry_malformed") {
      reasons.push(`evidence_entry_malformed:${definition.evidenceId}`);
      return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
    }
    if (malformed === "evidence_measurement_class_malformed") {
      reasons.push(`evidence_measurement_class_malformed:${definition.evidenceId}`);
      return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
    }
    if (malformed === "evidence_identity_malformed") {
      reasons.push(`evidence_identity_malformed:${definition.evidenceId}`);
      return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
    }

    if (entry.state !== "recorded") {
      reasons.push(`evidence_missing:${definition.evidenceId}`);
      continue;
    }

    if (definition.authority === "human-only") {
      reasons.push(`human_evidence_requires_kernel_validation:${definition.evidenceId}`);
      continue;
    }

    if (!definition.requiresAttribution) {
      continue;
    }

    const attributionInput = attributionInputs[definition.evidenceId];
    if (!validateAttributionInput(attributionInput)) {
      reasons.push(`evidence_missing:${definition.evidenceId}`);
      continue;
    }
    if (entry.accountableSeat !== verifiedAnchor.accountableSeatId) {
      reasons.push(`evidence_attribution_failed:${definition.evidenceId}:forged_seat_label`);
      continue;
    }

    const outcome = evaluateSeatDispatchAttributionV1({
      ...verifiedAnchor,
      ...attributionInput,
      accountableSeatId: entry.accountableSeat,
      artifact: {
        evidenceId: definition.evidenceId,
        evidenceIdentity: entry.evidenceIdentity
      }
    });

    if (outcome.state !== "attributed") {
      reasons.push(`evidence_missing:${definition.evidenceId}`);
      if (outcome.reasonCodes.length > 0) {
        reasons.push(`evidence_attribution_failed:${definition.evidenceId}:${outcome.reasonCodes.join(",")}`);
      }
      continue;
    }
    if (usedReceiptIds.has(entry.dispatchReceipt.receiptId)) {
      reasons.push(`evidence_entry_malformed:${definition.evidenceId}`);
      continue;
    }
    if (!entry.dispatchReceipt.outputEvidenceRefs.includes(entry.evidenceRef)) {
      reasons.push(`evidence_entry_malformed:${definition.evidenceId}`);
      continue;
    }
    if (toJson(entry.dispatchReceipt) !== toJson(outcome.receipt)) {
      reasons.push(`evidence_entry_malformed:${definition.evidenceId}`);
      continue;
    }
    usedReceiptIds.add(entry.dispatchReceipt.receiptId);
  }

  return Object.freeze({
    state: "blocked",
    reasons: Object.freeze(reasons)
  });
}

export default {
  createEvidenceInventory,
  gradeEvidenceInventory
};
