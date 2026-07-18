import assert from "node:assert/strict";
import test from "node:test";

import {
  SHIELD_PACKAGE_VERSION,
  SUPPORTED_MODE_IDS,
  SUPPORTED_SEAT_IDS,
  createShieldConfig,
  evaluateDoctor,
  formatShieldConfig,
  parseShieldConfig,
  validateShieldConfig,
} from "../dist/config.mjs";

function canonicalConfig() {
  return createShieldConfig({
    repositoryId: "RanSolo/shield-workspace",
    coulsonBindingRef: "github:user:ransolo",
    fitzBindingRef: "github:team:fitz-reviewers",
  });
}

test("creates, formats, and parses the canonical closed V0.3 config", () => {
  const config = canonicalConfig();
  assert.deepEqual(config.supportedSeatIds, SUPPORTED_SEAT_IDS);
  assert.deepEqual(config.supportedModeIds, SUPPORTED_MODE_IDS);
  assert.deepEqual(parseShieldConfig(formatShieldConfig(config)), { state: "valid", value: config });
});

test("rejects unknown, inherited, unsupported, duplicate, and incomplete values", () => {
  const config = canonicalConfig();
  const cases = [
    { ...config, futureField: true },
    Object.assign(Object.create({ inherited: true }), config),
    { ...config, schemaVersion: 2 },
    { ...config, adapterId: "gitlab" },
    { ...config, supportedSeatIds: config.supportedSeatIds.slice(1) },
    { ...config, supportedModeIds: [...config.supportedModeIds, "delivery"] },
  ];
  for (const candidate of cases) {
    assert.equal(validateShieldConfig(candidate).state, "invalid");
  }
});

test("rejects unsafe bindings and unsafe or overlapping paths", () => {
  const config = canonicalConfig();
  const unsafeBinding = structuredClone(config);
  unsafeBinding.trustedHumanBindingRefs[0].bindingRef = "token=plain-text-secret";
  assert.equal(validateShieldConfig(unsafeBinding).state, "invalid");

  const unsafePath = structuredClone(config);
  unsafePath.paths.journals = "../journals";
  assert.equal(validateShieldConfig(unsafePath).state, "invalid");

  const overlappingPath = structuredClone(config);
  overlappingPath.paths.reports = ".shield/artifacts/reports";
  assert.equal(validateShieldConfig(overlappingPath).state, "invalid");
});

test("doctor reports checks in a stable order and fails closed", () => {
  const expectedOrder = [
    "repository-root",
    "package-version",
    "config-present",
    "config-schema",
    "adapter",
    "seats",
    "modes",
    "bindings",
    "paths",
  ];
  const healthy = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config: canonicalConfig(),
  });
  assert.equal(healthy.ok, true);
  assert.deepEqual(healthy.checks.map(({ id }) => id), expectedOrder);

  const missing = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: false,
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.checks.map(({ id }) => id), expectedOrder);
  assert.equal(missing.checks.find(({ id }) => id === "config-schema")?.ok, false);

  const unknownField = evaluateDoctor({
    repositoryRootReady: true,
    packageVersion: SHIELD_PACKAGE_VERSION,
    configPresent: true,
    config: { ...canonicalConfig(), unknownField: true },
  });
  assert.equal(unknownField.ok, false);
  assert.equal(unknownField.checks.find(({ id }) => id === "config-schema")?.ok, false);
});
