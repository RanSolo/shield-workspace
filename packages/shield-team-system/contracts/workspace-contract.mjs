import { RISK_FLAGS, classifyMissionRisk } from "./mission-policy.mjs";

const REQUIRED_FIELDS = Object.freeze([
  "repositoryOwner",
  "repositoryName",
  "baseBranch",
  "branchSlug",
  "missionBriefPath",
  "prTitle",
  "missionObjective",
  "coulsonApprovalSource",
  "coulsonApprovedAt",
  "riskFlags",
]);

const OPTIONAL_FIELDS = Object.freeze([
  "prBody",
  "participants",
  "activatedModes",
  "pendingDecisions",
  "validationStatus",
]);

const KNOWN_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
const REPOSITORY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const GIT_REF = /^(?![./])(?!.*(?:\.\.|\/\/|@\{|\\|\s|[~^:?*\[]))(?!.*[/.]$)[A-Za-z0-9._/-]{1,200}$/;
const RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/;
const ISO_8601_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    ISO_8601_Z.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizedString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function validateStringArray(input, field, errors) {
  if (!Object.hasOwn(input, field)) return [];
  const value = input[field];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of non-empty strings.`);
    return [];
  }
  const normalized = value.map(normalizedString);
  if (normalized.some((item) => typeof item !== "string" || item.length === 0)) {
    errors.push(`${field} must contain only non-empty strings.`);
    return [];
  }
  return normalized;
}

export function classifyWorkspaceRisk(flags) {
  return classifyMissionRisk(flags);
}

/**
 * A narrow guard against obvious credentials and private-reasoning markers.
 * This is not a complete secret scanner; callers still own repository secret
 * scanning and review.
 */
export function isSafeGitHubContent(texts) {
  if (!Array.isArray(texts)) {
    return { safe: false, reason: "texts_must_be_array" };
  }

  const credentialPatterns = [
    /(?:^|\n)\s*(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S{8,}/im,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  ];
  const privateReasoningPatterns = [
    /model reasoning/i,
    /raw private context/i,
    /\[REDACTED[^\]]*\]/i,
  ];

  for (const value of texts) {
    if (typeof value !== "string") {
      return { safe: false, reason: "content_must_be_string" };
    }
    if (credentialPatterns.some((pattern) => pattern.test(value))) {
      return { safe: false, reason: "likely_credential_detected" };
    }
    if (privateReasoningPatterns.some((pattern) => pattern.test(value))) {
      return { safe: false, reason: "private_reasoning_marker_detected" };
    }
  }
  return { safe: true };
}

export function validateMissionWorkspaceInput(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { state: "invalid", errors: ["Input must be a plain object."] };
  }

  for (const field of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(field)) errors.push(`Unknown field: ${field}.`);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(input, field)) errors.push(`Missing required field: ${field}.`);
  }

  const strings = {};
  for (const field of REQUIRED_FIELDS.filter((name) => name !== "riskFlags")) {
    const value = normalizedString(input[field]);
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${field} must be a non-empty string.`);
    } else {
      strings[field] = value;
    }
  }
  for (const field of ["prBody", "validationStatus"]) {
    if (!Object.hasOwn(input, field)) continue;
    const value = normalizedString(input[field]);
    if (typeof value !== "string") errors.push(`${field} must be a string.`);
    else strings[field] = value;
  }

  if (strings.repositoryOwner && !REPOSITORY_NAME.test(strings.repositoryOwner)) {
    errors.push("repositoryOwner has an invalid GitHub name.");
  }
  if (strings.repositoryName && !REPOSITORY_NAME.test(strings.repositoryName)) {
    errors.push("repositoryName has an invalid GitHub name.");
  }
  for (const field of ["baseBranch", "branchSlug"]) {
    if (strings[field] && !GIT_REF.test(strings[field])) errors.push(`${field} is not a safe Git ref.`);
  }
  if (strings.missionBriefPath && !RELATIVE_PATH.test(strings.missionBriefPath)) {
    errors.push("missionBriefPath must be a safe repository-relative path.");
  }
  if (strings.prTitle && strings.prTitle.length > 200) {
    errors.push("prTitle must be 200 characters or fewer.");
  }
  if (strings.coulsonApprovedAt && !isIsoTimestamp(strings.coulsonApprovedAt)) {
    errors.push("coulsonApprovedAt must be an ISO 8601 UTC timestamp.");
  }

  const participants = validateStringArray(input, "participants", errors);
  const activatedModes = validateStringArray(input, "activatedModes", errors);
  const pendingDecisions = validateStringArray(input, "pendingDecisions", errors);
  const risk = classifyWorkspaceRisk(input.riskFlags);
  if (!isPlainObject(input.riskFlags) || risk.reasons.some((reason) => /Unknown|Missing|required|boolean|plain object/.test(reason))) {
    errors.push(...risk.reasons.map((reason) => `riskFlags: ${reason}`));
  }

  const githubContent = isSafeGitHubContent([
    strings.prTitle ?? "",
    strings.missionObjective ?? "",
    strings.prBody ?? "",
    strings.validationStatus ?? "",
    ...participants,
    ...activatedModes,
    ...pendingDecisions,
  ]);
  if (!githubContent.safe) errors.push(`Unsafe GitHub content: ${githubContent.reason}.`);

  if (errors.length > 0) return { state: "invalid", errors };

  return {
    state: "valid",
    plan: Object.freeze({
      ...strings,
      riskFlags: Object.freeze({ ...input.riskFlags }),
      participants: Object.freeze(participants),
      activatedModes: Object.freeze(activatedModes),
      pendingDecisions: Object.freeze(pendingDecisions),
      risk,
    }),
  };
}

export function generatePRBody(plan, nowISO) {
  if (!isPlainObject(plan) || !isIsoTimestamp(nowISO)) {
    throw new Error("generatePRBody requires a plain plan and caller-supplied ISO 8601 UTC timestamp.");
  }

  const list = (values, empty) =>
    values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : `- ${empty}`;

  return [
    "## Mission Workspace",
    "",
    `**Objective:** ${plan.missionObjective}`,
    `**Approval:** ${plan.coulsonApprovalSource} at ${plan.coulsonApprovedAt}`,
    `**Mission Brief:** \`${plan.missionBriefPath}\``,
    "",
    "### Participants",
    "",
    list(plan.participants, "None recorded"),
    "",
    "### Activated modes",
    "",
    list(plan.activatedModes, "None recorded"),
    "",
    "### Current validation",
    "",
    plan.validationStatus || "Not yet run.",
    "",
    "### Pending decisions",
    "",
    list(plan.pendingDecisions, "None"),
    "",
    "### Team handoff",
    "",
    `Workspace record generated at ${nowISO}.`,
    "",
    plan.prBody || "",
  ].join("\n").trimEnd();
}
