import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_SCHEMA_V2_VERSION,
  CONFIG_SCHEMA_VERSION,
  CONFIGURED_HOST_ADAPTER_IDS,
  DOCTOR_REPORT_VERSION,
  LEGACY_CONFIG_SCHEMA_VERSION,
  REPOSITORY_TRUST_PROFILE_IDS,
  REPOSITORY_TRUST_PROFILES_V1,
  SHIELD_PACKAGE_VERSION,
  SUPPORTED_ADAPTER_IDS,
  SUPPORTED_CONFIG_SCHEMA_VERSIONS,
  SUPPORTED_MODE_IDS,
  SUPPORTED_SEAT_IDS,
  configuredAdapterIds,
  composeCopilotDoctorReportV1,
  createShieldConfig,
  evaluateDoctor,
  formatShieldConfig,
  migrateShieldConfig,
  parseShieldConfig,
  repositoryTrustProfileId,
  validateShieldConfig,
} from "../dist/config.mjs";

function canonicalConfig(repositoryTrustProfileId = "signed_human_gates", adapterIds) {
  return createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    repositoryTrustProfileId,
    ...(adapterIds === undefined ? {} : { adapterIds }),
    coulsonBindingRef: "ed25519:sha256:coulson-binding-ref",
    ...(repositoryTrustProfileId === "signed_human_gates"
      ? { fitzBindingRef: "ed25519:sha256:fitz-binding-ref" }
      : {}),
  });
}

function schema2Config() {
  const { adapterIds: _adapterIds, ...common } = canonicalConfig();
  return { ...common, schemaVersion: 2, adapterId: "github" };
}

function schema1Config() {
  const { repositoryTrustProfileId: _profileId, ...common } = schema2Config();
  return { ...common, schemaVersion: 1 };
}

test("publishes closed legacy executable and configured-host registries", () => {
  assert.equal(LEGACY_CONFIG_SCHEMA_VERSION, 1);
  assert.equal(CONFIG_SCHEMA_V2_VERSION, 2);
  assert.equal(CONFIG_SCHEMA_VERSION, 3);
  assert.deepEqual(SUPPORTED_CONFIG_SCHEMA_VERSIONS, [1, 2, 3]);
  assert.deepEqual(SUPPORTED_ADAPTER_IDS, ["github"]);
  assert.deepEqual(CONFIGURED_HOST_ADAPTER_IDS, ["github", "atlassian"]);
  for (const registry of [SUPPORTED_CONFIG_SCHEMA_VERSIONS, SUPPORTED_ADAPTER_IDS, CONFIGURED_HOST_ADAPTER_IDS, REPOSITORY_TRUST_PROFILE_IDS]) {
    assert.equal(Object.isFrozen(registry), true);
    assert.throws(() => registry.push("hostile"), TypeError);
  }
  assert.equal(Object.isFrozen(REPOSITORY_TRUST_PROFILES_V1), true);
  assert.deepEqual(REPOSITORY_TRUST_PROFILES_V1.map(({ profileId }) => profileId), [
    "signed_human_gates", "coulson_only_platform_review",
  ]);
});

test("creates schema 3 with GitHub default and accepts the frozen dual-host order", () => {
  const defaultConfig = canonicalConfig();
  assert.equal(defaultConfig.schemaVersion, 3);
  assert.deepEqual(defaultConfig.adapterIds, ["github"]);
  assert.deepEqual(defaultConfig.supportedSeatIds, SUPPORTED_SEAT_IDS);
  assert.deepEqual(defaultConfig.supportedModeIds, SUPPORTED_MODE_IDS);
  assert.deepEqual(parseShieldConfig(formatShieldConfig(defaultConfig)), { state: "valid", value: defaultConfig });

  const dual = canonicalConfig("signed_human_gates", ["github", "atlassian"]);
  assert.equal(validateShieldConfig(dual).state, "valid");
  assert.deepEqual(configuredAdapterIds(dual), ["github", "atlassian"]);
  assert.deepEqual(canonicalConfig("signed_human_gates", ["atlassian"]).adapterIds, ["atlassian"]);
});

