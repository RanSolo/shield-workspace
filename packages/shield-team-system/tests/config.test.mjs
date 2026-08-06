import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_SCHEMA_VERSION,
  LEGACY_CONFIG_SCHEMA_VERSION,
  REPOSITORY_TRUST_PROFILE_IDS,
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
  assert.equal(Object.isFrozen(SUPPORTED_CONFIG_SCHEMA_VERSIONS), true);
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILE_IDS), true);
  assert.deepEqual(REPOSITORY_TRUST_PROFILES_V1.map(({ profileId }) => profileId), [
    "signed_human_gates",
    "coulson_only_platform_review",
  ]);
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILES_V1), true);
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILES_V1[0]), true);
  assert.equal(REPOSITORY_TRUST_PROFILES_V1[1].externalEvidenceAdmission, "not_admitted");

  assert.throws(() => SUPPORTED_CONFIG_SCHEMA_VERSIONS.push(3), TypeError);
  assert.throws(() => REPOSITORY_TRUST_PROFILE_IDS.push("hostile"), TypeError);
  assert.equal(validateShieldConfig({ ...canonicalConfig(), schemaVersion: 3 }).state, "invalid");
  assert.equal(validateShieldConfig({ ...canonicalConfig(), repositoryTrustProfileId: "hostile" }).state, "invalid");
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

  for (const bindingRef of ["placeholder", "github:user:fitz-todo"]) {
    const compatible = structuredClone(legacy);
    compatible.trustedHumanBindingRefs[1].bindingRef = bindingRef;
    assert.equal(validateShieldConfig(compatible).state, "valid");
    assert.equal(parseShieldConfig(formatShieldConfig(compatible)).state, "valid");
  }

  const signedHuman = canonicalConfig();
  signedHuman.trustedHumanBindingRefs[1].bindingRef = "github:user:fitz-todo";
  assert.equal(validateShieldConfig(signedHuman).state, "valid");
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
    assert.equal(
      healthy.checks.find(({ id }) => id === "bindings").message,
      config.schemaVersion === 1 || config.repositoryTrustProfileId === "signed_human_gates"
        ? "Repository trust profile signed_human_gates configures Coulson and Fitz binding references as required cryptographic seats; Simmons remains optional for product-sensitive missions."
        : "Repository trust profile coulson_only_platform_review configures Coulson as the only required cryptographic seat. Fitz is GitHub-enforced external review; Simmons is conditional external feedback; neither is admitted as SHIELD evidence.",
    );
  }

  const check = (report, id) => report.checks.find((candidate) => candidate.id === id);
  const schemaHealthy = "Configuration schema and repository identity are valid.";

  const missingProfile = { ...canonicalConfig() };
  delete missingProfile.repositoryTrustProfileId;
  const missingReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: missingProfile });
  assert.deepEqual(check(missingReport, "config-schema"), { id: "config-schema", ok: true, message: schemaHealthy });
  assert.deepEqual(check(missingReport, "bindings"), { id: "bindings", ok: false, message: "config is missing field: repositoryTrustProfileId." });

  for (const repositoryTrustProfileId of [7, "hostile"]) {
    const report = evaluateDoctor({
      repositoryRootReady: true,
      packageVersion: SHIELD_PACKAGE_VERSION,
      configPresent: true,
      config: { ...canonicalConfig(), repositoryTrustProfileId },
    });
    assert.deepEqual(check(report, "config-schema"), { id: "config-schema", ok: true, message: schemaHealthy });
    assert.deepEqual(check(report, "bindings"), {
      id: "bindings",
      ok: false,
      message: "config.repositoryTrustProfileId must be signed_human_gates or coulson_only_platform_review.",
    });
  }

  const contradictory = canonicalConfig("coulson_only_platform_review");
  contradictory.trustedHumanBindingRefs.push({ seatId: "fitz", bindingRef: "ed25519:sha256:fitz-binding-ref" });
  const contradictoryReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: contradictory });
  assert.deepEqual(check(contradictoryReport, "config-schema"), { id: "config-schema", ok: true, message: schemaHealthy });
  assert.deepEqual(check(contradictoryReport, "bindings"), {
    id: "bindings",
    ok: false,
    message: "Repository trust profile coulson_only_platform_review does not admit a fitz SHIELD binding reference.",
  });

  const emptyCoulsonOnly = { ...canonicalConfig("coulson_only_platform_review"), trustedHumanBindingRefs: [] };
  const cardinalityReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: emptyCoulsonOnly });
  assert.deepEqual(check(cardinalityReport, "config-schema"), { id: "config-schema", ok: true, message: schemaHealthy });
  assert.deepEqual(check(cardinalityReport, "bindings"), {
    id: "bindings",
    ok: false,
    message: "A configured SHIELD signing binding reference is required for coulson.",
  });

  const unknownReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: { ...canonicalConfig(), unknownField: true } });
  assert.deepEqual(check(unknownReport, "config-schema"), { id: "config-schema", ok: false, message: "config has unknown field: unknownField." });

  const unsupportedReport = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config: { ...canonicalConfig(), schemaVersion: 3 } });
  assert.deepEqual(check(unsupportedReport, "config-schema"), { id: "config-schema", ok: false, message: "Config schemaVersion must be one of: 1, 2." });
  assert.equal(check(unsupportedReport, "bindings").ok, true);
});
