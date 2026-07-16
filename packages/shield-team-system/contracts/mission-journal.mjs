import { TIMING_EVIDENCE_SOURCES } from "./mission-policy.mjs";
import { replayMissionEvents, validateMissionEvent } from "./mission-record.mjs";

export const JOURNAL_SCHEMA_VERSION = 1;
export const JOURNAL_ENTRY_TYPES = Object.freeze([
  "governance.event", "execution.transition", "review.recorded", "effect.completed",
]);
export const EXECUTION_STATUSES = Object.freeze([
  "not-started", "running", "blocked", "failed", "completed",
]);

const ENTRY_FIELDS = new Set([
  "schemaVersion", "entryId", "missionId", "sequence", "type", "timestamp", "payload",
]);
const TIMESTAMP_FIELDS = new Set(["value", "provenance"]);
const PAYLOAD_FIELDS = Object.freeze({
  "governance.event": new Set(["event"]),
  "execution.transition": new Set(["from", "to", "reason", "evidenceRef"]),
  "review.recorded": new Set(["reviewerSeatId", "verdict", "sourceRef", "summary"]),
  "effect.completed": new Set(["effectKey", "resultSummary"]),
});
const REVIEW_VERDICTS = new Set(["approved", "changes_requested", "commented"]);
const EXECUTION_TRANSITIONS = Object.freeze({
  "not-started": new Set(["running"]), running: new Set(["blocked", "failed", "completed"]),
  blocked: new Set(["running", "failed"]), failed: new Set(["running"]), completed: new Set(),
});
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const valid = (value) => ({ state: "valid", value });
const invalid = (...errors) => ({ state: "invalid", errors: errors.flat() });

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function fieldErrors(value, fields, label) {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const errors = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!fields.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}
function isIsoUtc(value) {
  if (typeof value !== "string") return false;
  const match = ISO_UTC.exec(value);
  if (match === null) return false;
  const [, y, m, d, h, min, s] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const hour = Number(h), minute = Number(min), second = Number(s);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day && date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}
function timestampErrors(timestamp, label) {
  const errors = fieldErrors(timestamp, TIMESTAMP_FIELDS, label);
  if (errors.length > 0) return errors;
  if (!isIsoUtc(timestamp.value)) errors.push(`${label}.value must be an ISO 8601 UTC timestamp.`);
  if (!TIMING_EVIDENCE_SOURCES.includes(timestamp.provenance)) errors.push(`${label}.provenance is unknown.`);
  return errors;
}
function sameTimestamp(left, right) {
  return left.value === right.value && left.provenance === right.provenance;
}