test("preserves schema 1 and 2 parsing, bytes, meanings, and executable adapter identity", () => {
  for (const legacy of [schema1Config(), schema2Config()]) {
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    assert.deepEqual(parseShieldConfig(bytes), { state: "valid", value: legacy });
    assert.equal(formatShieldConfig(legacy), bytes);
    assert.deepEqual(configuredAdapterIds(legacy), ["github"]);
    assert.equal(repositoryTrustProfileId(legacy), legacy.schemaVersion === 1
      ? "signed_human_gates"
      : legacy.repositoryTrustProfileId);
  }

  const compatible = schema1Config();
  compatible.trustedHumanBindingRefs[1].bindingRef = "github:user:fitz-todo";
  assert.equal(validateShieldConfig(compatible).state, "valid");
  assert.deepEqual(SUPPORTED_ADAPTER_IDS, ["github"]);
});

test("migrates schema 1 and 2 purely and returns defensive schema-3 values", () => {
  const v1 = schema1Config();
  const v2 = schema2Config();
  const v3 = canonicalConfig("signed_human_gates", ["github", "atlassian"]);
  const snapshots = [structuredClone(v1), structuredClone(v2), structuredClone(v3)];
  const migrated = [migrateShieldConfig(v1), migrateShieldConfig(v2), migrateShieldConfig(v3)];
  assert.deepEqual([v1, v2, v3], snapshots);
  assert.equal(migrated[0].repositoryTrustProfileId, "signed_human_gates");
  assert.equal(migrated[1].repositoryTrustProfileId, v2.repositoryTrustProfileId);
  assert.deepEqual(migrated.map(({ adapterIds }) => adapterIds), [["github"], ["github"], ["github", "atlassian"]]);
  migrated[2].adapterIds.pop();
  migrated[2].paths.journals = ".shield/changed";
  assert.deepEqual(v3.adapterIds, ["github", "atlassian"]);
  assert.equal(v3.paths.journals, ".shield/journals");
  const projected = configuredAdapterIds(v3);
  projected.pop();
  assert.deepEqual(v3.adapterIds, ["github", "atlassian"]);
});

test("rejects schema-3 unknown fields, adapters, duplicates, order, emptiness, and credential-bearing values", () => {
  const config = canonicalConfig("signed_human_gates", ["github", "atlassian"]);
  const unsafeBinding = structuredClone(config);
  unsafeBinding.trustedHumanBindingRefs[0].bindingRef = "token=plain-text-secret";
  const unsafePath = structuredClone(config);
  unsafePath.paths.journals = "../journals";
  const overlappingPath = structuredClone(config);
  overlappingPath.paths.reports = ".shield/artifacts/reports";
  const cases = [
    Object.assign(Object.create({ inherited: true }), config),
    { ...config, schemaVersion: 4 },
    { ...config, adapterIds: ["gitlab"] },
    { ...config, adapterIds: [] },
    { ...config, adapterIds: ["github", "github"] },
    { ...config, adapterIds: ["atlassian", "github"] },
    { ...config, adapterId: "github" },
    { ...config, supportedSeatIds: config.supportedSeatIds.slice(1) },
    { ...config, supportedModeIds: [...config.supportedModeIds, "delivery"] },
    unsafeBinding,
    unsafePath,
    overlappingPath,
  ];
  for (const candidate of cases) assert.equal(validateShieldConfig(candidate).state, "invalid");
});

test("enforces trust-profile binding cardinalities", () => {
  const coulsonOnly = canonicalConfig("coulson_only_platform_review");
  assert.deepEqual(coulsonOnly.trustedHumanBindingRefs, [
    { seatId: "coulson", bindingRef: "ed25519:sha256:coulson-binding-ref" },
  ]);
  for (const candidate of [
    { ...coulsonOnly, repositoryTrustProfileId: "hostile" },
    { ...coulsonOnly, trustedHumanBindingRefs: [] },
    { ...coulsonOnly, trustedHumanBindingRefs: [...coulsonOnly.trustedHumanBindingRefs, { seatId: "fitz", bindingRef: "ed25519:sha256:fitz" }] },
    { ...coulsonOnly, trustedHumanBindingRefs: [{ seatId: "coulson", bindingRef: "placeholder" }] },
  ]) assert.equal(validateShieldConfig(candidate).state, "invalid");
});

