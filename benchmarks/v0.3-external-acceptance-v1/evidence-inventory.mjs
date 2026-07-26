const DEFINITIONS = Object.freeze([
  Object.freeze({ evidenceId: "package.artifact.digest", authority: "measured", requirement: "required" }),
  Object.freeze({ evidenceId: "external.base.revision", authority: "measured", requirement: "required" }),
  Object.freeze({ evidenceId: "host.configuration", authority: "measured", requirement: "required" }),
  Object.freeze({ evidenceId: "blind.status", authority: "operator-recorded", requirement: "required" }),
  Object.freeze({ evidenceId: "installation.friction", authority: "operator-recorded", requirement: "required" }),
  Object.freeze({ evidenceId: "human.interventions", authority: "operator-recorded", requirement: "required" }),
  Object.freeze({ evidenceId: "coulson.authorization", authority: "human-only", requirement: "required" }),
  Object.freeze({ evidenceId: "fitz.technical-review", authority: "human-only", requirement: "required" }),
  Object.freeze({ evidenceId: "simmons.product-review", authority: "human-only", requirement: "conditional" }),
  Object.freeze({ evidenceId: "fury.revision-history", authority: "revision-bound-contract", requirement: "required" }),
  Object.freeze({ evidenceId: "stale.evidence", authority: "revision-bound-contract", requirement: "required" }),
  Object.freeze({ evidenceId: "review.publish.scope", authority: "permission-contract", requirement: "required" }),
  Object.freeze({ evidenceId: "host.adapter.failure", authority: "adapter-candidate", requirement: "required" }),
  Object.freeze({ evidenceId: "defect.failure-injection", authority: "fixture-grader", requirement: "required" }),
  Object.freeze({ evidenceId: "defect.rollback", authority: "fixture-grader", requirement: "required" })
]);
const ENTRY_FIELDS = Object.freeze([
  "evidenceId",
  "authority",
  "requirement",
  "state",
  "evidenceRef"
]);
const STATES = new Set(["missing", "waiting", "recorded"]);
const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const plain = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function createEvidenceInventory({ requireSimmons = false } = {}) {
  return Object.freeze(DEFINITIONS
    .filter((entry) => entry.evidenceId !== "simmons.product-review" || requireSimmons)
    .map((entry) => Object.freeze({
      ...entry,
      state: entry.evidenceId === "fitz.technical-review" || entry.evidenceId === "simmons.product-review"
        ? "waiting"
        : "missing",
      evidenceRef: null
    })));
}

export function gradeEvidenceInventory(inventory, { requireSimmons = false } = {}) {
  const expected = createEvidenceInventory({ requireSimmons });
  const reasons = [
    "dependency_contract_unavailable:#24",
    "dependency_contract_unavailable:#112",
    "dependency_contract_unavailable:#113"
  ];
  const arrayClosed = Array.isArray(inventory) &&
    Object.getPrototypeOf(inventory) === Array.prototype &&
    Reflect.ownKeys(inventory).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key)));
  if (!arrayClosed || inventory.length !== expected.length) {
    reasons.push("evidence_inventory_not_closed");
    return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
  }
  for (let index = 0; index < expected.length; index += 1) {
    const entry = inventory[index];
    const definition = expected[index];
    if (!plain(entry) ||
        JSON.stringify(Object.keys(entry)) !== JSON.stringify(ENTRY_FIELDS) ||
        entry.evidenceId !== definition.evidenceId ||
        entry.authority !== definition.authority ||
        entry.requirement !== definition.requirement ||
        !STATES.has(entry.state) ||
        (entry.state === "recorded"
          ? typeof entry.evidenceRef !== "string" || !EVIDENCE_REF.test(entry.evidenceRef)
          : entry.evidenceRef !== null)) {
      reasons.push(`evidence_inventory_malformed:${definition.evidenceId}`);
      return Object.freeze({ state: "blocked", reasons: Object.freeze(reasons) });
    }
    if (entry.state !== "recorded") {
      reasons.push(`evidence_missing:${entry.evidenceId}`);
    } else if (entry.authority === "human-only") {
      reasons.push(`human_evidence_requires_kernel_validation:${entry.evidenceId}`);
    }
  }
  return Object.freeze({
    state: "blocked",
    reasons: Object.freeze(reasons)
  });
}