export function validateJournalEntry(entry) {
  const errors = fieldErrors(entry, ENTRY_FIELDS, "Journal entry");
  if (errors.length > 0) return invalid(errors);
  if (entry.schemaVersion !== JOURNAL_SCHEMA_VERSION) errors.push("Journal entry schemaVersion is unsupported.");
  for (const field of ["entryId", "missionId"]) {
    if (!isNonEmptyString(entry[field])) errors.push(`Journal entry ${field} must be a non-empty string.`);
  }
  if (!Number.isInteger(entry.sequence) || entry.sequence < 0) errors.push("Journal entry sequence must be a non-negative integer.");
  if (!JOURNAL_ENTRY_TYPES.includes(entry.type)) errors.push("Journal entry type is unknown.");
  const entryTimestampErrors = timestampErrors(entry.timestamp, "Journal entry timestamp");
  errors.push(...entryTimestampErrors);
  if (!JOURNAL_ENTRY_TYPES.includes(entry.type)) return invalid(errors);
  if (entryTimestampErrors.length > 0) return invalid(errors);
  const payloadErrors = fieldErrors(entry.payload, PAYLOAD_FIELDS[entry.type], `${entry.type} payload`);
  errors.push(...payloadErrors);
  if (payloadErrors.length > 0) return invalid(errors);

  if (entry.type === "governance.event") {
    const checked = validateMissionEvent(entry.payload.event);
    if (checked.state === "invalid") errors.push(...checked.errors.map((error) => `Governance event: ${error}`));
    else {
      if (entry.payload.event.missionId !== entry.missionId) errors.push("Governance event missionId does not match.");
      if (!sameTimestamp(entry.timestamp, entry.payload.event.timestamp)) errors.push("Governance event timestamp does not match its journal envelope.");
    }
  } else if (entry.type === "execution.transition") {
    for (const field of PAYLOAD_FIELDS[entry.type]) if (!isNonEmptyString(entry.payload[field])) errors.push(`${entry.type} payload.${field} must be non-empty.`);
    if (!EXECUTION_STATUSES.includes(entry.payload.from) || !EXECUTION_STATUSES.includes(entry.payload.to)) {
      errors.push("Execution transition contains an unknown status.");
    } else if (!EXECUTION_TRANSITIONS[entry.payload.from].has(entry.payload.to)) {
      errors.push(`Execution transition ${entry.payload.from} -> ${entry.payload.to} is not allowed.`);
    }
  } else if (entry.type === "review.recorded") {
    for (const field of PAYLOAD_FIELDS[entry.type]) if (!isNonEmptyString(entry.payload[field])) errors.push(`${entry.type} payload.${field} must be non-empty.`);
    if (!REVIEW_VERDICTS.has(entry.payload.verdict)) errors.push("Review verdict is unknown.");
  } else {
    for (const field of PAYLOAD_FIELDS[entry.type]) if (!isNonEmptyString(entry.payload[field])) errors.push(`${entry.type} payload.${field} must be non-empty.`);
  }
  return errors.length > 0 ? invalid(errors) : valid(entry);
}

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function replayMissionJournal(missionId, entries) {
  if (!isNonEmptyString(missionId)) return invalid("missionId must be a non-empty string.");
  if (!Array.isArray(entries)) return invalid("entries must be an array.");
  if (entries.length === 0) return valid({ missionState: null, executionStatus: "not-started", reviewEvidence: [], completedEffects: [], lastSequence: -1, lastTimestamp: null });
  const entryIds = new Set(), effectKeys = new Set(), governanceEvents = [], reviews = [], effects = [];
  let missionState = null, executionStatus = "not-started", previousTime = null;
  for (let index = 0; index < entries.length; index += 1) {
    const checked = validateJournalEntry(entries[index]);
    if (checked.state === "invalid") return invalid(checked.errors.map((error) => `entries[${index}]: ${error}`));
    const entry = checked.value;
    if (entry.sequence !== index) return invalid(`entries[${index}] sequence must be ${index}.`);
    if (entry.missionId !== missionId) return invalid(`entries[${index}] missionId does not match.`);
    if (entryIds.has(entry.entryId)) return invalid(`entries[${index}] duplicates entryId.`);
    entryIds.add(entry.entryId);
    const time = Date.parse(entry.timestamp.value);
    if (previousTime !== null && time < previousTime) return invalid(`entries[${index}] timestamp moves backward.`);
    previousTime = time;
    if (entry.type === "governance.event") {
      governanceEvents.push(entry.payload.event);
      const governance = replayMissionEvents(missionId, governanceEvents);
      if (governance.state === "invalid") return invalid(governance.errors.map((error) => `entries[${index}]: ${error}`));
      missionState = governance.value.missionState;
      if (missionState === "paused" && executionStatus === "running") executionStatus = "blocked";
      if ((missionState === "rejected" || missionState === "cancelled") && (executionStatus === "running" || executionStatus === "blocked")) executionStatus = "failed";
      continue;
    }
    if (missionState === null) return invalid(`entries[${index}] requires governance creation first.`);
    if (entry.type === "execution.transition") {
      if (entry.payload.from !== executionStatus) return invalid(`entries[${index}] breaks execution continuity.`);
      if ((entry.payload.to === "running" || entry.payload.to === "completed") && missionState !== "approved") return invalid(`entries[${index}] requires approved governance.`);
      if ((missionState === "rejected" || missionState === "cancelled") && entry.payload.to !== "failed") return invalid(`entries[${index}] is forbidden after terminal governance.`);
      executionStatus = entry.payload.to;
    } else if (entry.type === "effect.completed") {
      if (missionState !== "approved" || executionStatus !== "running") return invalid(`entries[${index}] effect completion requires approved running execution.`);
      if (effectKeys.has(entry.payload.effectKey)) return invalid(`entries[${index}] duplicates effectKey.`);
      effectKeys.add(entry.payload.effectKey);
      effects.push({ entryId: entry.entryId, ...entry.payload, timestamp: entry.timestamp });
    } else reviews.push({ entryId: entry.entryId, ...entry.payload, timestamp: entry.timestamp });
  }
  if (missionState === null) return invalid("Journal must contain governance creation evidence.");
  effects.sort((left, right) => compareText(left.effectKey, right.effectKey));
  return valid({ missionState, executionStatus, reviewEvidence: reviews, completedEffects: effects, lastSequence: entries.length - 1, lastTimestamp: entries.at(-1).timestamp });
}

export function serializeJournalEntry(entry) {
  const checked = validateJournalEntry(entry);
  return checked.state === "invalid" ? checked : valid(`${JSON.stringify(entry)}\n`);
}
export function parseJournalJsonl(missionId, text) {
  if (typeof text !== "string") return invalid("Journal content must be a string.");
  if (text === "") return valid({ entries: [], projection: replayMissionJournal(missionId, []).value });
  if (!text.endsWith("\n")) return { state: "invalid", code: "recovery_required", errors: ["Journal has an incomplete final line."] };
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) return invalid("Journal contains an empty line.");
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    try {
      const entry = JSON.parse(lines[index]);
      if (!isPlainObject(entry)) return invalid(`Journal line ${index + 1} must contain an object.`);
      entries.push(entry);
    } catch {
      return { state: "invalid", code: "recovery_required", errors: [`Journal line ${index + 1} is malformed JSON.`] };
    }
  }
  const replay = replayMissionJournal(missionId, entries);
  return replay.state === "invalid" ? replay : valid({ entries, projection: replay.value });
}
