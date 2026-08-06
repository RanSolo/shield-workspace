import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createEvidenceInventory } from "../evidence-inventory.mjs";
import { FIXTURE_MANIFEST, validateFixtureManifest } from "../fixture-manifest.mjs";
import { verifyFixtureIdentity } from "../verify-fixture-identity.mjs";

const execFileAsync = promisify(execFile);
const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = resolve(benchmarkRoot, "template");
const templateDefectPath = resolve(templateRoot, "src/greeting.mjs");
const templateTestPath = resolve(templateRoot, "test/greeting.test.mjs");
const FIXTURE_TEST_PATH = "test/greeting.test.mjs";
const OBJECT_FORMAT_SHA1 = "sha1";
const OBJECT_FORMAT_SHA256 = "sha256";
const OBJECT_FORMATS = Object.freeze([OBJECT_FORMAT_SHA1, OBJECT_FORMAT_SHA256]);
const REVISION_FORMAT = Object.freeze({
  [OBJECT_FORMAT_SHA1]: /^[0-9a-f]{40}$/u,
  [OBJECT_FORMAT_SHA256]: /^[0-9a-f]{64}$/u
});
const REVISION_SHAPE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const INPUT_FIELDS = [
  "packageArtifactPath",
  "externalRepositoryRoot",
  "baseRevision",
  "headRevision",
  "hostConfiguration",
  "blindStatus",
  "priorSolutionsVisible",
  "requireSimmons"
];
const TRUSTED_HOST_CONTEXT_FIELDS = [
  "releaseBaseline",
  "validatedToolingContext",
  "authoritativeReceiptEntries",
  "attributionContext"
];

const plain = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields) => plain(value) &&
  Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));

async function gitOutcome(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 256 * 1024
    });
    return Object.freeze({ state: "passed", stdout });
  } catch {
    return Object.freeze({ state: "failed", stdout: "" });
  }
}

async function gitObjectFormat(cwd) {
  const outcome = await gitOutcome(cwd, ["rev-parse", "--show-object-format"]);
  if (outcome.state !== "passed") {
    return Object.freeze({ state: "invalid", reason: "external_repository_identity_malformed" });
  }
  const format = outcome.stdout.trim();
  if (!OBJECT_FORMATS.includes(format)) {
    return Object.freeze({ state: "invalid", reason: "external_repository_object_format_unsupported" });
  }
  return Object.freeze({ state: "valid", format });
}

async function gitBytesOutcome(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "buffer",
      timeout: 10_000,
      maxBuffer: 256 * 1024
    });
    return Object.freeze({ state: "passed", stdout });
  } catch {
    return Object.freeze({ state: "failed", stdout: Buffer.alloc(0) });
  }
}

export async function inspectExternalRevision({ externalRepositoryRoot, baseRevision, headRevision }) {
  if (typeof externalRepositoryRoot !== "string" ||
      typeof baseRevision !== "string" ||
      typeof headRevision !== "string") {
    return Object.freeze({ state: "invalid", reason: "external_revision_identity_malformed" });
  }
  const requestedRoot = resolve(externalRepositoryRoot);
  let repositoryRoot;
  try {
    const rootInfo = await lstat(requestedRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("unsafe_root");
    repositoryRoot = await realpath(requestedRoot);
  } catch {
    return Object.freeze({ state: "blocked", reason: "external_repository_unavailable" });
  }
  const objectFormat = await gitObjectFormat(repositoryRoot);
  if (objectFormat.state !== "valid") return objectFormat;
  const expectedRevisionFormat = REVISION_FORMAT[objectFormat.format];
  if (!expectedRevisionFormat.test(baseRevision) || !expectedRevisionFormat.test(headRevision)) {
    return Object.freeze({ state: "invalid", reason: "external_revision_identity_malformed" });
  }
  const topLevel = await gitOutcome(repositoryRoot, ["rev-parse", "--show-toplevel"]);
  if (topLevel.state !== "passed" || resolve(topLevel.stdout.trim()) !== repositoryRoot) {
    return Object.freeze({ state: "blocked", reason: "external_repository_identity_mismatch" });
  }
  if ((await gitOutcome(repositoryRoot, ["cat-file", "-e", `${baseRevision}^{commit}`])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "base_revision_unavailable" });
  }
  if ((await gitOutcome(repositoryRoot, ["cat-file", "-e", `${headRevision}^{commit}`])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "head_revision_unavailable" });
  }
  const currentHead = await gitOutcome(repositoryRoot, ["rev-parse", "HEAD"]);
  if (currentHead.state !== "passed" || currentHead.stdout.trim() !== headRevision) {
    return Object.freeze({ state: "blocked", reason: "head_revision_not_current" });
  }
  if ((await gitOutcome(repositoryRoot, [
    "merge-base", "--is-ancestor", baseRevision, headRevision
  ])).state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "base_revision_not_ancestor" });
  }
  const frozenBaseEntries = [
    ["src/greeting.mjs", templateDefectPath],
    [FIXTURE_TEST_PATH, templateTestPath]
  ];
  for (const [repositoryPath, templatePath] of frozenBaseEntries) {
    const baseBytes = await gitBytesOutcome(repositoryRoot, [
      "show", `${baseRevision}:${repositoryPath}`
    ]);
    if (baseBytes.state !== "passed" ||
        !baseBytes.stdout.equals(await readFile(templatePath))) {
      return Object.freeze({
        state: "blocked",
        reason: `frozen_base_content_mismatch:${repositoryPath}`
      });
    }
  }
  const repositoryStatus = await gitOutcome(repositoryRoot, [
    "status", "--porcelain=v1", "-z", "--untracked-files=all"
  ]);
  if (repositoryStatus.state !== "passed" || repositoryStatus.stdout.length !== 0) {
    return Object.freeze({ state: "blocked", reason: "external_revision_not_clean" });
  }
  const changed = await gitOutcome(repositoryRoot, [
    "diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", baseRevision, headRevision, "--"
  ]);
  if (changed.state !== "passed") {
    return Object.freeze({ state: "blocked", reason: "external_revision_diff_unavailable" });
  }
  const changedPaths = changed.stdout.length === 0
    ? []
    : changed.stdout.split("\0").filter((path) => path.length > 0).sort();
  if (JSON.stringify(changedPaths) !==
      JSON.stringify(FIXTURE_MANIFEST.template.allowedMissionChangePaths)) {
    return Object.freeze({ state: "blocked", reason: "scope_drift" });
  }
  return Object.freeze({
    state: "measured",
    repositoryRoot,
    baseRevision,
    headRevision,
    changedPaths: Object.freeze(changedPaths)
  });
}

