import {
  MISSION_DECISIONS,
  MISSION_STATES,
  RISK_FLAGS,
  TIMING_EVIDENCE_SOURCES,
  getMissionTransition,
} from "./mission-policy.mjs";

export const MISSION_SCHEMA_VERSION = 1;
export const MISSION_EVENT_TYPES = Object.freeze(["mission.created", "mission.decision"]);

const COMMON_EVENT_FIELDS = Object.freeze([
  "schemaVersion", "eventId", "missionId", "sequence", "type", "actor",
  "previousState", "resultingState", "timestamp",
]);
const CREATED_EVENT_FIELDS = new Set(COMMON_EVENT_FIELDS);
const DECISION_EVENT_FIELDS = new Set([...COMMON_EVENT_FIELDS, "decision"]);
const RESUME_EVENT_FIELDS = new Set([...DECISION_EVENT_FIELDS, "resumeState"]);
const RECORD_FIELDS = new Set([
  "schemaVersion", "missionId", "objective", "state", "riskFlags",
  "participants", "activatedModes", "createdAt", "updatedAt", "events",
]);
const TIMESTAMP_FIELDS = new Set(["value", "provenance"]);
const PARTICIPANT_FIELDS = new Set(["seatId"]);
const MODE_FIELDS = new Set(["modeId", "seatId", "activationSource"]);
const ISO_8601_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;

const valid = (value) => ({ state: "valid", value });
const invalid = (...errors) => ({ state: "invalid", errors: errors.flat() });

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function fieldErrors(value, allowed, label) {
  if (!isPlainObject(value)) return [`${label} must be a plain object.`];
  const errors = [];
  for (const field of allowed) {
    if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  }
  return errors;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoUtc(value) {
  if (typeof value !== "string") return false;
  const match = ISO_8601_UTC.exec(value);
  if (match === null) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth[month - 1]) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function timestampErrors(timestamp, label) {
  const errors = fieldErrors(timestamp, TIMESTAMP_FIELDS, label);
  if (errors.length > 0) return errors;
  if (!isIsoUtc(timestamp.value)) errors.push(`${label}.value must be an ISO 8601 UTC timestamp.`);
  if (!TIMING_EVIDENCE_SOURCES.includes(timestamp.provenance)) {
    errors.push(`${label}.provenance is unknown.`);
  }
  return errors;
}

export function validateMissionEvent(event) {
  if (!isPlainObject(event)) return invalid("Event must be a plain object.");
  if (!MISSION_EVENT_TYPES.includes(event.type)) return invalid("Event type is unknown.");

  const allowed = event.type === "mission.created"
    ? CREATED_EVENT_FIELDS
    : event.decision === "resume" ? RESUME_EVENT_FIELDS : DECISION_EVENT_FIELDS;
  const errors = fieldErrors(event, allowed, "Event");
  if (errors.length > 0) return invalid(errors);

  if (event.schemaVersion !== MISSION_SCHEMA_VERSION) errors.push("Event schemaVersion is unsupported.");
  for (const field of ["eventId", "missionId", "actor"]) {
    if (!isNonEmptyString(event[field])) errors.push(`Event ${field} must be a non-empty string.`);
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 0) {
    errors.push("Event sequence must be a non-negative integer.");
  }
  errors.push(...timestampErrors(event.timestamp, "Event timestamp"));

  if (event.type === "mission.created") {
    if (event.sequence !== 0) errors.push("mission.created sequence must be 0.");
    if (event.previousState !== null) errors.push("mission.created previousState must be null.");
    if (event.resultingState !== "proposed") errors.push("mission.created resultingState must be proposed.");
  } else {
    if (!MISSION_DECISIONS.includes(event.decision)) errors.push("Event decision is unknown.");
    if (!MISSION_STATES.includes(event.previousState)) errors.push("mission.decision previousState is unknown.");
    if (!MISSION_STATES.includes(event.resultingState)) errors.push("mission.decision resultingState is unknown.");
    if (event.decision === "resume") {
      if (event.resumeState !== "proposed" && event.resumeState !== "approved") {
        errors.push("resumeState must be proposed or approved.");
      }
    } else if (Object.hasOwn(event, "resumeState")) {
      errors.push("resumeState is allowed only for resume decisions.");
    }
  }
  return errors.length > 0 ? invalid(errors) : valid(event);
}

export function replayMissionEvents(missionId, events) {
  if (!isNonEmptyString(missionId)) return invalid("missionId must be a non-empty string.");
  if (!Array.isArray(events) || events.length === 0) return invalid("events must be a non-empty array.");

  let currentState = null;
  let previousTime = null;
  const eventIds = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const checked = validateMissionEvent(events[index]);
    if (checked.state === "invalid") {
      return invalid(checked.errors.map((error) => `events[${index}]: ${error}`));
    }
    const event = checked.value;
    if (event.sequence !== index) return invalid(`events[${index}] sequence must be ${index}.`);
    if (eventIds.has(event.eventId)) return invalid(`events[${index}] duplicates eventId.`);
    eventIds.add(event.eventId);
    if (event.missionId !== missionId) return invalid(`events[${index}] missionId does not match.`);
    const time = Date.parse(event.timestamp.value);
    if (previousTime !== null && time < previousTime) {
      return invalid(`events[${index}] timestamp moves backward.`);
    }
    previousTime = time;

    if (index === 0) {
      if (event.type !== "mission.created") return invalid("The first event must be mission.created.");
      currentState = "proposed";
      continue;
    }
    if (event.type !== "mission.decision") {
      return invalid("mission.created is allowed only as the first event.");
    }
    if (event.previousState !== currentState) {
      return invalid(`events[${index}] previousState breaks transition continuity.`);
    }
    const context = event.decision === "resume" ? { resumeState: event.resumeState } : {};
    const expected = getMissionTransition(currentState, event.decision, context);
    if (expected === null) return invalid(`events[${index}] records an impossible transition.`);
    if (event.resultingState !== expected) {
      return invalid(`events[${index}] resultingState disagrees with mission policy.`);
    }
    currentState = expected;
  }
  return valid({
    missionState: currentState,
    lastSequence: events.length - 1,
    lastTimestamp: events.at(-1).timestamp,
  });
}

