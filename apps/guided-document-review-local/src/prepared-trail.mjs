export function decodePreparedTrailResponse(value, expectedSlug) {
  if (!isRecord(value) || value.slug !== expectedSlug ||
      typeof value.title !== "string" || typeof value.reviewerName !== "string" ||
      typeof value.documentText !== "string" || !("checkpoints" in value)) {
    throw new TypeError("Prepared trail response is malformed.");
  }
  if (value.schemaVersion === 1 && !("reviewBinding" in value)) return value;
  if (value.schemaVersion === 2 && isPreparedReviewBinding(value.reviewBinding)) return value;
  throw new TypeError("Prepared trail response is malformed.");
}

export function isPreparedReviewBinding(value) {
  return isRecord(value) && typeof value.packetId === "string" &&
    /^sha256:[0-9a-f]{64}$/u.test(value.packetDigest ?? "") &&
    typeof value.repository === "string" && typeof value.pullRequestNumber === "number" &&
    Number.isSafeInteger(value.pullRequestNumber) && value.pullRequestNumber > 0 &&
    /^[0-9a-f]{40}$/u.test(value.headRevision ?? "");
}

export function reviewerIdentityFromOperatorEntry(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name
    ? { kind: "self_asserted", name }
    : { kind: "unattributed", name: null };
}

export function exactDraftForReviewer(session, reviewer) {
  return isRecord(session) && reviewerIdentitiesEqual(session.reviewer, reviewer) ? session : null;
}

export function carryForwardAnswersForReviewer(candidate, sourceDigest, reviewer) {
  return isRecord(candidate) && candidate.sourceDigest === sourceDigest &&
    isRecord(candidate.answers) && reviewerIdentitiesEqual(candidate.reviewer, reviewer)
    ? candidate.answers
    : null;
}

export function reviewerIdentitiesEqual(left, right) {
  return isRecord(left) && isRecord(right) && left.kind === right.kind && left.name === right.name &&
    ((left.kind === "unattributed" && left.name === null) ||
      (left.kind === "self_asserted" && typeof left.name === "string" && left.name.length > 0));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
