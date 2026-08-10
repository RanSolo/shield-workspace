import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { types } from "node:util";
import { canonicalJson } from "./mission-v2.mjs";

const KDF_N = 16_384;
const KDF_R = 8;
const KDF_P = 1;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SIGNER_OPEN_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const FAILURE_MESSAGES = Object.freeze({
  creation_failed: "creation_failed: Signer creation failed.",
  recovery_required: "recovery_required: Signer creation state is uncertain; inspect protected host signer storage before retrying.",
});

export interface SignerCreationInput {
  seatId: "coulson";
  bindingId: string;
  humanPrincipalId: string;
}

export interface SignerCreationResult {
  readonly schemaVersion: 1;
  readonly seatId: "coulson";
  readonly bindingId: string;
  readonly humanPrincipalId: string;
  readonly signingKeyRef: string;
  readonly publicKeySpkiBase64: string;
  readonly signerPath: string;
}

interface StoredSigner {
  schemaVersion: 1;
  signingKeyRef: string;
  saltBase64: string;
  ivBase64: string;
  tagBase64: string;
  ciphertextBase64: string;
}

type MissionSignerSnapshotRecord = Readonly<{
  schemaVersion: 1;
  signingKeyRef: string;
  signerPath: string;
  descriptorBefore: Readonly<{ device: string; inode: string; mode: number }>;
  pathBefore: Readonly<{ device: string; inode: string; mode: number }>;
  byteLength: number;
  bytesBase64: string;
  bytesSha256: string;
  descriptorAfter: Readonly<{ device: string; inode: string; mode: number }>;
  pathAfter: Readonly<{ device: string; inode: string; mode: number }>;
}>;

export type MissionSignerSnapshot = Readonly<{ readonly opaqueMissionSignerSnapshot: never }>;

type SignerCreationFailureCode = keyof typeof FAILURE_MESSAGES;
type SignerCreationStage =
  | "opened"
  | "written"
  | "mode_set"
  | "synced"
  | "verified"
  | "before_path_identity"
  | "before_cleanup_identity"
  | "after_cleanup_unlink";

interface FileIdentity {
  dev: number | bigint;
  ino: number | bigint;
}

interface SignerCreationStageContext {
  signerPath: string;
  handle: FileHandle;
  identity: FileIdentity | null;
}

interface SignerCreationDependencies {
  homeDirectory: string;
  generateKeyPair: () => { privateKey: KeyObject; publicKey: KeyObject };
  randomBytes: (size: number) => Buffer;
  openSigner: (path: string) => Promise<FileHandle>;
  write: (handle: FileHandle, content: Buffer) => Promise<void>;
  chmod: (handle: FileHandle, mode: number) => Promise<void>;
  sync: (handle: FileHandle) => Promise<void>;
  stat: (handle: FileHandle) => Promise<Stats>;
  close: (handle: FileHandle) => Promise<void>;
  pathLstat: typeof lstat;
  pathUnlink: typeof unlink;
  stage: (stage: SignerCreationStage, context: SignerCreationStageContext) => Promise<void>;
}

interface FailedCreationState {
  path: string;
  handle: FileHandle;
  identity: FileIdentity | null;
  closeAttempted: boolean;
  closeUncertain: boolean;
}

class SignerCreationError extends Error {
  constructor(readonly code: SignerCreationFailureCode) {
    super(FAILURE_MESSAGES[code]);
  }
}

function signerDirectory(homeDirectory = homedir()): string {
  return join(homeDirectory, ".shield", "signers");
}

function signerPath(signingKeyRef: string, homeDirectory = homedir()): string {
  const safeRef = signingKeyRef.replace(/[^A-Za-z0-9_-]/g, "_");
  return join(signerDirectory(homeDirectory), `${safeRef}.json`);
}

function deriveKey(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode, salt, 32, { N: KDF_N, r: KDF_R, p: KDF_P });
}

function keyRef(publicKeySpkiBase64: string): string {
  return `ed25519:sha256:${createHash("sha256").update(Buffer.from(publicKeySpkiBase64, "base64")).digest("base64url")}`;
}

function errno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function sameIdentity(identity: FileIdentity, stats: { dev: number | bigint; ino: number | bigint }): boolean {
  return identity.dev === stats.dev && identity.ino === stats.ino;
}

