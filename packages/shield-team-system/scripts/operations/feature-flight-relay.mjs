import { createHash } from "node:crypto";
import { isAbsolute, normalize, resolve } from "node:path";
import { isProxy } from "node:util/types";

import { replaySeatDispatchReceiptsV1 } from "../../dist/seat-dispatch-receipt-v1.mjs";
import { readSeatDispatchReceiptLedgerV1 } from "../../dist/seat-dispatch-store.mjs";

export const FEATURE_FLIGHT_RELAY_SCHEMA_VERSION = 1;
export const FEATURE_FLIGHT_RELAY_CONTRACT_VERSION = "shield.feature-flight-relay.pending.v1";
export const FEATURE_FLIGHT_RELAY_NOTICE = "Advisory wake-up reference only. This relay grants no authority, permission, review, acceptance, delivery, or execution.";
export const FEATURE_FLIGHT_RELAY_INSPECTION_NOTICE = "Read-only advisory projection. Await a separately authorized delivery binding.";
export const FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION = "observe_terminal_dispatch";
export const FEATURE_FLIGHT_RELAY_NEXT_ACTION = "await_delivery_binding";
export const FEATURE_FLIGHT_RELAY_MAX_BYTES = 4096;
export const FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES = 4096;
export const FEATURE_FLIGHT_RELAY_TERMINAL_KINDS = Object.freeze([
  "dispatch.completed",
  "dispatch.failed",
  "dispatch.cancelled",
]);

const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const RELAY_ID = /^relay:[A-Za-z0-9_-]{43}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const TERMINAL_KINDS = new Set(FEATURE_FLIGHT_RELAY_TERMINAL_KINDS);
const ACCOUNTABLE_SEATS = new Set(["hill", "daisy", "fury", "may", "mack"]);
const SOURCE_FIELDS = [
  "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision", "parentSessionId", "childTaskId",
  "childSessionId", "sourceAccountableSeatId", "repositoryId", "repositoryWorkspaceId", "repositoryRevision",
  "subjectId", "subjectRevision", "artifactId", "artifactRevision",
];
const TERMINAL_FIELDS = ["kind", "entryDigest", "logSequence", "lifecycleSequence"];
const RECIPIENT_FIELDS = ["seatId", "laneId", "controllerIdentity"];
const RELAY_INPUT_FIELDS = ["source", "terminal", "recipient", "requestedObservation"];
const RELAY_FIELDS = [
  "schemaVersion", "artifactType", "contractVersion", "authority", "notice", "kind", ...RELAY_INPUT_FIELDS,
  "relayId", "relayDigest",
];
const ENTRY_FIELDS = [
  "schemaVersion", "artifactType", "contractVersion", "authority", "notice", "kind", "entryId", "entryDigest",
  "logSequence", "lifecycleSequence", "relayId", "relayDigest", "previousLogDigest", "previousLifecycleDigest", "relay",
];
const CREATE_FROM_DISPATCH_FIELDS = ["repositoryRoot", ...SOURCE_FIELDS, ...RECIPIENT_FIELDS.map((field) => `recipient${field[0].toUpperCase()}${field.slice(1)}`), "requestedObservation"];

const fail = (code, message) => Object.freeze({ state: "invalid", code, reasonCodes: Object.freeze([message]) });

function safeIsProxy(value) {
  try { return isProxy(value); } catch { return true; }
}

function snapshot(value, label = "value", depth = 0, ancestors = new WeakSet()) {
  if (depth > 24) throw new Error(`${label} exceeds the closed-data depth limit.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must use safe integers.`);
    return value;
  }
  if (typeof value !== "object" || safeIsProxy(value)) throw new Error(`${label} contains unsupported or proxy data.`);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) || ancestors.has(value)) {
    throw new Error(`${label} must be acyclic closed ordinary data.`);
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const clone = array ? [] : {};
  const allowed = array ? new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]) : null;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || (allowed !== null && !allowed.has(key))) throw new Error(`${label} has an unsupported field.`);
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value === undefined) {
      throw new Error(`${label}.${key} must be an own enumerable data field.`);
    }
    clone[key] = snapshot(descriptor.value, `${label}.${key}`, depth + 1, ancestors);
  }
  if (array && clone.length !== value.length) throw new Error(`${label} must be dense.`);
  ancestors.delete(value);
  return clone;
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value !== null && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function exact(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field)) ||
      Object.keys(value).some((field) => !fields.includes(field))) {
    throw new Error(`${label} fields are not closed.`);
  }
}

