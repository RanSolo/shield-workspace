const deepFreeze = (value) => {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};

export const FIXTURE_MANIFEST = deepFreeze({
  fixtureManifestVersion: "shield.v0.3.external-acceptance-fixture.v1",
  fixtureId: "fixture:v0.3:external-acceptance:1",
  ownerIssue: "#12",
  campaignScope: "minimum-v0.3-release-fixture",
  template: {
    runtime: "node-esm",
    testLane: "node --test test/greeting.test.mjs",
    paths: [
      "package.json",
      "src/greeting.mjs",
      "test/greeting.test.mjs"
    ],
    allowedMissionChangePaths: [
      "src/greeting.mjs"
    ]
  },
  expectedOutcome: {
    baselineTest: "failed",
    candidateTest: "passed",
    injectedFailureTest: "failed",
    rollbackTest: "passed"
  },
  stopConditions: [
    "dependency_contract_unavailable",
    "scope_drift",
    "unexpected_test_outcome",
    "rollback_mismatch",
    "human_evidence_missing",
    "host_effect_requested"
  ],
  packageArtifact: {
    packageName: "@shield/team-system",
    exactVersionRequired: true,
    digestAlgorithm: "sha256",
    digestSlot: null
  },
  externalRepository: {
    baseRevisionSlot: null,
    hostConfigurationSlot: null,
    adapterId: "github",
    networkEffects: "operator-only"
  },
  blindStatus: {
    slot: null,
    allowedValues: [
      "blind",
      "partially-informed",
      "non-blind"
    ],
    priorSolutionsVisibilityMustBeRecorded: true
  },
  dependencyBlockers: [
    {
      issue: "#24",
      code: "accepted_product_contract_required",
      requiredState: "coulson-accepted",
      currentFixtureState: "unavailable"
    },
    {
      issue: "#112",
      code: "revision_bound_conformance_required",
      requiredState: "implemented-and-validated",
      currentFixtureState: "unavailable"
    },
    {
      issue: "#113",
      code: "exact_scope_review_publication_required",
      requiredState: "implemented-and-validated",
      currentFixtureState: "unavailable"
    }
  ],
  excludedCampaign: {
    issue: "#14",
    description: "Broader six-mission Multi Band benchmark campaign"
  }
});

const ROOT_FIELDS = [
  "fixtureManifestVersion",
  "fixtureId",
  "ownerIssue",
  "campaignScope",
  "template",
  "expectedOutcome",
  "stopConditions",
  "packageArtifact",
  "externalRepository",
  "blindStatus",
  "dependencyBlockers",
  "excludedCampaign"
];

export function validateFixtureManifest(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) {
    return Object.freeze({ state: "invalid", reason: "fixture_manifest_malformed" });
  }
  if (JSON.stringify(Object.keys(input)) !== JSON.stringify(ROOT_FIELDS)) {
    return Object.freeze({ state: "invalid", reason: "fixture_manifest_not_closed" });
  }
  if (JSON.stringify(input) !== JSON.stringify(FIXTURE_MANIFEST)) {
    return Object.freeze({ state: "invalid", reason: "fixture_manifest_drift" });
  }
  return Object.freeze({ state: "valid", value: FIXTURE_MANIFEST });
}