test("doctor v2 emits adjacent independent config-only adapter checks", () => {
  const expectedWithoutAdapter = [
    "repository-root", "package-version", "config-present", "config-schema",
    "seats", "modes", "bindings", "paths",
  ];
  for (const [config, adapters] of [
    [schema1Config(), ["github"]],
    [schema2Config(), ["github"]],
    [canonicalConfig(), ["github"]],
    [canonicalConfig("signed_human_gates", ["github", "atlassian"]), ["github", "atlassian"]],
  ]) {
    const report = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config });
    assert.equal(report.reportVersion, DOCTOR_REPORT_VERSION);
    assert.equal(report.reportVersion, 2);
    assert.equal(report.ok, true);
    assert.deepEqual(report.checks.filter(({ id }) => id !== "adapter").map(({ id }) => id), expectedWithoutAdapter);
    assert.deepEqual(report.checks.filter(({ id }) => id === "adapter").map(({ adapterId }) => adapterId), adapters);
    assert.equal(report.checks.findIndex(({ id }) => id === "adapter"), 4);
    for (const check of report.checks.filter(({ id }) => id === "adapter")) {
      assert.equal(check.ok, true);
      assert.match(check.message, /repository configuration/iu);
    }
  }
});

test("host-selected Doctor composition is separate and preserves ordinary Doctor bytes and schema", () => {
  const ordinary = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config: canonicalConfig(),
  });
  const bytes = JSON.stringify(ordinary);
  const capability = {
    authority: "none",
    disposition: "ready",
    reasonCode: "ready",
    nextAction: "No machine action is required for this capability.",
    observed: "retained",
  };
  const selected = composeCopilotDoctorReportV1(ordinary, capability);
  assert.deepEqual(selected, {
    reportVersion: 1,
    contractVersion: "shield.doctor.host-selected.v1",
    authority: "none",
    host: "github-copilot",
    ok: true,
    doctor: ordinary,
    hostCapability: capability,
  });
  assert.equal(JSON.stringify(ordinary), bytes);
  assert.equal(ordinary.reportVersion, 2);
  const unavailable = composeCopilotDoctorReportV1(ordinary, { ...capability, disposition: "unavailable", reasonCode: "repository_drift" });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.hostCapability.reasonCode, "repository_drift");
});

test("doctor produces one redacted null adapter failure for every invalid adapter shape", () => {
  for (const adapterIds of [undefined, [], ["github", "github"], ["atlassian", "github"], ["token=secret"]]) {
    const config = { ...canonicalConfig(), adapterIds };
    const report = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: true, config });
    const adapterChecks = report.checks.filter(({ id }) => id === "adapter");
    assert.deepEqual(adapterChecks.map(({ adapterId, ok }) => ({ adapterId, ok })), [{ adapterId: null, ok: false }]);
    assert.doesNotMatch(adapterChecks[0].message, /token|secret/iu);
  }
  const missing = evaluateDoctor({ repositoryRootReady: true, packageVersion: SHIELD_PACKAGE_VERSION, configPresent: false });
  assert.deepEqual(missing.checks.filter(({ id }) => id === "adapter").map(({ adapterId, ok }) => ({ adapterId, ok })), [
    { adapterId: null, ok: false },
  ]);
});

test("doctor treats simultaneous schema-3 adapter fields as one redacted adapter failure", () => {
  const config = { ...canonicalConfig("signed_human_gates", ["github", "atlassian"]), adapterId: "token=secret" };
  const report = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config,
  });
  const adapterChecks = report.checks.filter(({ id }) => id === "adapter");
  assert.deepEqual(adapterChecks, [{
    id: "adapter",
    adapterId: null,
    ok: false,
    message: "Configured host adapter selection is invalid.",
  }]);
  assert.doesNotMatch(JSON.stringify(adapterChecks), /token|secret/iu);
});

test("doctor carries the closed worktree-state classification without treating provenance as authority", () => {
  const config = canonicalConfig();
  const prepared = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config,
    worktreeState: {
      classification: "prepared_worktree",
      ok: true,
      message: "Prepared policy is exact.",
      receiptDigest: "a".repeat(64),
    },
  });
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.worktreeState, {
    classification: "prepared_worktree",
    ok: true,
    message: "Prepared policy is exact.",
    receiptDigest: "a".repeat(64),
  });

  const stale = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config,
    worktreeState: {
      classification: "stale_or_malformed_worktree_state",
      ok: false,
      message: "Prepared policy drifted.",
      receiptDigest: null,
    },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.worktreeState.classification, "stale_or_malformed_worktree_state");
});
