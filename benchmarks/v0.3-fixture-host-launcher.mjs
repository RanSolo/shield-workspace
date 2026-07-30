import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LAUNCHER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const HEX64 = /^[0-9a-f]{64}$/u;

function json(value) {
  return JSON.stringify(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function outside(path, fixtureRoot) {
  return path !== fixtureRoot && !path.startsWith(`${fixtureRoot}/`);
}

async function regularExternalFile(path, fixtureRoot) {
  const info = await lstat(path).catch(() => null);
  if (info === null || !info.isFile() || info.isSymbolicLink()) return null;
  const resolved = await realpath(path).catch(() => null);
  if (resolved === null || !outside(resolved, fixtureRoot)) return null;
  return resolved;
}

async function readExternalJson(path, fixtureRoot) {
  const resolved = await regularExternalFile(path, fixtureRoot);
  if (resolved === null) throw new Error("external_trust_input_not_regular");
  return JSON.parse((await readFile(resolved)).toString("utf8"));
}

export async function loadTrustedReplayAnchor({ anchorPath, fixtureRoot }) {
  const envelope = await readExternalJson(resolve(anchorPath), resolve(fixtureRoot));
  if (envelope?.kind !== "trusted-journal-replay-anchor-envelope" ||
      !HEX64.test(envelope.digest) ||
      envelope.projection === null || typeof envelope.projection !== "object") {
    throw new Error("trusted_replay_anchor_malformed");
  }
  const projectionBytes = Buffer.from(json(envelope.projection));
  if (digest(projectionBytes) !== envelope.digest) throw new Error("trusted_replay_anchor_digest_mismatch");
  return Object.freeze(envelope.projection);
}

export async function launchExternalFixture({ fixtureRoot, baselinePath, input, replayAnchorPath }) {
  const root = resolve(fixtureRoot);
  const baseline = await readExternalJson(resolve(baselinePath), root);
  const launcherBytes = await readFile(fileURLToPath(import.meta.url));
  if (baseline.launcherDigest !== digest(launcherBytes)) throw new Error("launcher_digest_mismatch");

  const verifierPath = resolve(root, "verify-fixture-identity.mjs");
  const verifierBytes = await readFile(verifierPath);
  if (baseline.verifierDigest !== digest(verifierBytes)) throw new Error("verifier_digest_mismatch");

  const verifier = await import(pathToFileURL(verifierPath).href);
  const identity = await verifier.verifyFixtureIdentity(root, baseline);
  if (identity.state !== "valid") return identity;

  const anchor = replayAnchorPath === undefined
    ? null
    : await loadTrustedReplayAnchor({ anchorPath: replayAnchorPath, fixtureRoot: root });
  const driver = await import(pathToFileURL(resolve(root, "src/driver.mjs")).href);
  const result = await driver.composeMinimumFixture({ ...input, releaseBaseline: baseline });
  return Object.freeze({ ...result, trustedReplayAnchor: anchor });
}