function snapshotIdentity(stats: Stats): Readonly<{ device: string; inode: string; mode: number }> {
  return Object.freeze({ device: String(stats.dev), inode: String(stats.ino), mode: stats.mode });
}

function assertSnapshotFile(
  descriptor: Stats,
  pathObservation: Stats,
  label: string,
): void {
  if (!descriptor.isFile() || descriptor.isSymbolicLink() || pathObservation.isSymbolicLink() ||
      !pathObservation.isFile() || descriptor.dev !== pathObservation.dev || descriptor.ino !== pathObservation.ino ||
      descriptor.mode !== pathObservation.mode) {
    throw new Error(`Mission signer snapshot ${label} identity is invalid.`);
  }
}

export async function captureMissionSignerSnapshot(
  signingKeyRef: string,
  homeDirectory = homedir(),
): Promise<MissionSignerSnapshot> {
  const path = signerPath(signingKeyRef, homeDirectory);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const descriptorBefore = await handle.stat();
    const pathBefore = await lstat(path);
    assertSnapshotFile(descriptorBefore, pathBefore, "before read");
    const bytes = await handle.readFile();
    const descriptorAfter = await handle.stat();
    const pathAfter = await lstat(path);
    assertSnapshotFile(descriptorAfter, pathAfter, "after read");
    if (descriptorBefore.dev !== descriptorAfter.dev || descriptorBefore.ino !== descriptorAfter.ino ||
        descriptorBefore.mode !== descriptorAfter.mode) {
      throw new Error("Mission signer snapshot descriptor changed during read.");
    }
    const record: MissionSignerSnapshotRecord = Object.freeze({
      schemaVersion: 1,
      signingKeyRef,
      signerPath: path,
      descriptorBefore: snapshotIdentity(descriptorBefore),
      pathBefore: snapshotIdentity(pathBefore),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString("base64"),
      bytesSha256: createHash("sha256").update(bytes).digest("hex"),
      descriptorAfter: snapshotIdentity(descriptorAfter),
      pathAfter: snapshotIdentity(pathAfter),
    });
    return record as unknown as MissionSignerSnapshot;
  } finally {
    await handle.close();
  }
}

export function assertMissionSignerSnapshotUnchanged(
  initial: MissionSignerSnapshot,
  fresh: MissionSignerSnapshot,
): void {
  if (canonicalJson(initial) !== canonicalJson(fresh)) {
    throw new Error("Mission signer snapshot changed after display.");
  }
}

async function secureDirectory(path: string): Promise<FileIdentity> {
  let observed;
  try {
    observed = await lstat(path);
  } catch (error) {
    if (!errno(error, "ENOENT")) throw error;
    await mkdir(path, { mode: 0o700 });
    observed = await lstat(path);
  }
  if (observed.isSymbolicLink() || !observed.isDirectory()) throw new SignerCreationError("creation_failed");

  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_DIRECTORY ?? 0);
  const handle = await open(path, flags);
  try {
    const opened = await handle.stat();
    if (!opened.isDirectory() || opened.dev !== observed.dev || opened.ino !== observed.ino) {
      throw new SignerCreationError("creation_failed");
    }
    await handle.chmod(0o700);
    const verified = await handle.stat();
    const finalObservation = await lstat(path);
    if (!verified.isDirectory() || (verified.mode & 0o777) !== 0o700 ||
        finalObservation.isSymbolicLink() || !finalObservation.isDirectory() ||
        verified.dev !== finalObservation.dev || verified.ino !== finalObservation.ino) {
      throw new SignerCreationError("creation_failed");
    }
    return { dev: verified.dev, ino: verified.ino };
  } finally {
    await handle.close();
  }
}

async function observeDirectory(path: string, identity: FileIdentity): Promise<void> {
  const observed = await lstat(path);
  if (observed.isSymbolicLink() || !observed.isDirectory() || !sameIdentity(identity, observed) || (observed.mode & 0o777) !== 0o700) {
    throw new SignerCreationError("creation_failed");
  }
}

