import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LAUNCHER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const HEX64 = /^[0-9a-f]{64}$/u;

function json(value) {
  return JSON.stringify(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inside(path, fixtureRoot) {
  const relation = relative(fixtureRoot, path);
  return relation === "" ||
    (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

async function regularExternalFile(path, fixtureRoot) {
  const info = await lstat(path).catch(() => null);
  if (info === null || !info.isFile() || info.isSymbolicLink()) return null;
  const resolved = await realpath(path).catch(() => null);
  if (resolved === null || inside(resolved, fixtureRoot)) return null;
  return resolved;
}

async function readExternalJson(path, fixtureRoot) {
  const resolved = await regularExternalFile(path, fixtureRoot);
  if (resolved === null) throw new Error("external_trust_input_not_regular");
  return JSON.parse((await readFile(resolved)).toString("utf8"));
}

export async function loadTrustedReplayAnchor({ anchorPath, fixtureRoot }) {
  const root = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (root === null) throw new Error("external_trust_input_not_regular");
  const envelope = await readExternalJson(resolve(anchorPath), root);
  if (envelope?.kind !== "trusted-journal-replay-anchor-envelope" ||
      !HEX64.test(envelope.digest) ||
      envelope.projection === null || typeof envelope.projection !== "object") {
    throw new Error("trusted_replay_anchor_malformed");
  }
  const projectionBytes = Buffer.from(json(envelope.projection));
  if (digest(projectionBytes) !== envelope.digest) throw new Error("trusted_replay_anchor_digest_mismatch");
  return Object.freeze(envelope.projection);
}

function plain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

const HOST_CONTEXT_FIELDS = Object.freeze([
  "baselinePath",
  "authoritativeReceiptJournalPath",
  "attributionContext",
  "toolingContext"
]);

export async function launchExternalFixture({ fixtureRoot, operatorInput, hostContext }) {
  if (!exact(hostContext, HOST_CONTEXT_FIELDS) ||
      typeof hostContext.baselinePath !== "string" ||
      hostContext.baselinePath.length === 0 ||
      hostContext.authoritativeReceiptJournalPath !== null ||
      hostContext.attributionContext !== null ||
      hostContext.toolingContext !== null) {
    throw new Error("host_context_not_closed");
  }
  const root = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (root === null) throw new Error("fixture_root_not_regular");
  let baseline;
  try {
    baseline = await readExternalJson(resolve(hostContext.baselinePath), root);
  } catch (error) {
    if (error instanceof Error && error.message === "external_trust_input_not_regular") {
      throw new Error("baseline_path_not_regular");
    }
    throw error;
  }
  const launcherBytes = await readFile(fileURLToPath(import.meta.url));
  if (baseline.launcherDigest !== digest(launcherBytes)) throw new Error("launcher_digest_mismatch");

  const verifierPath = resolve(root, "verify-fixture-identity.mjs");
  const verifierBytes = await readFile(verifierPath);
  if (baseline.verifierDigest !== digest(verifierBytes)) throw new Error("verifier_digest_mismatch");

  const verifier = await import(pathToFileURL(verifierPath).href);
  const identity = await verifier.verifyFixtureIdentity(root, baseline);
  if (identity.state !== "valid") return identity;
  const driver = await import(pathToFileURL(resolve(root, "src/driver.mjs")).href);
  return driver.composeMinimumFixture(operatorInput, Object.freeze({
    releaseBaseline: baseline,
    validatedToolingContext: null,
    authoritativeReceiptEntries: null,
    attributionContext: null
  }));
}
