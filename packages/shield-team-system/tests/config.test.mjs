import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_SCHEMA_VERSION,
  LEGACY_CONFIG_SCHEMA_VERSION,
  REPOSITORY_TRUST_PROFILES_V1,
  SHIELD_PACKAGE_VERSION,
  SUPPORTED_CONFIG_SCHEMA_VERSIONS,
  SUPPORTED_MODE_IDS,
  SUPPORTED_SEAT_IDS,
  createShieldConfig,
  evaluateDoctor,
  formatShieldConfig,
  parseShieldConfig,
  repositoryTrustProfileId,
  validateShieldConfig,
} from "../dist/config.mjs";

function canonicalConfig(repositoryTrustProfileId = "signed_human_gates") {
  return createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    repositoryTrustProfileId,
    coulsonBindingRef: "ed25519:sha256:coulson-binding-ref",
    ...(repositoryTrustProfileId === "signed_human_gates"
      ? { fitzBindingRef: "ed25519:sha256:fitz-binding-ref" }
      : {}),
  });
}

function legacyConfig() {
  const { repositoryTrustProfileId: _profileId, ...common } = canonicalConfig();
  return { ...common, schemaVersion: 1 };
}

test("publishes a closed immutable repository trust profile registry and schema versions", () => {
  assert.equal(LEGACY_CONFIG_SCHEMA_VERSION, 1);
  assert.equal(CONFIG_SCHEMA_VERSION, 2);
  assert.deepEqual(SUPPORTED_CONFIG_SCHEMA_VERSIONS, [1, 2]);
  assert.deepEqual(REPOSITORY_TRUST_PROFILES_V1.map(({ profileId }) => profileId), [
    "signed_human_gates",
    "coulson_only_platform_review",
  ]);
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILES_V1), true);
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILES_V1[0]), true);
  assert.equal(REPOSITORY_TRUST_PROFILES_V1[1].externalEvidenceAdmission, "not_admitted");
});

test("creates schema 2 and preserves canonical schema-1 parsing and formatting byte-stably", () => {
  const config = canonicalConfig();
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.repositoryTrustProfileId, "signed_human_gates");
  assert.deepEqual(config.supportedSeatIds, SUPPORTED_SEAT_IDS);
  assert.deepEqual(config.supportedModeIds, SUPPORTED_MODE_IDS);
  assert.deepEqual(parseShieldConfig(formatShieldConfig(config)), { state: "valid", value: config });

  const legacy = legacyConfig();
  const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
  const parsed = parseShieldConfig(bytes);
  assert.deepEqual(parsed, { state: "valid", value: legacy });
  assert.equal(formatShieldConfig(parsed.value), bytes);
  assert.equal(repositoryTrustProfileId(parsed.value), "signed_human_gates");
});

test("enforces both profile binding cardinalities and rejects unconfigured references", () => {
  const coulsonOnly = canonicalConfig("coulson_only_platform_review");
  assert.deepEqual(coulsonOnly.trustedHumanBindingRefs.map(({ seatId }) => seatId), ["coulson"]);
  assert.equal(validateShieldConfig(coulsonOnly).state, "valid");

  for (const candidate of [
    { ...coulsonOnly, repositoryTrustProfileId: "hostile" },
    { ...coulsonOnly, trustedHumanBindingRefs: [] },
    { ...coulsonOnly, trustedHumanBindingRefs: [...coulsonOnly.trustedHumanBindingRefs, { seatId: "fitz", bindingRef: "ed25519:sha256:fitz-binding-ref" }] },
    { ...coulsonOnly, trustedHumanBindingRefs: [{ seatId: "coulson", bindingRef: "placeholder" }] },
    { ...coulsonOnly, futureField: true },
  ]) assert.equal(validateShieldConfig(candidate).state, "invalid");

  assert.throws(() => createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    coulsonBindingRef: "ed25519:sha256:coulson-binding-ref",
  }), /Fitz binding reference/u);
  assert.throws(() => createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    repositoryTrustProfileId: "coulson_only_platform_review",
    coulsonBindingRef: "ed25519:sha256:coulson-binding-ref",
    fitzBindingRef: "ed25519:sha256:fitz-binding-ref",
  }), /rejects Fitz and Simmons/u);
});

test("rejects unknown, inherited, unsupported, duplicate, unsafe, and overlapping values", () => {
  const config = canonicalConfig();
  const unsafeBinding = structuredClone(config);
  unsafeBinding.trustedHumanBindingRefs[0].bindingRef = "token=plain-text-secret";
  const unsafePath = structuredClone(config);
  unsafePath.paths.journals = "../journals";
  const overlappingPath = structuredClone(config);
  overlappingPath.paths.reports = ".shield/artifacts/reports";
  const cases = [
    Object.assign(Object.create({ inherited: true }), config),
    { ...config, schemaVersion: 3 },
    { ...config, adapterId: "gitlab" },
    { ...config, supportedSeatIds: config.supportedSeatIds.slice(1) },
    { ...config, supportedModeIds: [...config.supportedModeIds, "delivery"] },
    unsafeBinding,
    unsafePath,
    overlappingPath,
  ];
  for (const candidate of cases) assert.equal(validateShieldConfig(candidate).state, "invalid");
});

test("doctor keeps stable ordering and classifies profile failures as bindings", () => {
  const expectedOrder = [
    "repository-root", "package-version", "config-present", "config-schema", "adapter",
    "seats", "modes", "bindings", "paths",
  ];
  for (const config of [legacyConfig(), canonicalConfig(), canonicalConfig("coulson_only_platform_review")]) {
    const healthy = evaluateDoctor({
      repositoryRootReady: true,
      packageVersion: SHIELD_PACKAGE_VERSION,
      configPresent: true,
      config,
    });
    assert.equal(healthy.ok, true);
    assert.deepEqual(healthy.checks.map(({ id }) => id), expectedOrder);
  }

  const missingProfile = { ...canonicalConfig() };
  delete missingProfile.repositoryTrustProfileId;
  const missingReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: missingProfile });
  assert.equal(missingReport.checks.find(({ id }) => id === "bindings").ok, false);
  assert.equal(missingReport.checks.find(({ id }) => id === "config-schema").ok, true);

  const contradictory = canonicalConfig("coulson_only_platform_review");
  contradictory.trustedHumanBindingRefs.push({ seatId: "fitz", bindingRef: "ed25519:sha256:fitz-binding-ref" });
  const contradictoryReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: contradictory });
  assert.equal(contradictoryReport.checks.find(({ id }) => id === "bindings").ok, false);
  assert.match(contradictoryReport.checks.find(({ id }) => id === "bindings").message, /does not admit a fitz/u);

  const unknownReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: { ...canonicalConfig(), unknownField: true } });
  assert.equal(unknownReport.checks.find(({ id }) => id === "config-schema").ok, false);
});