async function prepareSignerDirectory(homeDirectory: string): Promise<{ shield: FileIdentity; signers: FileIdentity }> {
  const shieldPath = join(homeDirectory, ".shield");
  const shield = await secureDirectory(shieldPath);
  const signers = await secureDirectory(join(shieldPath, "signers"));
  await observeDirectory(shieldPath, shield);
  await observeDirectory(join(shieldPath, "signers"), signers);
  return { shield, signers };
}

function defaultDependencies(homeDirectory = homedir()): SignerCreationDependencies {
  return {
    homeDirectory,
    generateKeyPair: () => generateKeyPairSync("ed25519"),
    randomBytes,
    openSigner: (path) => open(path, SIGNER_OPEN_FLAGS, 0o600),
    write: (handle, content) => handle.writeFile(content),
    chmod: (handle, mode) => handle.chmod(mode),
    sync: (handle) => handle.sync(),
    stat: (handle) => handle.stat(),
    close: (handle) => handle.close(),
    pathLstat: lstat,
    pathUnlink: unlink,
    stage: async () => undefined,
  };
}

export function validateSignerCreationInput(value: unknown): Readonly<SignerCreationInput> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error();
    }
    const keys = Reflect.ownKeys(value);
    const fields = ["seatId", "bindingId", "humanPrincipalId"] as const;
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key as typeof fields[number]))) {
      throw new Error();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (fields.some((field) => {
      const descriptor = descriptors[field];
      return descriptor === undefined || !descriptor.enumerable || !("value" in descriptor);
    })) {
      throw new Error();
    }
    const seatId = descriptors.seatId.value;
    const bindingId = descriptors.bindingId.value;
    const humanPrincipalId = descriptors.humanPrincipalId.value;
    if (seatId !== "coulson" || typeof bindingId !== "string" || typeof humanPrincipalId !== "string" ||
        !IDENTIFIER.test(bindingId) || !IDENTIFIER.test(humanPrincipalId) || bindingId === humanPrincipalId) {
      throw new Error();
    }
    return Object.freeze({ seatId, bindingId, humanPrincipalId });
  } catch {
    throw new Error("Signer creation input is invalid.");
  }
}

async function verifiedCleanup(state: FailedCreationState, dependencies: SignerCreationDependencies): Promise<boolean> {
  if (state.identity === null) return false;
  try {
    await dependencies.stage("before_cleanup_identity", {
      signerPath: state.path,
      handle: state.handle,
      identity: state.identity,
    });
    const observed = await dependencies.pathLstat(state.path);
    if (observed.isSymbolicLink() || !observed.isFile() || !sameIdentity(state.identity, observed)) return false;
    await dependencies.pathUnlink(state.path);
    await dependencies.stage("after_cleanup_unlink", {
      signerPath: state.path,
      handle: state.handle,
      identity: state.identity,
    });
    try {
      await dependencies.pathLstat(state.path);
      return false;
    } catch (error) {
      return errno(error, "ENOENT");
    }
  } catch {
    return false;
  }
}

async function failAfterCreate(state: FailedCreationState, dependencies: SignerCreationDependencies): Promise<never> {
  if (!state.closeAttempted) {
    state.closeAttempted = true;
    try {
      await dependencies.close(state.handle);
    } catch {
      state.closeUncertain = true;
    }
  }
  const cleaned = await verifiedCleanup(state, dependencies);
  throw new SignerCreationError(cleaned && !state.closeUncertain ? "creation_failed" : "recovery_required");
}