function blockers() {
  return Object.freeze(FIXTURE_MANIFEST.dependencyBlockers.map((entry) => Object.freeze({
    issue: entry.issue,
    code: entry.code,
    requiredState: entry.requiredState,
    currentFixtureState: entry.currentFixtureState
  })));
}

function syntacticallyValidRevisions(baseRevision, headRevision) {
  if (!REVISION_SHAPE.test(baseRevision) || !REVISION_SHAPE.test(headRevision)) {
    return false;
  }
  return baseRevision.length === headRevision.length;
}

export async function composeMinimumFixture(input, trustedHostContext) {
  const manifest = validateFixtureManifest(FIXTURE_MANIFEST);
  if (manifest.state !== "valid") return manifest;
  if (!exact(input, INPUT_FIELDS)) {
    return Object.freeze({ state: "invalid", reason: "fixture_input_not_closed" });
  }
  if (!exact(trustedHostContext, TRUSTED_HOST_CONTEXT_FIELDS)) {
    return Object.freeze({ state: "invalid", reason: "trusted_host_context_not_closed" });
  }
  if (typeof input.packageArtifactPath !== "string" ||
      typeof input.externalRepositoryRoot !== "string" ||
      input.externalRepositoryRoot.length === 0 ||
      typeof input.baseRevision !== "string" ||
      typeof input.headRevision !== "string" ||
      typeof input.priorSolutionsVisible !== "boolean" ||
      typeof input.requireSimmons !== "boolean" ||
      trustedHostContext.validatedToolingContext !== null ||
      trustedHostContext.authoritativeReceiptEntries !== null ||
      trustedHostContext.attributionContext !== null ||
      !FIXTURE_MANIFEST.blindStatus.allowedValues.includes(input.blindStatus)) {
    return Object.freeze({ state: "invalid", reason: "fixture_identity_malformed" });
  }
  if (!syntacticallyValidRevisions(input.baseRevision, input.headRevision)) {
    return Object.freeze({ state: "invalid", reason: "external_revision_identity_malformed" });
  }
  if (input.blindStatus === "blind" && input.priorSolutionsVisible) {
    return Object.freeze({ state: "invalid", reason: "blind_status_contradiction" });
  }
  if (!exact(input.hostConfiguration, ["adapterId", "repository", "branch"]) ||
      input.hostConfiguration.adapterId !== "github" ||
      !REPOSITORY.test(input.hostConfiguration.repository) ||
      typeof input.hostConfiguration.branch !== "string" ||
      input.hostConfiguration.branch.length === 0) {
    return Object.freeze({ state: "invalid", reason: "host_configuration_malformed" });
  }
  const identity = await verifyFixtureIdentity(benchmarkRoot, trustedHostContext.releaseBaseline);
  if (identity.state !== "valid") return identity;
  const dependencyBlockers = blockers();
  const preflight = Object.freeze({
    fixtureId: FIXTURE_MANIFEST.fixtureId,
    fixtureIdentityState: identity.state,
    hostConfiguration: Object.freeze({ ...input.hostConfiguration }),
    blindStatus: input.blindStatus,
    priorSolutionsVisible: input.priorSolutionsVisible
  });
  const evidenceInventory = createEvidenceInventory({ requireSimmons: input.requireSimmons });
  if (dependencyBlockers.length > 0) {
    return Object.freeze({
      state: "blocked",
      reason: "dependency_contract_unavailable",
      blockers: dependencyBlockers,
      preflight,
      evidenceInventory
    });
  }
  const externalRevision = await inspectExternalRevision({
    externalRepositoryRoot: input.externalRepositoryRoot,
    baseRevision: input.baseRevision,
    headRevision: input.headRevision
  });
  if (externalRevision.state !== "measured") return externalRevision;
  return Object.freeze({
    state: "ready",
    externalRevision,
    preflight,
    evidenceInventory
  });
}

export async function gradeCandidateWithFailureInjection(input) {
  void input;
  return Object.freeze({ state: "blocked", reason: "trusted_isolation_supervisor_required" });
}