function riskErrors(flags) {
  if (!isPlainObject(flags)) return ["riskFlags must be a plain object."];
  const errors = [];
  for (const flag of RISK_FLAGS) {
    if (!Object.hasOwn(flags, flag)) errors.push(`riskFlags is missing field: ${flag}.`);
    else if (typeof flags[flag] !== "boolean") errors.push(`riskFlags.${flag} must be boolean.`);
  }
  for (const flag of Object.keys(flags)) {
    if (!RISK_FLAGS.includes(flag)) errors.push(`riskFlags has unknown field: ${flag}.`);
  }
  return errors;
}

function referenceErrors(values, fields, label) {
  if (!Array.isArray(values)) return [`${label} must be an array.`];
  const errors = [];
  for (let index = 0; index < values.length; index += 1) {
    const entryLabel = `${label}[${index}]`;
    const structural = fieldErrors(values[index], fields, entryLabel);
    errors.push(...structural);
    if (structural.length === 0) {
      for (const field of fields) {
        if (!isNonEmptyString(values[index][field])) {
          errors.push(`${entryLabel}.${field} must be a non-empty string.`);
        }
      }
    }
  }
  return errors;
}

export function validateMissionRecord(record) {
  const errors = fieldErrors(record, RECORD_FIELDS, "Mission record");
  if (errors.length > 0) return invalid(errors);
  if (record.schemaVersion !== MISSION_SCHEMA_VERSION) errors.push("Mission record schemaVersion is unsupported.");
  if (!isNonEmptyString(record.missionId)) errors.push("missionId must be a non-empty string.");
  if (!isNonEmptyString(record.objective)) errors.push("objective must be a non-empty string.");
  if (!MISSION_STATES.includes(record.state)) errors.push("state is unknown.");
  errors.push(...riskErrors(record.riskFlags));
  errors.push(...referenceErrors(record.participants, PARTICIPANT_FIELDS, "participants"));
  errors.push(...referenceErrors(record.activatedModes, MODE_FIELDS, "activatedModes"));
  errors.push(...timestampErrors(record.createdAt, "createdAt"));
  errors.push(...timestampErrors(record.updatedAt, "updatedAt"));
  if (!Array.isArray(record.events)) errors.push("events must be an array.");
  if (errors.length > 0) return invalid(errors);

  const created = Date.parse(record.createdAt.value);
  const updated = Date.parse(record.updatedAt.value);
  if (updated < created) errors.push("updatedAt must not precede createdAt.");
  const replay = replayMissionEvents(record.missionId, record.events);
  if (replay.state === "invalid") errors.push(...replay.errors);
  else {
    const firstEvent = Date.parse(record.events[0].timestamp.value);
    const lastEvent = Date.parse(replay.value.lastTimestamp.value);
    if (firstEvent < created) errors.push("Event history must not precede createdAt.");
    if (lastEvent > updated) errors.push("Event history must not follow updatedAt.");
    if (record.state !== replay.value.missionState) {
      errors.push("Declared mission state does not match replayed state.");
    }
  }
  return errors.length > 0 ? invalid(errors) : valid(record);
}