function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} is malformed.`);
}

function revision(value, label) {
  if (typeof value !== "string" || !REVISION.test(value)) throw new Error(`${label} is malformed.`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digestBytes(domain, bytes) {
  return `sha256:${createHash("sha256").update(domain, "utf8").update("\0").update(bytes).digest("base64url")}`;
}

export function canonicalFeatureFlightRelayValueV1(input) {
  return freeze(canonical(snapshot(input, "canonical relay value")));
}

export function canonicalFeatureFlightRelayBytesV1(input) {
  return Buffer.from(JSON.stringify(canonicalFeatureFlightRelayValueV1(input)), "utf8");
}

export function featureFlightRelayDigestV1(input, domain = "shield.feature-flight-relay.value.v1") {
  if (typeof domain !== "string" || domain.length === 0 || Buffer.byteLength(domain, "utf8") > 128) throw new Error("Relay digest domain is malformed.");
  return digestBytes(domain, canonicalFeatureFlightRelayBytesV1(input));
}

function validateSource(value, label = "relay source") {
  exact(value, SOURCE_FIELDS, label);
  for (const field of SOURCE_FIELDS.filter((field) => !field.endsWith("Revision"))) identifier(value[field], `${label}.${field}`);
  for (const field of SOURCE_FIELDS.filter((field) => field.endsWith("Revision"))) revision(value[field], `${label}.${field}`);
  if (!ACCOUNTABLE_SEATS.has(value.sourceAccountableSeatId)) throw new Error(`${label}.sourceAccountableSeatId is not a canonical accountable seat.`);
}

function validateTerminal(value, label = "relay terminal") {
  exact(value, TERMINAL_FIELDS, label);
  if (!TERMINAL_KINDS.has(value.kind)) throw new Error(`${label}.kind is not a terminal dispatch kind.`);
  if (!DIGEST.test(value.entryDigest ?? "")) throw new Error(`${label}.entryDigest is malformed.`);
  for (const field of ["logSequence", "lifecycleSequence"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) throw new Error(`${label}.${field} is malformed.`);
  }
}

function validateRecipient(value, label = "relay recipient") {
  exact(value, RECIPIENT_FIELDS, label);
  identifier(value.seatId, `${label}.seatId`);
  identifier(value.laneId, `${label}.laneId`);
  identifier(value.controllerIdentity, `${label}.controllerIdentity`);
  if (value.seatId !== "hill") throw new Error(`${label}.seatId must be canonical hill.`);
}

function validateRequestedObservation(value) {
  if (value !== FEATURE_FLIGHT_RELAY_REQUESTED_OBSERVATION) throw new Error("Relay requestedObservation is unsupported.");
}

function relayIdentityTuple(value) {
  const source = value.source;
  const terminal = value.terminal;
  const recipient = value.recipient;
  return [
    source.receiptId, source.dispatchId, source.parentMissionId, source.parentMissionRevision, source.parentSessionId,
    source.childTaskId, source.childSessionId, source.sourceAccountableSeatId, source.repositoryId,
    source.repositoryWorkspaceId, source.repositoryRevision, source.subjectId, source.subjectRevision, source.artifactId,
    source.artifactRevision, terminal.kind, terminal.entryDigest, terminal.logSequence, terminal.lifecycleSequence,
    recipient.seatId, recipient.laneId, recipient.controllerIdentity, value.requestedObservation,
  ];
}

function relayIdentity(value) {
  return digestBytes("shield.feature-flight-relay.pending.v1", Buffer.from(JSON.stringify(relayIdentityTuple(value)), "utf8"));
}

function validateRelayObject(input) {
  const value = snapshot(input, "feature-flight relay");
  exact(value, RELAY_FIELDS, "feature-flight relay");
  if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-relay" ||
      value.contractVersion !== FEATURE_FLIGHT_RELAY_CONTRACT_VERSION || value.authority !== "none" ||
      value.notice !== FEATURE_FLIGHT_RELAY_NOTICE || value.kind !== "relay.pending") {
    throw new Error("Feature Flight relay contract identity is invalid.");
  }
  validateSource(value.source);
  validateTerminal(value.terminal);
  validateRecipient(value.recipient);
  validateRequestedObservation(value.requestedObservation);
  const expected = relayIdentity(value);
  if (value.relayDigest !== expected || value.relayId !== `relay:${expected.slice(7)}` || !RELAY_ID.test(value.relayId)) {
    throw new Error("Feature Flight relay canonical identity is invalid.");
  }
  if (canonicalFeatureFlightRelayBytesV1(value).length > FEATURE_FLIGHT_RELAY_MAX_BYTES) throw new Error("Feature Flight relay exceeds the compact byte limit.");
  return freeze(value);
}

export function validateFeatureFlightRelayV1(input) {
  try { return freeze({ state: "valid", value: validateRelayObject(input), reasonCodes: [] }); }
  catch (error) { return fail("relay_invalid", error instanceof Error ? error.message : "Relay validation failed."); }
}

export function createFeatureFlightRelayV1(input) {
  const value = snapshot(input, "feature-flight relay input");
  exact(value, RELAY_INPUT_FIELDS, "feature-flight relay input");
  validateSource(value.source);
  validateTerminal(value.terminal);
  validateRecipient(value.recipient);
  validateRequestedObservation(value.requestedObservation);
  const body = {
    schemaVersion: FEATURE_FLIGHT_RELAY_SCHEMA_VERSION,
    artifactType: "feature-flight-relay",
    contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
    authority: "none",
    notice: FEATURE_FLIGHT_RELAY_NOTICE,
    kind: "relay.pending",
    ...value,
  };
  const relayDigest = relayIdentity(body);
  return validateRelayObject({ ...body, relayId: `relay:${relayDigest.slice(7)}`, relayDigest });
}

function flattenedCreationInput(input) {
  const value = snapshot(input, "terminal relay creation input");
  exact(value, CREATE_FROM_DISPATCH_FIELDS, "terminal relay creation input");
  if (typeof value.repositoryRoot !== "string" || !isAbsolute(value.repositoryRoot) ||
      normalize(value.repositoryRoot) !== value.repositoryRoot || resolve(value.repositoryRoot) !== value.repositoryRoot) {
    throw new Error("repositoryRoot must be a canonical absolute path.");
  }
  const source = Object.fromEntries(SOURCE_FIELDS.map((field) => [field, value[field]]));
  const recipient = {
    seatId: value.recipientSeatId,
    laneId: value.recipientLaneId,
    controllerIdentity: value.recipientControllerIdentity,
  };
  validateSource(source, "expected terminal source");
  validateRecipient(recipient, "expected relay recipient");
  validateRequestedObservation(value.requestedObservation);
  return { value, source, recipient };
}

function sourceMatches(projection, source) {
  return projection.receiptId === source.receiptId && projection.dispatchId === source.dispatchId &&
    projection.parentMissionId === source.parentMissionId && projection.parentMissionRevision === source.parentMissionRevision &&
    projection.parentSessionId === source.parentSessionId && projection.childTaskId === source.childTaskId &&
    projection.childSessionId === source.childSessionId && projection.accountableSeatId === source.sourceAccountableSeatId &&
    projection.repositoryId === source.repositoryId && projection.repositoryWorkspaceId === source.repositoryWorkspaceId &&
    projection.repositoryRevision === source.repositoryRevision && projection.subjectId === source.subjectId &&
    projection.subjectRevision === source.subjectRevision && projection.artifactId === source.artifactId &&
    projection.artifactRevision === source.artifactRevision;
}

export async function createFeatureFlightRelayFromSeatDispatchV1(input, injected = {}) {
  let prepared;
  try { prepared = flattenedCreationInput(input); }
  catch (error) { return fail("malformed_input", error instanceof Error ? error.message : "Terminal relay input is malformed."); }
  const readLedger = injected.readSeatDispatchReceiptLedgerV1 ?? readSeatDispatchReceiptLedgerV1;
  const replayReceipts = injected.replaySeatDispatchReceiptsV1 ?? replaySeatDispatchReceiptsV1;
  if (typeof readLedger !== "function" || typeof replayReceipts !== "function") return fail("malformed_input", "Relay dependencies are malformed.");
  let ledger;
  try {
    ledger = await readLedger({
      repositoryRoot: prepared.value.repositoryRoot,
      repositoryId: prepared.source.repositoryId,
      repositoryWorkspaceId: prepared.source.repositoryWorkspaceId,
    });
  } catch (error) {
    return fail("source_ledger_unavailable", error instanceof Error ? error.message : "Dispatch receipt ledger read failed.");
  }
  if (ledger?.state !== "valid") return fail("source_ledger_invalid", `Dispatch receipt ledger read failed: ${ledger?.code ?? "unknown"}.`);
  let replay;
  try { replay = replayReceipts(ledger.value.entries); }
  catch (error) { return fail("source_replay_invalid", error instanceof Error ? error.message : "Dispatch receipt replay failed."); }
  if (replay?.state !== "valid") return fail("source_replay_invalid", `Dispatch receipt replay failed: ${replay?.code ?? "unknown"}.`);
  const matches = replay.projections.filter((projection) => sourceMatches(projection, prepared.source));
  if (matches.length !== 1) return fail("terminal_source_ambiguous", `Expected exactly one terminal dispatch projection; found ${matches.length}.`);
  const projection = matches[0];
  if (!TERMINAL_KINDS.has(`dispatch.${projection.state}`)) return fail("terminal_source_required", "Dispatch projection is not completed, failed, or cancelled.");
  const entries = replay.entries.filter((entry) => entry.entryDigest === projection.lastEntryDigest);
  if (entries.length !== 1) return fail("terminal_source_ambiguous", `Expected exactly one terminal entry digest match; found ${entries.length}.`);
  const terminal = entries[0];
  if (!TERMINAL_KINDS.has(terminal.kind) || terminal.kind !== `dispatch.${projection.state}` ||
      terminal.receiptId !== projection.receiptId || terminal.dispatchId !== projection.dispatchId ||
      terminal.logSequence !== projection.logSequence || terminal.lifecycleSequence !== projection.lifecycleSequence) {
    return fail("terminal_source_mismatch", "Terminal entry does not exactly bind the selected replay projection.");
  }
  try {
    const relay = createFeatureFlightRelayV1({
      source: prepared.source,
      terminal: {
        kind: terminal.kind,
        entryDigest: terminal.entryDigest,
        logSequence: terminal.logSequence,
        lifecycleSequence: terminal.lifecycleSequence,
      },
      recipient: prepared.recipient,
      requestedObservation: prepared.value.requestedObservation,
    });
    return freeze({ state: "valid", value: relay, reasonCodes: [] });
  } catch (error) {
    return fail("relay_invalid", error instanceof Error ? error.message : "Relay creation failed.");
  }
}

function entryBody(value) {
  return Object.fromEntries(ENTRY_FIELDS.filter((field) => !["entryId", "entryDigest"].includes(field)).map((field) => [field, value[field]]));
}

function validateEntryObject(input) {
  const value = snapshot(input, "relay pending entry");
  exact(value, ENTRY_FIELDS, "relay pending entry");
  const relay = validateRelayObject(value.relay);
  if (value.schemaVersion !== 1 || value.artifactType !== "feature-flight-relay-entry" ||
      value.contractVersion !== FEATURE_FLIGHT_RELAY_CONTRACT_VERSION || value.authority !== "none" ||
      value.notice !== FEATURE_FLIGHT_RELAY_NOTICE || value.kind !== "relay.pending") throw new Error("Relay entry contract identity is invalid.");
  if (!Number.isSafeInteger(value.logSequence) || value.logSequence < 0 || value.lifecycleSequence !== 0 ||
      value.previousLifecycleDigest !== null || (value.previousLogDigest !== null && !DIGEST.test(value.previousLogDigest))) {
    throw new Error("Relay entry chain fields are malformed.");
  }
  if (value.relayId !== relay.relayId || value.relayDigest !== relay.relayDigest || value.entryId !== `relay-entry:${relay.relayId.slice(6)}:0`) {
    throw new Error("Relay entry identity does not match its relay.");
  }
  if (value.entryDigest !== featureFlightRelayDigestV1(entryBody(value), "shield.feature-flight-relay.pending.entry.v1")) {
    throw new Error("Relay entry digest is invalid.");
  }
  return freeze(value);
}

export function createFeatureFlightRelayEntryV1(input) {
  const value = snapshot(input, "relay pending entry input");
  exact(value, ["logSequence", "previousLogDigest", "relay"], "relay pending entry input");
  const relay = validateRelayObject(value.relay);
  const body = {
    schemaVersion: 1,
    artifactType: "feature-flight-relay-entry",
    contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
    authority: "none",
    notice: FEATURE_FLIGHT_RELAY_NOTICE,
    kind: "relay.pending",
    logSequence: value.logSequence,
    lifecycleSequence: 0,
    relayId: relay.relayId,
    relayDigest: relay.relayDigest,
    previousLogDigest: value.previousLogDigest,
    previousLifecycleDigest: null,
    relay,
  };
  const entryId = `relay-entry:${relay.relayId.slice(6)}:0`;
  return validateEntryObject({ ...body, entryId, entryDigest: featureFlightRelayDigestV1(body, "shield.feature-flight-relay.pending.entry.v1") });
}

export function validateFeatureFlightRelayEntryV1(input) {
  try { return freeze({ state: "valid", value: validateEntryObject(input), reasonCodes: [] }); }
  catch (error) { return fail("entry_invalid", error instanceof Error ? error.message : "Relay entry validation failed."); }
}

function projectionFor(entry) {
  const relay = entry.relay;
  return freeze({
    schemaVersion: 1,
    artifactType: "feature-flight-relay-projection",
    contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
    authority: "none",
    notice: FEATURE_FLIGHT_RELAY_INSPECTION_NOTICE,
    relayId: relay.relayId,
    relayDigest: relay.relayDigest,
    source: snapshot(relay.source),
    terminal: snapshot(relay.terminal),
    recipient: snapshot(relay.recipient),
    lifecycleState: "pending",
    repositoryRevision: relay.source.repositoryRevision,
    nextAction: FEATURE_FLIGHT_RELAY_NEXT_ACTION,
    lastEntryDigest: entry.entryDigest,
  });
}

export function replayFeatureFlightRelayLedgerV1(input, expectedRecipientInput = undefined) {
  let entries;
  let expectedRecipient;
  try {
    entries = snapshot(input, "relay ledger");
    if (!Array.isArray(entries) || entries.length > FEATURE_FLIGHT_RELAY_MAX_LEDGER_ENTRIES) throw new Error("Relay ledger must be a bounded ordinary array.");
    if (expectedRecipientInput !== undefined) {
      expectedRecipient = snapshot(expectedRecipientInput, "expected recipient");
      validateRecipient(expectedRecipient, "expected recipient");
    }
  } catch (error) { return fail("malformed_ledger", error instanceof Error ? error.message : "Relay ledger is malformed."); }
  const replayed = [];
  const relayIds = new Map();
  const sourceDigests = new Map();
  const entryDigests = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    let entry;
    try { entry = validateEntryObject(entries[index]); }
    catch (error) { return fail("entry_invalid", error instanceof Error ? error.message : "Relay entry is invalid."); }
    if (entryDigests.has(entry.entryDigest)) return fail("duplicate_event", "Relay entry digest is duplicated.");
    if (index === 0 ? entry.logSequence !== 0 || entry.previousLogDigest !== null
      : entry.logSequence !== index || entry.previousLogDigest !== replayed[index - 1].entryDigest) {
      return fail("global_chain_invalid", "Relay global sequence or digest chain is broken.");
    }
    const previousRelay = relayIds.get(entry.relayId);
    if (previousRelay !== undefined) {
      return fail(previousRelay === entry.entryDigest ? "duplicate_event" : "conflicting_reuse", "Relay identity has more than one lifecycle entry.");
    }
    const sourceKey = `${entry.relay.source.receiptId}\0${entry.relay.source.dispatchId}\0${entry.relay.terminal.entryDigest}`;
    const previousSource = sourceDigests.get(sourceKey);
    if (previousSource !== undefined && previousSource !== entry.relayId) return fail("conflicting_reuse", "Terminal source is bound to a different relay identity.");
    relayIds.set(entry.relayId, entry.entryDigest);
    sourceDigests.set(sourceKey, entry.relayId);
    entryDigests.add(entry.entryDigest);
    replayed.push(entry);
  }
  const projections = replayed.map(projectionFor);
  if (expectedRecipient !== undefined && projections.some((item) => JSON.stringify(item.recipient) !== JSON.stringify(expectedRecipient))) {
    return fail("recipient_mismatch", "Relay recipient does not match the expected controller binding.");
  }
  const inspection = freeze({
    schemaVersion: 1,
    artifactType: "feature-flight-relay-inspection",
    contractVersion: FEATURE_FLIGHT_RELAY_CONTRACT_VERSION,
    authority: "none",
    notice: FEATURE_FLIGHT_RELAY_INSPECTION_NOTICE,
    throughSequence: replayed.length - 1,
    lastEntryDigest: replayed.at(-1)?.entryDigest ?? null,
    pending: projections,
  });
  return freeze({ state: "valid", entries: replayed, relays: projections, inspection });
}

export function inspectFeatureFlightRelaysV1(input, expectedRecipient = undefined) {
  const replay = replayFeatureFlightRelayLedgerV1(input, expectedRecipient);
  return replay.state === "valid" ? replay.inspection : replay;
}

export function reconcileFeatureFlightRelayEntryV1(entriesInput, candidateInput) {
  const replay = replayFeatureFlightRelayLedgerV1(entriesInput);
  if (replay.state !== "valid") return replay;
  let candidate;
  try { candidate = validateEntryObject(candidateInput); }
  catch (error) { return fail("entry_invalid", error instanceof Error ? error.message : "Candidate relay entry is invalid."); }
  const sameId = replay.entries.find((entry) => entry.entryId === candidate.entryId || entry.relayId === candidate.relayId);
  if (sameId !== undefined) {
    return sameId.entryDigest === candidate.entryDigest
      ? freeze({ state: "duplicate", appended: false, projection: replay })
      : fail("conflicting_reuse", "Relay identity was reused with conflicting content.");
  }
  const sourceConflict = replay.entries.find((entry) => entry.relay.source.receiptId === candidate.relay.source.receiptId &&
    entry.relay.source.dispatchId === candidate.relay.source.dispatchId && entry.relay.terminal.entryDigest === candidate.relay.terminal.entryDigest);
  if (sourceConflict !== undefined) return fail("conflicting_reuse", "Terminal source was reused with a conflicting relay identity.");
  if (candidate.logSequence !== replay.entries.length || candidate.previousLogDigest !== (replay.entries.at(-1)?.entryDigest ?? null)) {
    return fail("conflicting_reuse", "Relay global sequence was reused or skipped.");
  }
  const appended = replayFeatureFlightRelayLedgerV1([...replay.entries, candidate]);
  return appended.state === "valid" ? freeze({ state: "accepted", appended: true, projection: appended }) : appended;
}