async function createSignerWithDependencies(
  input: unknown,
  passcode: string,
  dependencies: SignerCreationDependencies,
): Promise<SignerCreationResult> {
  const checked = validateSignerCreationInput(input);
  if (typeof passcode !== "string" || passcode.length < 8) throw new Error("Passcode must contain at least 8 characters.");

  let encryptedRecord: Buffer;
  let signingKeyRef: string;
  let publicKeySpkiBase64: string;
  let path: string;
  try {
    const identities = await prepareSignerDirectory(dependencies.homeDirectory);
    await observeDirectory(join(dependencies.homeDirectory, ".shield"), identities.shield);
    await observeDirectory(signerDirectory(dependencies.homeDirectory), identities.signers);

    const { privateKey, publicKey } = dependencies.generateKeyPair();
    publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    signingKeyRef = keyRef(publicKeySpkiBase64);
    const salt = dependencies.randomBytes(16);
    const iv = dependencies.randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deriveKey(passcode, salt), iv);
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const ciphertext = Buffer.concat([cipher.update(privateKeyPem, "utf8"), cipher.final()]);
    const record: StoredSigner = {
      schemaVersion: 1,
      signingKeyRef,
      saltBase64: salt.toString("base64"),
      ivBase64: iv.toString("base64"),
      tagBase64: cipher.getAuthTag().toString("base64"),
      ciphertextBase64: ciphertext.toString("base64"),
    };
    encryptedRecord = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await observeDirectory(join(dependencies.homeDirectory, ".shield"), identities.shield);
    await observeDirectory(signerDirectory(dependencies.homeDirectory), identities.signers);
    path = signerPath(signingKeyRef, dependencies.homeDirectory);
  } catch {
    throw new SignerCreationError("creation_failed");
  }

  let handle: FileHandle;
  try {
    handle = await dependencies.openSigner(path);
  } catch {
    throw new SignerCreationError("creation_failed");
  }
  const state: FailedCreationState = {
    path,
    handle,
    identity: null,
    closeAttempted: false,
    closeUncertain: false,
  };

  try {
    const opened = await dependencies.stat(handle);
    state.identity = { dev: opened.dev, ino: opened.ino };
    if (!opened.isFile() || opened.isSymbolicLink()) throw new Error();
    await dependencies.stage("opened", { signerPath: path, handle, identity: state.identity });
    await dependencies.write(handle, encryptedRecord);
    await dependencies.stage("written", { signerPath: path, handle, identity: state.identity });
    await dependencies.chmod(handle, 0o600);
    await dependencies.stage("mode_set", { signerPath: path, handle, identity: state.identity });
    await dependencies.sync(handle);
    await dependencies.stage("synced", { signerPath: path, handle, identity: state.identity });
    const stored = await dependencies.stat(handle);
    if (!stored.isFile() || stored.isSymbolicLink() || !sameIdentity(state.identity, stored) || (stored.mode & 0o777) !== 0o600) {
      throw new Error();
    }
    await dependencies.stage("verified", { signerPath: path, handle, identity: state.identity });
    await dependencies.stage("before_path_identity", { signerPath: path, handle, identity: state.identity });
    const pathStored = await dependencies.pathLstat(path);
    if (pathStored.isSymbolicLink() || !pathStored.isFile() || !sameIdentity(state.identity, pathStored) || (pathStored.mode & 0o777) !== 0o600) {
      throw new Error();
    }
  } catch {
    return await failAfterCreate(state, dependencies);
  }

  state.closeAttempted = true;
  try {
    await dependencies.close(handle);
  } catch {
    state.closeUncertain = true;
    return await failAfterCreate(state, dependencies);
  }

  return Object.freeze({
    schemaVersion: 1,
    seatId: checked.seatId,
    bindingId: checked.bindingId,
    humanPrincipalId: checked.humanPrincipalId,
    signingKeyRef,
    publicKeySpkiBase64,
    signerPath: path,
  });
}

export async function createSigner(input: unknown, passcode: string): Promise<SignerCreationResult> {
  return createSignerWithDependencies(input, passcode, defaultDependencies());
}

// This deterministic seam remains outside the package export map.
export const signerTestOnly = Object.freeze({
  createSigner: (
    input: unknown,
    passcode: string,
    overrides: Partial<SignerCreationDependencies> & Pick<SignerCreationDependencies, "homeDirectory">,
  ): Promise<SignerCreationResult> => createSignerWithDependencies(input, passcode, {
    ...defaultDependencies(overrides.homeDirectory),
    ...overrides,
  }),
});

export async function signWithSigner(signingKeyRef: string, passcode: string, payload: unknown): Promise<string> {
  const record = JSON.parse(await readFile(signerPath(signingKeyRef), "utf8")) as StoredSigner;
  if (record.schemaVersion !== 1 || record.signingKeyRef !== signingKeyRef) throw new Error("Signer record is invalid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(passcode, Buffer.from(record.saltBase64, "base64")), Buffer.from(record.ivBase64, "base64"));
    decipher.setAuthTag(Buffer.from(record.tagBase64, "base64"));
    const pem = Buffer.concat([decipher.update(Buffer.from(record.ciphertextBase64, "base64")), decipher.final()]).toString("utf8");
    const privateKey = createPrivateKey(pem);
    const publicKey = createPublicKey(privateKey);
    const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    if (keyRef(publicKeySpkiBase64) !== signingKeyRef) throw new Error("Signer key does not match the trusted binding.");
    return sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString("base64");
  } catch {
    throw new Error("Unable to unlock signer; check the passcode and signer record.");
  }
}

