import { createHash } from "node:crypto";
import { lstat, realpath, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..");
const CANNON_PREFIX = "shield:fixture:v1";
const IDENTITY_FILE = "fixture-identity-v1.json";
const VERIFIER_FILE = "verify-fixture-identity.mjs";
const RELEASE_BASELINE_KIND = "fixture-release-baseline";
const RELEASE_BASELINE_SCHEMA_VERSION = "shield.fixture.release-baseline.v1";

const EXPECTED_VERIFIER_IDENTITY = `node:${process.version}`;
const EXPECTED_LAUNCHER_IDENTITY = `node:${process.execPath}`;

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
const RELEASE_BASELINE_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "identityRecordDigest",
  "verifierDigest",
  "launcherDigest",
  "verifierIdentity",
  "launcherIdentity",
  "package"
]);

function isTrustedIdentity(value) {
  return typeof value === "string" &&
    value.normalize("NFC") === value &&
    value.length > 0 &&
    value.length <= 255;
}

function plain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isInsideFixtureRoot(candidate, fixtureRoot) {
  return candidate === fixtureRoot || candidate.startsWith(`${fixtureRoot}/`);
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

function parseReleaseBaseline(value) {
  if (!plain(value)) return invalid("baseline_malformed");
  if (!exact(value, RELEASE_BASELINE_FIELDS)) return invalid("baseline_not_closed");
  if (value.kind !== RELEASE_BASELINE_KIND || value.schemaVersion !== RELEASE_BASELINE_SCHEMA_VERSION) {
    return invalid("baseline_mismatch");
  }
  if (!HEX64.test(value.identityRecordDigest) ||
      !HEX64.test(value.verifierDigest) ||
      !isTrustedIdentity(value.verifierIdentity) ||
      !isTrustedIdentity(value.launcherIdentity)) {
    return invalid("baseline_malformed");
  }
  const packageCheck = parsePackage(value.package);
  if (packageCheck.state === "invalid") return packageCheck;
  return Object.freeze({
    ...value,
    package: packageCheck
  });
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

export async function verifyFixtureIdentity(root = ROOT, releaseBaseline) {
  if (releaseBaseline === undefined) return invalid("baseline_missing");
  const baseline = parseReleaseBaseline(releaseBaseline);
  if (baseline.state === "invalid") return baseline;
  const fixtureRoot = await realpath(root).catch(() => null);
  if (fixtureRoot === null) return blocked("record_path_not_regular");
  let identityBytes;
  const identityPath = resolve(root, IDENTITY_FILE);
  const identityInfo = await lstat(identityPath).catch(() => null);
  if (identityInfo === null || !identityInfo.isFile() || identityInfo.isSymbolicLink()) {
    return blocked("record_not_file");
  }
  const resolvedIdentityPath = await realpath(identityPath).catch(() => null);
  if (resolvedIdentityPath === null || !isInsideFixtureRoot(resolvedIdentityPath, fixtureRoot)) {
    return blocked("record_path_not_regular");
  }
  try {
    identityBytes = await readFile(identityPath);
  } catch {
    return blocked("not_found");
  }

  if (identityDigest(identityBytes) !== baseline.identityRecordDigest) {
    return blocked("record_digest_mismatch");
  }

  if (baseline.verifierIdentity !== EXPECTED_VERIFIER_IDENTITY) return blocked("verifier_identity_mismatch");
  if (baseline.launcherIdentity !== EXPECTED_LAUNCHER_IDENTITY) return blocked("launcher_identity_mismatch");
  const verifierBytes = await readFile(join(ROOT, VERIFIER_FILE)).catch(() => null);
  if (verifierBytes === null || identityDigest(verifierBytes) !== baseline.verifierDigest) {
    return blocked("verifier_digest_mismatch");
  }

  let identity;
  try {
    identity = JSON.parse(identityBytes.toString("utf8"));
  } catch {
    return invalid("malformed", "identity_json");
  }

  const checkedIdentity = validateIdentity(identity);
  if (checkedIdentity.state === "invalid") return checkedIdentity;
  if (baseline.package.digest !== checkedIdentity.package.digest) {
    return blocked("package_digest_mismatch");
  }

  for (const [artifactType, expected] of Object.entries(COVERED_ARTIFACTS)) {
    const artifactPath = resolve(root, checkedIdentity.coveredArtifacts[artifactType].path);
    const artifactInfo = await lstat(artifactPath).catch(() => null);
    if (artifactInfo === null || !artifactInfo.isFile() || artifactInfo.isSymbolicLink()) {
      return blocked("missing_artifact");
    }
    const resolvedArtifactPath = await realpath(artifactPath).catch(() => null);
    if (resolvedArtifactPath === null || !isInsideFixtureRoot(resolvedArtifactPath, fixtureRoot)) {
      return blocked("artifact_path_not_regular");
    }
    if (artifactPath === identityPath) {
      return blocked("recorded_in_covered_set");
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
