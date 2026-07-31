import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes, scryptSync, sign, createPrivateKey, createPublicKey } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { canonicalJson } from "./mission-v2.mjs";

const KDF_N = 16_384;
const KDF_R = 8;
const KDF_P = 1;

export interface SignerBinding {
  bindingId: string;
  humanPrincipalId: string;
  signingKeyRef: string;
  publicKeySpkiBase64: string;
}

interface StoredSigner {
  schemaVersion: 1;
  signingKeyRef: string;
  saltBase64: string;
  ivBase64: string;
  tagBase64: string;
  ciphertextBase64: string;
}

function signerDirectory(): string {
  return join(homedir(), ".shield", "signers");
}

function signerPath(signingKeyRef: string): string {
  const safeRef = signingKeyRef.replace(/[^A-Za-z0-9_-]/g, "_");
  return join(signerDirectory(), `${safeRef}.json`);
}

function deriveKey(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode, salt, 32, { N: KDF_N, r: KDF_R, p: KDF_P });
}

function keyRef(publicKeySpkiBase64: string): string {
  return `ed25519:sha256:${createHash("sha256").update(Buffer.from(publicKeySpkiBase64, "base64")).digest("base64url")}`;
}

export async function createSigner(binding: SignerBinding, passcode: string): Promise<string> {
  if (passcode.length < 8) throw new Error("Passcode must contain at least 8 characters.");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = keyRef(publicKeySpkiBase64);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
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
  const path = signerPath(signingKeyRef);
  await mkdir(signerDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  Object.assign(binding, { signingKeyRef, publicKeySpkiBase64 });
  return path;
}

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