type BatchSignerDependencies = {
  readSigner: (path: string) => Promise<string>;
  signPayload: (payload: Buffer, privateKey: KeyObject, index: number) => Buffer;
};

function freezeCanonicalList(payloads: unknown): readonly unknown[] {
  if (!Array.isArray(payloads) || Object.getPrototypeOf(payloads) !== Array.prototype || payloads.length === 0 || payloads.length > 32) {
    throw new Error("Signer payload batch is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(payloads);
  if (Reflect.ownKeys(payloads).length !== payloads.length + 1) throw new Error("Signer payload batch is invalid.");
  for (let index = 0; index < payloads.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new Error("Signer payload batch is invalid.");
    }
  }
  let snapshot: unknown[];
  try {
    snapshot = JSON.parse(canonicalJson(payloads)) as unknown[];
  } catch {
    throw new Error("Signer payload batch is invalid.");
  }
  const freeze = (value: unknown): unknown => {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(snapshot) as readonly unknown[];
}

async function signPayloadBatchWithDependencies(
  signingKeyRef: string,
  publicKeySpkiBase64: string,
  passcode: string,
  payloads: unknown,
  dependencies: BatchSignerDependencies,
): Promise<readonly string[]> {
  const frozenPayloads = freezeCanonicalList(payloads);
  let privateKey: KeyObject | null = null;
  try {
    const record = JSON.parse(await dependencies.readSigner(signerPath(signingKeyRef))) as StoredSigner;
    if (record.schemaVersion !== 1 || record.signingKeyRef !== signingKeyRef) throw new Error();
    const configuredPublicKey = createPublicKey({
      key: Buffer.from(publicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });
    if (keyRef(publicKeySpkiBase64) !== signingKeyRef) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(passcode, Buffer.from(record.saltBase64, "base64")),
      Buffer.from(record.ivBase64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(record.tagBase64, "base64"));
    const pem = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertextBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
    privateKey = createPrivateKey(pem);
    const unlockedPublicKey = createPublicKey(privateKey);
    const unlockedSpki = unlockedPublicKey.export({ format: "der", type: "spki" }).toString("base64");
    if (unlockedSpki !== publicKeySpkiBase64 || keyRef(unlockedSpki) !== signingKeyRef) throw new Error();

    const signatures: string[] = [];
    for (const [index, payload] of frozenPayloads.entries()) {
      const bytes = Buffer.from(canonicalJson(payload), "utf8");
      const signature = dependencies.signPayload(bytes, privateKey, index);
      if (!verify(null, bytes, configuredPublicKey, signature)) throw new Error();
      signatures.push(signature.toString("base64"));
    }
    return Object.freeze(signatures);
  } catch {
    throw new Error("Unable to unlock signer or complete payload batch; check the passcode, signer record, and trusted binding.");
  } finally {
    privateKey = null;
  }
}

export async function signPayloadBatchWithSigner(
  signingKeyRef: string,
  publicKeySpkiBase64: string,
  passcode: string,
  payloads: unknown,
): Promise<readonly string[]> {
  return signPayloadBatchWithDependencies(signingKeyRef, publicKeySpkiBase64, passcode, payloads, {
    readSigner: (path) => readFile(path, "utf8"),
    signPayload: (payload, privateKey) => sign(null, payload, privateKey),
  });
}

export const batchSignerTestOnly = Object.freeze({
  signPayloadBatch: (
    signingKeyRef: string,
    publicKeySpkiBase64: string,
    passcode: string,
    payloads: unknown,
    overrides: Partial<BatchSignerDependencies>,
  ): Promise<readonly string[]> => signPayloadBatchWithDependencies(
    signingKeyRef,
    publicKeySpkiBase64,
    passcode,
    payloads,
    {
      readSigner: (path) => readFile(path, "utf8"),
      signPayload: (payload, privateKey) => sign(null, payload, privateKey),
      ...overrides,
    },
  ),
});
