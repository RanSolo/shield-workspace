import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { validateAdapterCandidate, type ReviewPublicationCommunicationResultAdapterCandidate } from "./adapter-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";
import {
  computeReviewPublicationAuthoritySemanticIdentityV1,
  validateReviewPublicationAuthorityV1,
  type ReviewPublicationAuthorityV1,
  type ReviewPublicationEffect,
} from "./review-publication-v1.mjs";

export const FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION = "final-publication-receipt.v1" as const;
export const FINAL_PUBLICATION_RECEIPT_PATH = join(".shield", "final-publication-receipts.jsonl");

const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const HEX_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;

type HostTimestamp = Readonly<{ value: string; provenance: "hostTrusted" }>;

export interface FinalPublicationClaimPreimageV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION;
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly semanticAuthorityIdentity: string;
  readonly authority: ReviewPublicationAuthorityV1;
  readonly repositoryId: string;
  readonly branch: string;
  readonly baseRevisionId: string;
  readonly headRevisionId: string;
  readonly operation: "publish_mission_brief";
  readonly targetRef: string;
  readonly publicationAuthorizationId: string;
  readonly proposedChangedPaths: readonly string[];
  readonly requestedEffects: readonly ReviewPublicationEffect[];
  readonly titleDigest: string;
  readonly bodyDigest: string;
}

export interface FinalPublicationIdentityEnvelopeV1 {
  readonly claimDigest: string;
  readonly requestId: string;
  readonly candidateId: string;
  readonly sourceRef: string;
  readonly capturedAt: HostTimestamp;
  readonly envelopeDigest: string;
}

export interface FinalPublicationReceiptV1 {
  readonly schemaVersion: 1;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly baseBranch: string;
  readonly branchSlug: string;
  readonly artifactRevisionId: string;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly state: "OPEN";
  readonly isDraft: true;
}

export type FinalPublicationReceiptEntryV1 =
  | Readonly<{
      schemaVersion: 1;
      contractVersion: typeof FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION;
      sequence: 0;
      state: "started";
      claimDigest: string;
      preimage: FinalPublicationClaimPreimageV1;
      requestId: string;
      candidateId: string;
      sourceRef: string;
      capturedAt: HostTimestamp;
      envelopeDigest: string;
      claimantCommitment: string;
    }>
  | Readonly<{
      schemaVersion: 1;
      contractVersion: typeof FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION;
      sequence: 1;
      state: "delivered";
      claimDigest: string;
      receipt: FinalPublicationReceiptV1;
      candidate: ReviewPublicationCommunicationResultAdapterCandidate;
    }>
  | Readonly<{
      schemaVersion: 1;
      contractVersion: typeof FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION;
      sequence: 1;
      state: "not_applied" | "recovery_required";
      claimDigest: string;
      reason: string;
    }>;

export type FinalPublicationReceiptProjectionV1 = Readonly<{
  entries: readonly FinalPublicationReceiptEntryV1[];
  started: Extract<FinalPublicationReceiptEntryV1, { state: "started" }> | null;
  terminal: Exclude<FinalPublicationReceiptEntryV1, { state: "started" }> | null;
}>;

