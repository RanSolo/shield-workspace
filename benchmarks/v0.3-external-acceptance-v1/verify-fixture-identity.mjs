import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..");
const CANNON_PREFIX = "shield:fixture:v1";
const IDENTITY_FILE = "fixture-identity-v1.json";

const EXPECTED_IDENTITY_SHA256 = "26e081053d21be904a5505dd9b9c9c8142bea949efc50ba4181b8b77cd853106";

const COVERED_ARTIFACTS = Object.freeze({
  manifest: {
    path: "fixture-manifest.mjs",
  },
  "template-package": {
    path: "template/package.json",
  },
  "template-source": {
    path: "template/src/greeting.mjs",
  },
  "template-test": {
    path: "template/test/greeting.test.mjs",
  },
  "grading-driver": {
    path: "src/driver.mjs",
  },
  "evidence-inventory": {
    path: "evidence-inventory.mjs",
  },
});

const EXPECTED_PACKAGE = Object.freeze({
  name: "@shield/team-system",
  version: "0.1.0",
  digestAlgorithm: "sha256"
});

const HEX64 = /^[0-9a-f]{64}$/u;
const SCHEMA_VERSION = "shield.fixture.identity.v1";
const FIXTURE_ID = "fixture:v0.3:external-acceptance:1";

const REQUIRED_IDENTITY_FIELDS = Object.freeze([
  "schemaVersion",
  "fixtureId",
  "coveredArtifacts",
  "package",
]);

function plain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isRegularUtf8Path(value) {
  return typeof value === "string" &&
    value === value.normalize("NFC") &&
    value.length > 0 && value.length <= 255 &&
    !value.includes("..") &&
    value[0] !== "/";
}

function framedDigest(artifactType, path, bytes) {
  return createHash("sha256")
    .update(`${CANNON_PREFIX}:${artifactType}:${path}\u0000`)
    .update(bytes)
    .digest("hex");
}

function identityDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function blocked(reason) {
  return Object.freeze({ state: "blocked", reason: `fixture_identity_${reason}` });
}

function invalid(reason, detail) {
  return Object.freeze({ state: "invalid", reason: `fixture_identity_${reason}`, detail });
}

function parsePackage(value) {
  if (!plain(value)) return invalid("malformed");
  if (!exact(value, ["name", "version", "digestAlgorithm", "digest"])) {
    return invalid("not_closed");
  }
  if (value.name !== EXPECTED_PACKAGE.name || value.version !== EXPECTED_PACKAGE.version) {
    return invalid("mismatch");
  }
  if (value.digestAlgorithm !== "sha256" || !HEX64.test(value.digest)) {
    return invalid("mismatch");
  }
  return Object.freeze({
    name: value.name,
    version: value.version,
    digestAlgorithm: value.digestAlgorithm,
    digest: value.digest
  });
}

function parseCoveredArtifacts(value) {
  if (!plain(value) || !exact(value, Object.keys(COVERED_ARTIFACTS))) {
    return invalid("not_closed");
  }
  const checked = Object.create(null);
  for (const [artifactType, expected] of Object.entries(COVERED_ARTIFACTS)) {
    const current = value[artifactType];
    if (!plain(current)) return invalid("malformed");
    if (!isRegularUtf8Path(current.path) || current.path !== expected.path) {
      return invalid("mismatch");
    }
    if (!HEX64.test(current.digest)) return invalid("malformed");
    checked[artifactType] = {
      path: current.path,
      digest: current.digest
    };
  }
  return Object.freeze(checked);
}

function validateIdentity(artifact) {
  if (!plain(artifact)) return invalid("malformed");
  if (!exact(artifact, REQUIRED_IDENTITY_FIELDS)) return invalid("not_closed");
  if (artifact.schemaVersion !== SCHEMA_VERSION || artifact.fixtureId !== FIXTURE_ID) {
    return invalid("mismatch");
  }
  const packageCheck = parsePackage(artifact.package);
  if (packageCheck.state === "invalid") return packageCheck;
  const coveredArtifacts = parseCoveredArtifacts(artifact.coveredArtifacts);
  if (coveredArtifacts.state === "invalid") return coveredArtifacts;
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    fixtureId: FIXTURE_ID,
    package: packageCheck,
    coveredArtifacts
  });
}

export async function verifyFixtureIdentity(root = ROOT) {
  let identityBytes;
  try {
    identityBytes = await readFile(resolve(root, IDENTITY_FILE));
  } catch {
    return blocked("not_found");
  }

  if (identityDigest(identityBytes) !== EXPECTED_IDENTITY_SHA256) {
    return blocked("record_digest_mismatch");
  }

  let identity;
  try {
    identity = JSON.parse(identityBytes.toString("utf8"));
  } catch {
    return invalid("malformed", "identity_json");
  }

  const checkedIdentity = validateIdentity(identity);
  if (checkedIdentity.state === "invalid") return checkedIdentity;

  const identityPath = resolve(root, IDENTITY_FILE);
  for (const [artifactType, expected] of Object.entries(COVERED_ARTIFACTS)) {
    const artifactPath = resolve(root, checkedIdentity.coveredArtifacts[artifactType].path);
    if (artifactPath === identityPath) {
      return blocked("recorded_in_covered_set");
    }
    const info = await lstat(artifactPath).catch(() => null);
    if (!info || !info.isFile() || info.isSymbolicLink()) {
      return blocked("missing_artifact");
    }
    let artifactBytes;
    try {
      artifactBytes = await readFile(artifactPath);
    } catch {
      return blocked("unreadable_artifact");
    }
    const digest = framedDigest(artifactType, expected.path, artifactBytes);
    if (digest !== checkedIdentity.coveredArtifacts[artifactType].digest) {
      return blocked(`drift:${artifactType}`);
    }
  }

  return Object.freeze({
    state: "valid",
    fixtureId: checkedIdentity.fixtureId,
    schemaVersion: checkedIdentity.schemaVersion,
    package: checkedIdentity.package,
    identityPath
  });
}

export { EXPECTED_IDENTITY_SHA256 };