export type FinalPublicationStoreResultV1<T> =
  | Readonly<{ state: "valid"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

type LockToken = Readonly<{ path: string; marker: string; dev: number | bigint; ino: number | bigint }>;

const valid = <T,>(value: T): FinalPublicationStoreResultV1<T> => Object.freeze({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: readonly string[]): FinalPublicationStoreResultV1<T> =>
  Object.freeze({ state: "invalid", code, errors: Object.freeze([...errors]) });

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function snapshot<T>(value: T): T {
  const copy = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(copy);
  return copy;
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("base64url")}`;
}

export function computeFinalPublicationContentDigestV1(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function domainId(prefix: "request" | "candidate" | "source", claimDigest: string): string {
  const value = createHash("sha256").update(`shield.final-publication.${prefix}.v1\0${claimDigest}`, "utf8").digest("base64url");
  return `${prefix}:final-publication:${value}`;
}

export function computeFinalPublicationClaimDigestV1(preimage: FinalPublicationClaimPreimageV1): string {
  return digest(canonicalJson(preimage));
}

export function deriveFinalPublicationIdentityV1(claimDigest: string, capturedAt: HostTimestamp): FinalPublicationIdentityEnvelopeV1 {
  if (!DIGEST.test(claimDigest) || !exact(capturedAt, ["value", "provenance"]) ||
      capturedAt.provenance !== "hostTrusted" || typeof capturedAt.value !== "string" || !ISO_UTC.test(capturedAt.value)) {
    throw new Error("Final publication identity input is malformed.");
  }
  const identity = {
    claimDigest,
    requestId: domainId("request", claimDigest),
    candidateId: domainId("candidate", claimDigest),
    sourceRef: domainId("source", claimDigest),
    capturedAt: { ...capturedAt },
  };
  return snapshot({ ...identity, envelopeDigest: digest(canonicalJson(identity)) });
}

export function validateFinalPublicationClaimPreimageV1(input: unknown): FinalPublicationStoreResultV1<FinalPublicationClaimPreimageV1> {
  const fields = ["schemaVersion", "contractVersion", "missionId", "missionRevisionId", "semanticAuthorityIdentity", "authority",
    "repositoryId", "branch", "baseRevisionId", "headRevisionId", "operation", "targetRef", "publicationAuthorizationId",
    "proposedChangedPaths", "requestedEffects", "titleDigest", "bodyDigest"] as const;
  if (!exact(input, fields)) return invalid("malformed_claim", "Final publication claim fields are not closed.");
  const authority = validateReviewPublicationAuthorityV1(input.authority);
  if (authority.state === "blocked") return invalid("malformed_claim", `Final publication authority is invalid: ${authority.reasonCode}.`);
  const semantic = computeReviewPublicationAuthoritySemanticIdentityV1(authority.value);
  if (semantic.state === "blocked") return invalid("malformed_claim", "Final publication authority semantic identity is invalid.");
  if (input.schemaVersion !== 1 || input.contractVersion !== FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION ||
      typeof input.missionId !== "string" || !IDENTIFIER.test(input.missionId) ||
      typeof input.missionRevisionId !== "string" || !IDENTIFIER.test(input.missionRevisionId) ||
      input.semanticAuthorityIdentity !== semantic.semanticIdentity ||
      typeof input.repositoryId !== "string" || input.repositoryId !== authority.value.repositoryId ||
      input.branch !== authority.value.branch || input.baseRevisionId !== authority.value.baseRevisionId ||
      input.headRevisionId !== authority.value.headRevisionId || !REVISION.test(String(input.baseRevisionId)) || !REVISION.test(String(input.headRevisionId)) ||
      input.operation !== "publish_mission_brief" || typeof input.targetRef !== "string" || !IDENTIFIER.test(input.targetRef) ||
      typeof input.publicationAuthorizationId !== "string" || input.publicationAuthorizationId !== authority.value.authorityRef ||
      !Array.isArray(input.proposedChangedPaths) || canonicalJson(input.proposedChangedPaths) !== canonicalJson(authority.value.authorizedPaths) ||
      !Array.isArray(input.requestedEffects) || canonicalJson(input.requestedEffects) !== canonicalJson(authority.value.permittedEffects) ||
      typeof input.titleDigest !== "string" || !HEX_DIGEST.test(input.titleDigest) ||
      typeof input.bodyDigest !== "string" || !HEX_DIGEST.test(input.bodyDigest)) {
    return invalid("malformed_claim", "Final publication claim does not exactly bind its semantic authority and publication inputs.");
  }
  return valid(snapshot({ ...input, authority: authority.value }) as FinalPublicationClaimPreimageV1);
}

function validReceipt(value: unknown): value is FinalPublicationReceiptV1 {
  return exact(value, ["schemaVersion", "repositoryOwner", "repositoryName", "baseBranch", "branchSlug", "artifactRevisionId", "prNumber", "prUrl", "state", "isDraft"]) &&
    value.schemaVersion === 1 && typeof value.repositoryOwner === "string" && typeof value.repositoryName === "string" &&
    typeof value.baseBranch === "string" && typeof value.branchSlug === "string" && typeof value.artifactRevisionId === "string" &&
    REVISION.test(value.artifactRevisionId) && Number.isInteger(value.prNumber) && Number(value.prNumber) > 0 &&
    value.prUrl === `https://github.com/${value.repositoryOwner}/${value.repositoryName}/pull/${value.prNumber}` &&
    value.state === "OPEN" && value.isDraft === true;
}

function parseEntry(value: unknown, index: number): FinalPublicationStoreResultV1<FinalPublicationReceiptEntryV1> {
  if (!plain(value) || value.schemaVersion !== 1 || value.contractVersion !== FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION || value.sequence !== index) {
    return invalid("malformed_ledger", `Final publication receipt entry ${index} identity is invalid.`);
  }
  if (value.state === "started") {
    if (index !== 0 || !exact(value, ["schemaVersion", "contractVersion", "sequence", "state", "claimDigest", "preimage", "requestId", "candidateId", "sourceRef", "capturedAt", "envelopeDigest", "claimantCommitment"])) {
      return invalid("malformed_ledger", "Final publication started entry is not closed.");
    }
    const checked = validateFinalPublicationClaimPreimageV1(value.preimage);
    if (checked.state === "invalid") return checked;
    const claimDigest = computeFinalPublicationClaimDigestV1(checked.value);
    let identity: FinalPublicationIdentityEnvelopeV1;
    try { identity = deriveFinalPublicationIdentityV1(claimDigest, value.capturedAt as HostTimestamp); } catch { return invalid("malformed_ledger", "Final publication started identity is invalid."); }
    if (value.claimDigest !== claimDigest || value.requestId !== identity.requestId || value.candidateId !== identity.candidateId ||
        value.sourceRef !== identity.sourceRef || value.envelopeDigest !== identity.envelopeDigest ||
        typeof value.claimantCommitment !== "string" || !DIGEST.test(value.claimantCommitment)) {
      return invalid("malformed_ledger", "Final publication started identity does not replay exactly.");
    }
    return valid(snapshot(value as unknown as FinalPublicationReceiptEntryV1));
  }
  if (value.state === "delivered") {
    if (index !== 1 || !exact(value, ["schemaVersion", "contractVersion", "sequence", "state", "claimDigest", "receipt", "candidate"]) ||
        typeof value.claimDigest !== "string" || !DIGEST.test(value.claimDigest) || !validReceipt(value.receipt)) {
      return invalid("malformed_ledger", "Final publication delivered entry is invalid.");
    }
    const candidate = validateAdapterCandidate(value.candidate);
    if (candidate.state === "invalid" || candidate.value.adapterContractVersion !== 2 || candidate.value.candidateKind !== "communication_result" ||
        candidate.value.payload.outcome !== "delivered" || candidate.value.payload.receiptRef !== value.receipt.prUrl) {
      return invalid("malformed_ledger", "Final publication delivered candidate is invalid.");
    }
    return valid(snapshot(value as unknown as FinalPublicationReceiptEntryV1));
  }
  if (value.state === "not_applied" || value.state === "recovery_required") {
    if (index !== 1 || !exact(value, ["schemaVersion", "contractVersion", "sequence", "state", "claimDigest", "reason"]) ||
        typeof value.claimDigest !== "string" || !DIGEST.test(value.claimDigest) ||
        typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 256) {
      return invalid("malformed_ledger", "Final publication terminal entry is invalid.");
    }
    return valid(snapshot(value as unknown as FinalPublicationReceiptEntryV1));
  }
  return invalid("malformed_ledger", `Final publication receipt entry ${index} state is unsupported.`);
}

export function replayFinalPublicationReceiptLedgerV1(entries: readonly unknown[]): FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1> {
  if (!Array.isArray(entries) || entries.length > 2) return invalid("malformed_ledger", "Final publication receipt ledger is not bounded.");
  const parsed: FinalPublicationReceiptEntryV1[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const result = parseEntry(entries[index], index);
    if (result.state === "invalid") return result;
    parsed.push(result.value);
  }
  if (parsed.length > 0 && parsed[0].state !== "started") return invalid("ordering_invalid", "Final publication receipt ledger must begin with started.");
  if (parsed.length === 2 && parsed[1].claimDigest !== parsed[0].claimDigest) return invalid("claim_mismatch", "Final publication terminal claim digest differs from started.");
  return valid(snapshot({
    entries: parsed,
    started: (parsed[0] ?? null) as Extract<FinalPublicationReceiptEntryV1, { state: "started" }> | null,
    terminal: (parsed[1] ?? null) as Exclude<FinalPublicationReceiptEntryV1, { state: "started" }> | null,
  }));
}

async function paths(repositoryRoot: string): Promise<FinalPublicationStoreResultV1<{ root: string; ledger: string; lock: string }>> {
  try {
    const canonicalRoot = await realpath(repositoryRoot);
    if (canonicalRoot !== resolve(repositoryRoot)) return invalid("unsafe_path", "Repository root must already be canonical.");
    const shield = resolve(canonicalRoot, ".shield");
    const canonicalShield = await realpath(shield);
    const fromRoot = relative(canonicalRoot, canonicalShield);
    if (fromRoot !== ".shield" || fromRoot.startsWith(`..${sep}`)) return invalid("unsafe_path", "Final publication ledger root escapes the repository.");
    const ledger = resolve(canonicalShield, "final-publication-receipts.jsonl");
    return valid({ root: canonicalShield, ledger, lock: `${ledger}.lock` });
  } catch (error) {
    return invalid("ledger_unavailable", `Final publication ledger path is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown"}.`);
  }
}

async function readEntries(ledger: string): Promise<FinalPublicationStoreResultV1<{ bytes: string; entries: unknown[] }>> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(ledger, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    const pathStats = await lstat(ledger);
    if (!stats.isFile() || stats.isSymbolicLink() || pathStats.isSymbolicLink() || !pathStats.isFile() ||
        stats.dev !== pathStats.dev || stats.ino !== pathStats.ino || stats.size > MAX_LEDGER_BYTES) {
      return invalid("unsafe_ledger", "Final publication ledger identity is unsafe.");
    }
    const bytes = await handle.readFile("utf8");
    if (bytes !== "" && !bytes.endsWith("\n")) return invalid("malformed_ledger", "Final publication ledger has an incomplete final record.");
    const lines = bytes === "" ? [] : bytes.slice(0, -1).split("\n");
    const entries: unknown[] = [];
    for (const line of lines) {
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { return invalid("malformed_ledger", "Final publication ledger contains invalid JSON."); }
      if (canonicalJson(parsed) !== line) return invalid("malformed_ledger", "Final publication ledger record is not canonical.");
      entries.push(parsed);
    }
    return valid({ bytes, entries });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return valid({ bytes: "", entries: [] });
    return invalid("ledger_unavailable", `Final publication ledger read failed: ${(error as NodeJS.ErrnoException).code ?? "unknown"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(path: string): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try { handle = await open(path, constants.O_RDONLY); await handle.sync(); return true; } catch { return false; } finally { await handle?.close().catch(() => undefined); }
}

async function acquire(lock: string): Promise<FinalPublicationStoreResultV1<LockToken>> {
  const marker = randomBytes(24).toString("base64url");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const stats = await handle.stat();
    const written = await handle.write(marker, null, "utf8");
    if (!stats.isFile() || stats.isSymbolicLink() || written.bytesWritten !== Buffer.byteLength(marker)) throw new Error("lock_write_failed");
    await handle.sync();
    await handle.close(); handle = undefined;
    if (!await syncDirectory(dirname(lock))) throw new Error("lock_directory_sync_failed");
    const pathStats = await lstat(lock);
    if (pathStats.isSymbolicLink() || !pathStats.isFile() || pathStats.dev !== stats.dev || pathStats.ino !== stats.ino) throw new Error("lock_identity_failed");
    return valid({ path: lock, marker, dev: stats.dev, ino: stats.ino });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    return invalid(code === "EEXIST" ? "ledger_busy" : "recovery_required", `Final publication ledger lock failed: ${code ?? (error as Error).message}.`);
  }
}

async function release(token: LockToken): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    const marker = await handle.readFile("utf8");
    if (!stats.isFile() || stats.dev !== token.dev || stats.ino !== token.ino || marker !== token.marker) return false;
    await handle.close(); handle = undefined;
    await unlink(token.path);
    return await syncDirectory(dirname(token.path));
  } catch { return false; } finally { await handle?.close().catch(() => undefined); }
}

async function appendEntry(
  repositoryRoot: string,
  entry: FinalPublicationReceiptEntryV1,
  claimant?: Readonly<{ claimDigest: string; capability: string }>,
): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> {
  const resolved = await paths(repositoryRoot);
  if (resolved.state === "invalid") return resolved;
  const token = await acquire(resolved.value.lock);
  if (token.state === "invalid") return token;
  let result: FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>;
  try {
    result = await (async (): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> => {
      const before = await readEntries(resolved.value.ledger);
      if (before.state === "invalid") return before;
      const replay = replayFinalPublicationReceiptLedgerV1(before.value.entries);
      if (replay.state === "invalid") return replay;
      if (claimant !== undefined && (replay.value.terminal !== null || replay.value.started?.claimDigest !== claimant.claimDigest ||
          !capabilityMatches(replay.value.started, claimant.capability))) {
        return invalid("claimant_required", "Original claimant capability is not active under the final publication ledger lock.");
      }
      if (entry.sequence !== replay.value.entries.length) return invalid("ledger_stale", "Final publication ledger sequence changed.");
      const candidate = replayFinalPublicationReceiptLedgerV1([...replay.value.entries, entry]);
      if (candidate.state === "invalid") return candidate;
      const line = `${canonicalJson(entry)}\n`;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW |
          (before.value.bytes === "" ? constants.O_CREAT : 0);
        handle = await open(resolved.value.ledger, flags, 0o600);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== Buffer.byteLength(before.value.bytes)) {
          return invalid("ledger_stale", "Final publication ledger changed before append.");
        }
        const written = await handle.write(line, null, "utf8");
        if (written.bytesWritten !== Buffer.byteLength(line)) return invalid("recovery_required", "Final publication ledger append was incomplete.");
        await handle.sync();
      } finally { await handle?.close().catch(() => undefined); }
      if (!await syncDirectory(resolved.value.root)) return invalid("recovery_required", "Final publication ledger directory sync failed.");
      const after = await readEntries(resolved.value.ledger);
      if (after.state === "invalid") return after;
      if (after.value.bytes !== `${before.value.bytes}${line}`) return invalid("recovery_required", "Final publication ledger readback differs from the exact append.");
      return replayFinalPublicationReceiptLedgerV1(after.value.entries);
    })();
  } catch (error) {
    result = invalid("recovery_required", `Final publication ledger append failed: ${(error as NodeJS.ErrnoException).code ?? "unknown"}.`);
  } finally {
    if (!await release(token.value)) {
      result = invalid("recovery_required", "Final publication ledger lock release could not be verified.");
    }
  }
  return result!;
}

export async function readFinalPublicationReceiptLedgerV1(repositoryRoot: string): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> {
  const resolved = await paths(repositoryRoot);
  if (resolved.state === "invalid") return resolved;
  const read = await readEntries(resolved.value.ledger);
  return read.state === "invalid" ? read : replayFinalPublicationReceiptLedgerV1(read.value.entries);
}

export async function claimFinalPublicationV1(input: {
  repositoryRoot: string;
  preimage: FinalPublicationClaimPreimageV1;
  capturedAt: HostTimestamp;
}): Promise<FinalPublicationStoreResultV1<
  | Readonly<{ state: "claimed"; capability: string; identity: FinalPublicationIdentityEnvelopeV1; projection: FinalPublicationReceiptProjectionV1 }>
  | Readonly<{ state: "existing"; identity: FinalPublicationIdentityEnvelopeV1; projection: FinalPublicationReceiptProjectionV1 }>
>> {
  const preimage = validateFinalPublicationClaimPreimageV1(input.preimage);
  if (preimage.state === "invalid") return preimage;
  const claimDigest = computeFinalPublicationClaimDigestV1(preimage.value);
  const identity = deriveFinalPublicationIdentityV1(claimDigest, input.capturedAt);
  const existing = await readFinalPublicationReceiptLedgerV1(input.repositoryRoot);
  if (existing.state === "invalid") return existing;
  if (existing.value.started !== null) {
    if (existing.value.started.claimDigest !== claimDigest) return invalid("claim_conflict", "A different final publication claim already exists.");
    const storedIdentity = deriveFinalPublicationIdentityV1(claimDigest, existing.value.started.capturedAt);
    return valid(snapshot({ state: "existing" as const, identity: storedIdentity, projection: existing.value }));
  }
  const capability = randomBytes(32).toString("base64url");
  const entry: Extract<FinalPublicationReceiptEntryV1, { state: "started" }> = snapshot({
    schemaVersion: 1, contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION, sequence: 0, state: "started",
    claimDigest, preimage: preimage.value, requestId: identity.requestId, candidateId: identity.candidateId,
    sourceRef: identity.sourceRef, capturedAt: identity.capturedAt, envelopeDigest: identity.envelopeDigest,
    claimantCommitment: digest(capability),
  });
  const appended = await appendEntry(input.repositoryRoot, entry);
  if (appended.state === "invalid") {
    if (appended.code === "ledger_stale" || appended.code === "ledger_busy") {
      const concurrent = await readFinalPublicationReceiptLedgerV1(input.repositoryRoot);
      if (concurrent.state === "valid" && concurrent.value.started?.claimDigest === claimDigest) {
        const storedIdentity = deriveFinalPublicationIdentityV1(claimDigest, concurrent.value.started.capturedAt);
        return valid(snapshot({ state: "existing" as const, identity: storedIdentity, projection: concurrent.value }));
      }
    }
    return appended;
  }
  return valid(snapshot({ state: "claimed" as const, capability, identity, projection: appended.value }));
}

function capabilityMatches(started: Extract<FinalPublicationReceiptEntryV1, { state: "started" }>, capability: string): boolean {
  if (typeof capability !== "string") return false;
  const actual = Buffer.from(digest(capability));
  const expected = Buffer.from(started.claimantCommitment);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function recordFinalPublicationOwnerTerminalV1(input: {
  repositoryRoot: string;
  claimDigest: string;
  capability: string;
  state: "not_applied" | "recovery_required";
  reason: string;
}): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> {
  const current = await readFinalPublicationReceiptLedgerV1(input.repositoryRoot);
  if (current.state === "invalid") return current;
  if (current.value.terminal !== null) return valid(current.value);
  if (current.value.started?.claimDigest !== input.claimDigest || !capabilityMatches(current.value.started, input.capability)) {
    return invalid("claimant_required", "Only the original final publication claimant may record this terminal state.");
  }
  return appendEntry(input.repositoryRoot, snapshot({ schemaVersion: 1, contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
    sequence: 1, state: input.state, claimDigest: input.claimDigest, reason: input.reason }), {
      claimDigest: input.claimDigest,
      capability: input.capability,
    });
}

export async function verifyFinalPublicationClaimantV1(input: {
  repositoryRoot: string;
  claimDigest: string;
  capability: string;
}): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> {
  const resolved = await paths(input.repositoryRoot);
  if (resolved.state === "invalid") return resolved;
  const token = await acquire(resolved.value.lock);
  if (token.state === "invalid") return token;
  let result: FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>;
  try {
    const read = await readEntries(resolved.value.ledger);
    if (read.state === "invalid") result = read;
    else {
      const replay = replayFinalPublicationReceiptLedgerV1(read.value.entries);
      if (replay.state === "invalid") result = replay;
      else if (replay.value.terminal !== null) result = invalid("claim_terminal", "Final publication claim is already terminal.");
      else if (replay.value.started?.claimDigest !== input.claimDigest || !capabilityMatches(replay.value.started, input.capability)) {
        result = invalid("claimant_required", "Final publication claimant capability is absent or invalid.");
      } else result = valid(replay.value);
    }
  } catch (error) {
    result = invalid("recovery_required", `Final publication claimant verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown"}.`);
  } finally {
    if (!await release(token.value)) result = invalid("recovery_required", "Final publication claimant lock release could not be verified.");
  }
  return result!;
}

export async function recordFinalPublicationDeliveredV1(input: {
  repositoryRoot: string;
  claimDigest: string;
  receipt: FinalPublicationReceiptV1;
  candidate: ReviewPublicationCommunicationResultAdapterCandidate;
}): Promise<FinalPublicationStoreResultV1<FinalPublicationReceiptProjectionV1>> {
  const current = await readFinalPublicationReceiptLedgerV1(input.repositoryRoot);
  if (current.state === "invalid") return current;
  if (current.value.started?.claimDigest !== input.claimDigest) return invalid("claim_mismatch", "Delivered publication does not match the durable claim.");
  if (current.value.terminal !== null) {
    return current.value.terminal.state === "delivered" && canonicalJson(current.value.terminal.receipt) === canonicalJson(input.receipt) &&
      canonicalJson(current.value.terminal.candidate) === canonicalJson(input.candidate)
      ? valid(current.value) : invalid("terminal_conflict", "Final publication terminal state conflicts with delivered readback.");
  }
  return appendEntry(input.repositoryRoot, snapshot({ schemaVersion: 1, contractVersion: FINAL_PUBLICATION_RECEIPT_CONTRACT_VERSION,
    sequence: 1, state: "delivered", claimDigest: input.claimDigest, receipt: input.receipt, candidate: input.candidate }));
}
