import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { chmod, link, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { createShieldConfig, formatShieldConfig } from "../dist/config.mjs";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createSupervisedMissionBrief,
} from "../dist/mission-v2.mjs";
import { canonicalDelegationJson, createWheelsOffDelegation, createWheelsOffEligibility } from "../dist/delegation-v1.mjs";
import {
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import { appendProfileAwareMissionEntriesAtomicV1, appendProfileAwareMissionEntryV1 } from "../dist/mission-store.mjs";
import { compileIssueIntakeV1 } from "../dist/mission-intake-v1.mjs";
import { executeAuthorizeWheelsUpV1 } from "../dist/authorize-wheels-up-executor-v1.mjs";
import {
  assertPublicationAuthorizationFreshness,
  assertRepositoryConfigFresh,
  emitFinalPublicationClassificationV1ForTest,
  emitFinalPublicationTransitionV1ForTest,
  missionUsage,
  readInteractivePasscode,
  renderFinalPublicationDecisionV1ForTest,
  runMissionCli,
  validateAuthorizeWheelsUpInput,
} from "../dist/mission-cli.mjs";
import { batchSignerTestOnly, captureMissionSignerSnapshot, signerTestOnly } from "../dist/mission-signer.mjs";
import { evaluateReviewPublicationV1 } from "../dist/review-publication-v1.mjs";
import {
  createGuidedReviewPlanV1,
  createGuidedReviewRuntimeHandoffV1,
} from "../dist/guided-review-v1.mjs";
import { createGuidedReviewDriverReceiptV1 } from "../dist/guided-review-driver-v1.mjs";
import { createGuidedReviewRouteOverlayV1 } from "../dist/guided-review-route-overlay-v1.mjs";
import { resolveGuidedReviewRoutePreparationHostV1 } from "../dist/guided-review-route-resolution-host-v1.mjs";
import { projectCurrentGuidedReviewStepHostV1 } from "../dist/guided-review-projection-host-v1.mjs";
import { readGuidedReviewRoutePackageJsonV1, resolveGuidedReviewRoutePackagePathsV1 } from "../dist/guided-review-route-request-v1.mjs";
import { answerCurrentGuidedReviewSessionHostV1 } from "../dist/guided-review-session-host-v1.mjs";
import { buildMissionTransitionPlanV1 } from "../dist/mission-builder-v1.mjs";
import {
  buildMissionTransitionPlanReviewV1,
  materializeReviewedMissionTransitionV1,
  resolvePreparedMissionTransitionV1,
} from "../dist/mission-preparation-host-v1.mjs";
import { deriveMissionReviewedTransitionGraphMaterializationPathV1 } from "../dist/mission-preparation-store-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
} from "../dist/seat-dispatch-receipt-v1.mjs";
import {
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS,
  COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS,
  COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
  COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
  COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
  COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
  COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS,
  COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
  COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
} from "../dist/copilot-fury-plan-dispatch-v1.mjs";
import { prepareOrRefreshWorktreeStateV2, prepareWorktreeStateV1 } from "../dist/worktree-state-v1.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");

test("publish-reviewed final publication command has a closed base assertion and concise documented surface", async () => {
  assert.match(missionUsage(), /shield mission publish-reviewed --mission-id <id> --base-branch <branch>/u);
  await assert.rejects(
    runMissionCli(["mission", "publish-reviewed", "--mission-id", "mission:missing-base", "--root", packageRoot, "--json"]),
    /Missing required option: --base-branch/u,
  );
  await assert.rejects(
    runMissionCli(["mission", "publish-reviewed", "--mission-id", "mission:closed", "--base-branch", "main", "--authority", "caller", "--root", packageRoot]),
    /Unknown option: --authority/u,
  );
  await assert.rejects(
    runMissionCli(["mission", "publish-reviewed", "--mission-id", "mission:closed", "--base-branch", "main", "--fury-model", "model:fury", "--root", packageRoot]),
    /Unknown option: --fury-model/u,
  );
  const source = await readFile(new URL("../src/mission-cli.mts", import.meta.url), "utf8");
  const start = source.indexOf("async function publishReviewed");
  const end = source.indexOf("\nfunction canonicalDigest", start);
  const consumer = source.slice(start, end);
  assert.doesNotMatch(consumer, /PrepareNextDependenciesV1|--fury-model|continueLegacy/u);
});

test("publish-reviewed decision rendering excludes Packet C internals in human and machine modes", () => {
  const hostRoot = "/private/tmp/secret-governed-root";
  const decision = {
    schemaVersion: 1,
    schemaId: "shield.prepared-review-publication-decision.v1",
    missionId: "mission:issue-311",
    subjectId: "github:RanSolo/shield-workspace/issue/311",
    missionRevisionId: "a".repeat(40),
    repository: {
      repositoryId: "RanSolo/shield-workspace",
      canonicalRoot: hostRoot,
      branch: "agent/issue-311",
      baseRevision: "b".repeat(40),
      headRevision: "c".repeat(40),
    },
    authorizedPaths: ["docs/missions/issue-311.md"],
    permittedEffects: ["review.branch.push", "review.pull_request.create_draft"],
    exclusions: ["merge", "deploy", "release"],
    remainingHumanGates: ["coulson.final_acceptance"],
    guidedReview: {
      planDigest: "SECRET_PLAN_DIGEST",
      bundleDigest: "SECRET_BUNDLE_DIGEST",
      forkDigest: "SECRET_FORK_DIGEST",
      choice: "yes",
      disposition: "completed",
      required: true,
      rationale: "SECRET_RAW_JOURNAL",
      method: "SECRET_COMMAND_TRANSCRIPT",
      plannedParticipantRelationship: "reviewer",
      coveredCriterionRefs: ["AC-1"],
      evidenceRequirements: ["SECRET_SIGNER_DATA"],
      gateOwnerSeatId: "coulson",
      sessionDigest: "SECRET_SESSION_DIGEST",
      participantId: "SECRET_PARTICIPANT",
      participantRelationship: "reviewer",
      participantBindingRef: "SECRET_BINDING",
      pinPurpose: "guided_review_and_publication",
    },
  };
  for (const human of [true, false]) {
    const rendered = renderFinalPublicationDecisionV1ForTest(decision, human);
    assert.match(rendered, /mission:issue-311/u);
    assert.match(rendered, /RanSolo\/shield-workspace/u);
    assert.doesNotMatch(rendered, new RegExp(hostRoot, "u"));
    assert.doesNotMatch(rendered, /SECRET_/u);
    assert.doesNotMatch(rendered, /canonicalRoot|authorizedPaths|permittedEffects|signingKeyRef|commandTranscript|journal/u);
  }
});

test("publish-reviewed actual stdout and stderr are concise, redacted, and classify exactly once", () => {
  const stdout = [];
  const stderr = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  try {
    emitFinalPublicationClassificationV1ForTest("supersedable", false);
    emitFinalPublicationTransitionV1ForTest({
      state: "published",
      classification: "consumed",
      missionId: "mission:issue-311",
      receipt: {
        canonicalRoot: "/private/tmp/secret-governed-root",
        rawJournal: "SECRET_RAW_JOURNAL",
        signer: "SECRET_SIGNER_DATA",
        commands: ["SECRET_COMMAND_TRANSCRIPT"],
      },
      prUrl: "https://github.com/RanSolo/shield-workspace/pull/311",
    }, false, false);
    const humanStdout = stdout.join("");
    assert.equal((humanStdout.match(/classification:/gu) ?? []).length, 1);
    assert.match(humanStdout, /action: published/u);
    assert.match(humanStdout, /pull\/311/u);
    assert.equal(stderr.join(""), "");
    assert.doesNotMatch(humanStdout, /private\/tmp|SECRET_|canonicalRoot|rawJournal|signer|commands/u);

    stdout.length = 0;
    stderr.length = 0;
    emitFinalPublicationClassificationV1ForTest("supersedable", true);
    emitFinalPublicationTransitionV1ForTest({
      state: "recovery_required",
      classification: "incompatible",
      missionId: "mission:issue-311",
      reason: "/private/tmp/secret-governed-root/.shield/journal.jsonl contains SECRET_RAW_JOURNAL",
      action: "Inspect the durable mission and publication receipts; do not retry an external effect.",
    }, true, false);
    const machineStdout = stdout.join("");
    const machineStderr = stderr.join("");
    assert.equal((machineStderr.match(/classification:/gu) ?? []).length, 1);
    assert.equal((machineStdout.match(/classification/gu) ?? []).length, 0);
    assert.doesNotMatch(`${machineStdout}${machineStderr}`, /private\/tmp|SECRET_|canonicalRoot|rawJournal|signer|commands/u);
    assert.deepEqual(JSON.parse(machineStdout), {
      schemaVersion: 1,
      state: "recovery_required",
      missionId: "mission:issue-311",
      stop: "Final publication could not continue safely.",
      action: "Inspect the durable mission and publication receipts; do not retry an external effect.",
    });
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
});

const COPILOT_FURY_CARD = `---
name: Fury
description: Review exact SHIELD plans and revisions for technical conformance.
argument-hint: Provide the reviewed artifact, exact revision, digests, and gate evidence.
target: vscode
user-invocable: true
disable-model-invocation: true
tools: [read, search, web]
---

You are Fury. Review only the exact plan and return a technical verdict with authority none.
`;

function journalPath(root, missionId) {
  return join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
}

function authority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId: `human:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef,
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

async function fixture(requireSimmons = false, repositoryTrustProfileId = "signed_human_gates") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-supervised-")));
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  await mkdir(join(root, ".shield"));
  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const simmons = authority("simmons");
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    repositoryTrustProfileId,
    coulsonBindingRef: coulson.binding.signingKeyRef,
    ...(repositoryTrustProfileId === "signed_human_gates"
      ? {
        fitzBindingRef: fitz.binding.signingKeyRef,
        ...(requireSimmons ? { simmonsBindingRef: simmons.binding.signingKeyRef } : {}),
      }
      : {}),
  });
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");
  await writeFile(join(root, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({
    schemaVersion: 1,
    bindings: repositoryTrustProfileId === "coulson_only_platform_review"
      ? [coulson.binding]
      : requireSimmons ? [coulson.binding, fitz.binding, simmons.binding] : [coulson.binding, fitz.binding],
  }, null, 2)}\n`);
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: requireSimmons ? "mission:cli-simmons" : "mission:cli",
    objective: "Exercise one local supervised mission with no external effects.",
    subjectId: "issue:39",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: false,
    },
    participants: ["hill", "daisy", "fury", "may", "coulson", "fitz", ...(requireSimmons ? ["simmons"] : [])]
      .map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "mission-brief" }],
    requireSimmons,
    createdAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" },
  });
  await writeFile(join(root, "mission-brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
  return { root, brief, coulson, fitz, simmons };
}

async function profileAwareFixture() {
  const current = await fixture();
  const missionId = "mission:cli-profile-aware";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Read one profile-aware mission without changing it.",
    subjectId: "issue:130",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: true,
    },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-29T15:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const entry = createProfileAwareMissionBegunEntry(brief, [current.coulson.binding, current.fitz.binding]);
  const journalRoot = join(current.root, ".shield", "journals");
  const path = journalPath(current.root, missionId);
  await mkdir(journalRoot, { recursive: true });
  await writeFile(path, `${JSON.stringify(entry)}\n`);
  return { ...current, brief, entry, journalPath: path };
}

async function nativeIssueIntakeFixture() {
  const current = await fixture();
  const configBytes = await readFile(join(current.root, ".shield", "config.json"), "utf8");
  const trustedBindingRegistryBytes = await readFile(join(current.root, ".shield", "trusted-human-bindings.json"), "utf8");
  const compiled = compileIssueIntakeV1({
    repositoryId: "RanSolo/fixture",
    issueObservation: {
      hostRepositoryId: "R_repo_372",
      repositoryNameWithOwner: "RanSolo/fixture",
      hostIssueId: "I_issue_372",
      issueNumber: 372,
      issueUrl: "https://github.com/RanSolo/fixture/issues/372",
      title: "Native issue-intake preparation",
      updatedAt: "2026-08-22T12:00:00Z",
      issueRevisionId: "rev:issue-372",
      acceptanceCriteria: { items: ["route authorization"] },
    },
    profileId: "standard",
    branch: "main",
    headRevision: "a".repeat(40),
    preparedWorktreeReceiptDigest: `sha256:${"b".repeat(64)}`,
    configBytes,
    trustedBindingRegistryBytes,
    trustedBindings: [current.coulson.binding, current.fitz.binding],
  });
  assert.equal(compiled.state, "valid");
  const missionId = compiled.value.brief.missionId;
  const missionJournalPath = journalPath(current.root, missionId);
  await mkdir(join(current.root, ".shield", "journals"), { recursive: true });
  const initialBytes = `${JSON.stringify(compiled.value.entry)}\n`;
  await writeFile(missionJournalPath, initialBytes);
  return { ...current, compiled: compiled.value, missionId, missionJournalPath, initialBytes };
}

async function runMissionCliCaptured(args, dependencies) {
  const stdout = [];
  const stderr = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  try {
    const status = await runMissionCli(args, dependencies);
    return { status, stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function profileBriefContent(missionId, profileId, requireSimmons) {
  const requiredExecutionGateRoleIds = profileId === "standard"
    ? ["coulson"]
    : profileId === "high_assurance" ? ["coulson", "fitz"] : ["coulson", "simmons"];
  const created = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Exercise repository trust profile admission without external evidence.",
    subjectId: "issue:216",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: true,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true,
    },
    participants: ["hill", "may", "coulson", ...(profileId === "high_assurance" ? ["fitz"] : []), ...(profileId === "product_sensitive" ? ["simmons"] : [])]
      .map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons,
    createdAt: { value: "2026-08-06T00:00:00Z", provenance: "hostTrusted" },
    profileId,
    profileVersion: 1,
    requiredExecutionGateRoleIds,
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...content } = created;
  return content;
}

function run(root, args, options = {}) {
  const env = { ...process.env, ...(options.env ?? {}) };
  for (const key of options.unsetEnv ?? []) delete env[key];
  return spawnSync(process.execPath, [...(options.nodeArgs ?? []), cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
    input: options.input,
  });
}

function fixedClockNodeArgs(timestamp) {
  const source = `const NativeDate = globalThis.Date; const fixed = ${JSON.stringify(timestamp)}; globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length === 0 ? [fixed] : args)); } static now() { return new NativeDate(fixed).getTime(); } };`;
  return ["--import", `data:text/javascript,${encodeURIComponent(source)}`];
}

function wheelsUpManifest(stderr) {
  const match = /SHIELD_WHEELS_UP_MANIFEST_BEGIN\n(?<manifest>[\s\S]*?)\nSHIELD_WHEELS_UP_MANIFEST_END/u.exec(stderr);
  assert.ok(match?.groups?.manifest, stderr);
  return JSON.parse(match.groups.manifest);
}

test("authorize-wheels-up rejects conflicting human and JSON output modes", () => {
  const result = run(packageRoot, [
    "mission", "authorize-wheels-up", "--mission-id", "mission:conflicting-output",
    "--input", "unused.json", "--human", "--json",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--human and --json are mutually exclusive/u);
});

test("prepare-reviewed-transition CLI accepts only canonical host inputs and returns the compositor result", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-reviewed-transition-cli-")));
  const calls = [];
  const output = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output.push(String(chunk)); return true; };
  try {
    const status = await runMissionCli([
      "mission", "prepare-reviewed-transition",
      "--mission-id", "mission:issue-346",
      "--transition-plan", "docs/missions/issue-346-transition-plan.json",
      "--fury-model", "model:fury",
      "--root", root,
      "--json",
    ], {
      prepareReviewedMissionTransition: async (input, dependencies) => {
        calls.push({ input, dependencies });
        return { state: "already_materialized", graphPath: join(root, ".shield", "graph.json"), graphId: "reviewed-transition-graph:test", graphDigest: "sha256:test" };
      },
    });
    assert.equal(status, 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.deepEqual(calls, [{
    input: {
      missionId: "mission:issue-346",
      repositoryRoot: root,
      transitionPlanPath: "docs/missions/issue-346-transition-plan.json",
      furyModel: "model:fury",
    },
    dependencies: {},
  }]);
  assert.equal(JSON.parse(output.join("")).state, "already_materialized");
  await assert.rejects(
    runMissionCli([
      "mission", "prepare-reviewed-transition", "--mission-id", "mission:issue-346",
      "--transition-plan", "docs/missions/issue-346-transition-plan.json", "--fury-model", "model:fury",
      "--dispatch-receipt-id", "receipt:caller", "--root", root,
    ], { prepareReviewedMissionTransition: async () => { throw new Error("must not be called"); } }),
    /Unknown option: --dispatch-receipt-id/u,
  );
});

const BOOTSTRAP_ARGS = [
  "mission", "signer", "bootstrap",
  "--seat", "coulson",
  "--binding-id", "binding:coulson",
  "--human-principal-id", "human:maintainer-1",
  "--passcode-stdin",
  "--json",
];
const BOOTSTRAP_COLOR_ENVIRONMENT = ["NO_COLOR", "FORCE_COLOR"];

const CREATION_FAILED = "creation_failed: Signer creation failed.";
const RECOVERY_REQUIRED = "recovery_required: Signer creation state is uncertain; inspect protected host signer storage before retrying.";

function fileMode(stats) {
  return stats.mode & 0o777;
}

function recomputeKeyRef(publicKeySpkiBase64) {
  return `ed25519:sha256:${createHash("sha256").update(Buffer.from(publicKeySpkiBase64, "base64")).digest("base64url")}`;
}

const SIGNER_INPUT = Object.freeze({
  seatId: "coulson",
  bindingId: "binding:coulson",
  humanPrincipalId: "human:maintainer-1",
});

function deterministicSignerDependencies(homeDirectory, keyPair = generateKeyPairSync("ed25519"), overrides = {}) {
  return {
    homeDirectory,
    generateKeyPair: () => keyPair,
    randomBytes: (size) => Buffer.alloc(size, 7),
    ...overrides,
  };
}

function expectedSignerFilename(keyPair) {
  const publicKeySpkiBase64 = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return `${recomputeKeyRef(publicKeySpkiBase64).replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, LANG: "C", LC_ALL: "C" } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const LEGACY_PUBLICATION_FURY_CARD = `---
name: Fury
description: Review exact SHIELD plans and revisions for technical conformance.
argument-hint: Provide the reviewed artifact and exact revision.
target: vscode
user-invocable: true
disable-model-invocation: true
tools: [read, search]
---

Review only the exact plan and return authority none.
`;

async function legacyPublicationCliFixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-issue-349-publication-cli-")));
  const source = join(parent, "source");
  const root = join(parent, "lane");
  await mkdir(source);
  runGit(source, ["init", "--quiet", "-b", "main"]);
  runGit(source, ["config", "user.email", "shield@example.invalid"]);
  runGit(source, ["config", "user.name", "SHIELD Fixture"]);
  runGit(source, ["remote", "add", "origin", "git@github.com:RanSolo/issue-349-publication-fixture.git"]);
  await mkdir(join(source, ".github", "agents"), { recursive: true });
  await writeFile(join(source, ".gitignore"), ".shield/\n");
  await writeFile(join(source, ".github", "agents", "fury.agent.md"), LEGACY_PUBLICATION_FURY_CARD);
  await writeFile(join(source, "package.json"), "{\"private\":true}\n");
  await writeFile(join(source, "outside-scope.ts"), "export const implemented = true;\n");
  runGit(source, ["add", ".gitignore", ".github/agents/fury.agent.md", "package.json", "outside-scope.ts"]);
  runGit(source, ["commit", "--quiet", "-m", "issue 349 legacy base"]);
  const baseRevision = runGit(source, ["rev-parse", "HEAD"]);
  runGit(source, ["worktree", "add", "--quiet", "-b", "issue-349-lane", root, "HEAD"]);

  const coulson = authority("coulson");
  const fitz = authority("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/issue-349-publication-fixture",
    coulsonBindingRef: coulson.binding.signingKeyRef,
    fitzBindingRef: fitz.binding.signingKeyRef,
  });
  await mkdir(join(source, ".shield"));
  await writeFile(join(source, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(source, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({
    schemaVersion: 1,
    bindings: [coulson.binding, fitz.binding],
  }, null, 2)}\n`);
  const prepared = await prepareWorktreeStateV1({ sourceRoot: await realpath(source), destinationRoot: await realpath(root) });
  assert.equal(prepared.state, "ready", JSON.stringify(prepared));

  const missionId = "mission:issue-349-publication-gate";
  const subjectId = "github:RanSolo/issue-349-publication-fixture/issue/349";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Continue the exact reviewed implementation into the existing publication gate.",
    subjectId,
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["coulson", "fitz", "fury", "hill", "may"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-19T12:00:00.000Z", provenance: "hostTrusted" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const begun = createProfileAwareMissionBegunEntry(brief, [coulson.binding, fitz.binding]);
  await mkdir(dirname(journalPath(root, missionId)), { recursive: true });
  await writeFile(journalPath(root, missionId), `${JSON.stringify(begun)}\n`);

  const planPath = "docs/missions/issue-349-approved-plan.md";
  await mkdir(join(root, "docs", "missions"), { recursive: true });
  await writeFile(join(root, planPath), "# Human-reviewed Issue #349 plan\n\nContinue through publication preparation.\n");
  const approvedRelativePaths = [".codex/agents/mack.toml", ".codex/config.toml", planPath, "src/implementation.mts"].sort((left, right) => left.localeCompare(right));
  runGit(root, ["add", "docs/missions"]);
  runGit(root, ["commit", "--quiet", "-m", "approved issue 349 legacy plan"]);

  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  let status;
  try {
    status = await executeAuthorizeWheelsUpV1({
      root: await realpath(root),
      config,
      missionId,
      intent: {
        baseRevision,
        modelId: "model:may-issue-349",
        reasoningRuntimeId: "runtime:issue-349-reasoner",
        toolExecutorId: "executor:issue-349-tool",
        approvedRelativePaths,
        approvedActionIds: ["action:issue-349:implement"],
        approvedEffectClasses: ["behavioral_implementation", "verification"],
        approvedEffectKeys: ["effect:issue-349:implementation"],
        approvedCapabilities: ["capability:edit"],
        validationCommandIds: ["validation:issue-349:test"],
        publicationPaths: [planPath],
      },
      timestamp: { value: "2026-08-19T12:01:00.000Z", provenance: "hostTrusted" },
      humanMode: false,
      promptOutput: { write() {} },
      dependencies: {
        renderDecision: () => "",
        readPasscode: async () => "test-only",
        signBatch: async (_binding, _passcode, payloads) => payloads.map((payload) => sign(null, Buffer.from(canonicalJson(payload)), coulson.privateKey).toString("base64")),
        appendBatchAtomic: appendProfileAwareMissionEntriesAtomicV1,
      },
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(status, 0);
  await mkdir(join(root, ".codex", "agents"), { recursive: true });
  await writeFile(join(root, ".codex", "agents", "mack.toml"), 'name = "mack"\n');
  await writeFile(join(root, ".codex", "config.toml"), 'reviewer = "mack"\n');
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "implementation.mts"), "export const implemented = true;\n");
  runGit(root, ["add", ".codex", "src/implementation.mts"]);
  runGit(root, ["commit", "--quiet", "-m", "authorized issue 349 implementation"]);
  const refreshed = await prepareOrRefreshWorktreeStateV2({ sourceRoot: await realpath(source), destinationRoot: await realpath(root) });
  assert.equal(refreshed.state, "refreshed", JSON.stringify(refreshed));
  return { root: await realpath(root), missionId, coulson };
}

async function fakeCopilotSdkNodeArgs(root) {
  const sdkRoot = join(root, ".shield", "tmp", "fake-copilot-sdk");
  const sdkEntry = join(sdkRoot, "dist", "index.mjs");
  const register = join(sdkRoot, "register.mjs");
  await mkdir(dirname(sdkEntry), { recursive: true });
  await writeFile(join(sdkRoot, "package.json"), `${JSON.stringify({ name: "@github/copilot-sdk", version: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION })}\n`);
  await writeFile(sdkEntry, `
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const event = (type, data) => ({ id: \`event:\${type}\`, parentId: null, timestamp: new Date().toISOString(), type, data });
export class CopilotClient {
  async start() {}
  async listModels() { return [{ id: "model:fury-issue-349" }]; }
  async createSession(config) {
    config.onEvent(event("session.start", { sessionId: config.sessionId, selectedModel: config.model, producer: ${JSON.stringify(COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID)}, copilotVersion: "1.0.79" }));
    return {
      rpc: { agent: { async getCurrent() { return { agent: { name: "fury" } }; } }, model: { async getCurrent() { return { modelId: config.model }; } }, tools: { async initializeAndValidate() { return {}; }, async getCurrentMetadata() { return { tools: [{ name: "read", description: "read" }, { name: "search", description: "search" }] }; } } },
      async sendAndWait() {
        const seedRoot = join(process.cwd(), ".shield", "audit", "legacy-reviewed-transition");
        const directories = await readdir(seedRoot);
        const seed = JSON.parse(await readFile(join(seedRoot, directories[0], "derivation-seed.json"), "utf8"));
        const plan = seed.carrier.transitionPlan;
        const repositoryRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const content = JSON.stringify({ schemaVersion: 2, contractVersion: ${JSON.stringify(COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2)}, authority: "none", reviewerSeatId: "fury", reviewedArtifactId: plan.id, reviewedArtifactRevision: plan.digest, verdict: "PASS", findings: [], reviewPhase: ${JSON.stringify(COPILOT_FURY_PLAN_REVIEW_PHASE_V2)}, repositoryRevision });
        const message = event("assistant.message", { content, model: config.model });
        config.onEvent(message);
        return message;
      },
      async disconnect() {},
    };
  }
  async stop() {}
  async forceStop() {}
}
export const RuntimeConnection = { forStdio() { return { kind: "stdio", path: undefined, args: undefined, env: undefined }; } };
`);
  await writeFile(register, `import { registerHooks } from "node:module"; registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "@github/copilot-sdk") return { url: ${JSON.stringify(new URL(`file://${sdkEntry}`).href)}, shortCircuit: true }; return nextResolve(specifier, context); } });\n`);
  return ["--import", register];
}

function evidenceGovernanceTarget(decision, resumeState = "approved") {
  if (decision === "approved") return "approved";
  if (decision === "paused") return "paused";
  if (decision === "resumed") return resumeState;
  if (decision === "cancelled") return "cancelled";
  return null;
}

function signedEvidence(authorityRecord, projection, requirement, decision, sequence, timestamp, resumeState = "approved") {
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:${authorityRecord.binding.seatId}:${sequence}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: "mission_plan",
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    seatId: authorityRecord.binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision,
    governanceTarget: authorityRecord.binding.seatId === "coulson" ? evidenceGovernanceTarget(decision, resumeState) : null,
    humanPrincipalId: authorityRecord.binding.humanPrincipalId,
    bindingId: authorityRecord.binding.bindingId,
    signingKeyRef: authorityRecord.binding.signingKeyRef,
    sourceRef: `fixture-signature:${sequence}`,
    timestamp: { value: timestamp, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authorityRecord.privateKey).toString("base64") };
}

async function writeEvidence(root, name, envelope) {
  const path = join(root, name);
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return name;
}

const PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE = "Passcode prompt setup failed.";
const PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE = "Passcode prompt cleanup failed.";

function createInteractivePromptFixture({
  syncData,
  failSetRawMode = false,
  failOnDataRegistration = false,
  failResume = false,
  failPromptWrite = false,
  failOff = false,
  failSetRawModeRestore = false,
  failPause = false,
  failNewline = false,
} = {}) {
  const stream = new EventEmitter();
  const calls = {
    setRawMode: 0,
    on: 0,
    off: 0,
    resume: 0,
    pause: 0,
    write: 0,
  };
  const output = [];
  const outputStream = {
    write(value) {
      calls.write += 1;
      output.push(value);
      if (failPromptWrite && value === "Passcode: ") throw new Error("Prompt write failure.");
      if (failNewline && value === "\n") throw new Error("Prompt write failure.");
      return true;
    },
  };
  const inputStream = {
    setRawMode(mode) {
      calls.setRawMode += 1;
      if (mode ? failSetRawMode : failSetRawModeRestore) throw new Error("setRawMode failure.");
    },
    on(eventName, listener) {
      calls.on += 1;
      if (failOnDataRegistration) throw new Error("on() registration failure.");
      stream.on(eventName, listener);
    },
    off(eventName, listener) {
      calls.off += 1;
      if (failOff) throw new Error("off() failure.");
      stream.off(eventName, listener);
    },
    resume() {
      calls.resume += 1;
      if (syncData) stream.emit("data", syncData);
      if (failResume) throw new Error("resume() failure.");
    },
    pause() {
      calls.pause += 1;
      if (failPause) throw new Error("pause() failure.");
    },
    emitData(chunk) {
      stream.emit("data", chunk);
    },
  };
  return { inputStream, outputStream, calls, output };
}

async function readJournalEntries(root, missionId) {
  const contents = await readFile(journalPath(root, missionId), "utf8");
  return contents
    .split("\n")
    .filter((entry) => entry.length > 0)
    .map((entry) => JSON.parse(entry));
}

function dispatchIdentityPayload(identity) {
  return {
    receiptId: identity.receiptId,
    dispatchId: identity.dispatchId,
    parentMissionId: identity.parentMissionId,
    parentMissionRevision: identity.parentMissionRevision,
    parentSessionId: identity.parentSessionId,
    repositoryRevision: identity.repositoryRevision,
    childTaskId: identity.childTaskId,
    childSessionId: identity.childSessionId,
    accountableSeatId: identity.accountableSeatId,
    repositoryId: identity.repositoryId,
    repositoryWorkspaceId: identity.repositoryWorkspaceId,
    subjectId: identity.subjectId,
    subjectRevision: identity.subjectRevision,
    artifactId: identity.artifactId,
    artifactRevision: identity.artifactRevision,
    configuredRuntime: identity.configuredRuntime,
    requestedRuntime: identity.requestedRuntime,
    toolExecution: identity.toolExecution,
    runtimeSelfReport: identity.runtimeSelfReport,
    runtimeHostObserved: identity.runtimeHostObserved,
    executorSelfReport: identity.executorSelfReport,
    executorHostObserved: identity.executorHostObserved,
  };
}

function canonicalDispatchEventLine(event) {
  const baseFields = [
    "schemaVersion", "contractVersion", "kind", "receiptId", "dispatchId", "parentMissionId", "parentMissionRevision",
    "repositoryRevision", "parentSessionId", "childTaskId", "childSessionId", "accountableSeatId", "repositoryId",
    "repositoryWorkspaceId", "subjectId", "subjectRevision", "artifactId", "artifactRevision", "configuredRuntime",
    "requestedRuntime", "toolExecution", "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved",
    "timestamp", "logSequence", "previousLogDigest", "lifecycleSequence", "previousLifecycleDigest",
  ];
  const keys = event.kind === "dispatch.started"
    ? [...baseFields, "entryDigest", "inputEvidenceRefs"]
    : [...baseFields, "entryDigest", "outputEvidenceRefs"];
  return JSON.stringify(Object.fromEntries(keys.filter((key) => Object.hasOwn(event, key)).map((key) => [key, event[key]])));
}

async function preparedPublicationCliFixture(approvedCapabilities = ["capability:issue-286:p2"]) {
  const current = await fixture(false, "coulson_only_platform_review");
  const missionId = "mission:cli-prepared-publication";
  const subjectId = "github:RanSolo/fixture/issue/286";
  const homeRoot = join(current.root, ".shield", "tmp", "prepared-home");
  await mkdir(homeRoot, { recursive: true });
  await signerTestOnly.createSigner(
    {
      seatId: "coulson",
      bindingId: current.coulson.binding.bindingId,
      humanPrincipalId: current.coulson.binding.humanPrincipalId,
    },
    "prepared-passcode",
    {
      homeDirectory: homeRoot,
      generateKeyPair: () => ({ privateKey: current.coulson.privateKey, publicKey: createPublicKey(current.coulson.privateKey) }),
    },
  );

  await writeFile(join(current.root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n/audit/\n/dispatch-receipts.jsonl\n");
  runGit(current.root, ["init", "-q"]);
  runGit(current.root, ["config", "user.email", "shield@example.invalid"]);
  runGit(current.root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(current.root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  runGit(current.root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(current.root, ["commit", "-qm", "prepared publication base"]);
  const baseRevision = runGit(current.root, ["rev-parse", "HEAD"]);
  await writeFile(join(current.root, "implementation.md"), "initial implementation\n");
  runGit(current.root, ["add", "implementation.md"]);
  runGit(current.root, ["commit", "-qm", "prepared publication initial head"]);
  const initialHeadRevision = runGit(current.root, ["rev-parse", "HEAD"]);

  const builtPlan = buildMissionTransitionPlanV1({
    missionId,
    subjectId,
    repositoryId: "RanSolo/fixture",
    planningBaseRevision: baseRevision,
    parentPlanCommit: baseRevision,
    parentPlanPath: "docs/missions/issue-286-prepared-publication-plan.md",
    parentPlanRawSha256: "a".repeat(64),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Authorize bounded prepared publication.",
    approvedRelativePaths: ["implementation.md"],
    publicationPaths: ["implementation.md"],
    approvedActionIds: ["action:issue-286:p2"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-286:p2"],
    approvedCapabilities,
    validationCommandIds: ["validation:issue-286:p2"],
    modelId: "model:prepared-may",
    reasoningRuntimeId: "runtime:prepared-may",
    toolExecutorId: "executor:prepared-tools",
    exclusions: [
      "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready",
      "merge", "deployment", "release", "final_acceptance",
    ],
  });
  assert.equal(builtPlan.state, "built", JSON.stringify(builtPlan));
  const plan = builtPlan.plan;
  const builtReview = buildMissionTransitionPlanReviewV1({
    schemaVersion: 1,
    contractVersion: "mission.transition-plan-review.v1",
    authority: "none",
    missionId,
    subjectId,
    repositoryId: plan.repositoryId,
    planningBaseRevision: plan.planningBaseRevision,
    parentPlanCommit: plan.parentPlanCommit,
    parentPlanPath: plan.parentPlanPath,
    parentPlanRawSha256: plan.parentPlanRawSha256,
    transitionPlanId: plan.id,
    transitionPlanDigest: plan.digest,
    verdict: "PASS",
    reviewerSeatId: "fury",
    reviewerRuntimeId: "runtime:fury:prepared",
    reviewerModelId: "model:fury:prepared",
    reviewerExecutorId: "executor:fury:prepared",
    reviewedArtifactId: plan.id,
    reviewedArtifactRevision: plan.digest,
  });
  assert.equal(builtReview.state, "built", JSON.stringify(builtReview));
  const review = builtReview.review;
  const identity = {
    receiptId: "receipt:fury:prepared-publication",
    dispatchId: "dispatch:fury:prepared-publication",
    parentMissionId: missionId,
    parentMissionRevision: "b".repeat(40),
    parentSessionId: "session:fury:prepared-publication",
    repositoryRevision: initialHeadRevision,
    childTaskId: "task:fury:prepared-publication",
    childSessionId: "session:fury:prepared-publication",
    accountableSeatId: "fury",
    repositoryId: plan.repositoryId,
    repositoryWorkspaceId: "workspace:prepared-publication",
    subjectId,
    subjectRevision: "c".repeat(40),
    artifactId: plan.id,
    artifactRevision: plan.digest,
    configuredRuntime: { kind: "runtime.configured", runtimeId: review.reviewerRuntimeId, model: review.reviewerModelId },
    requestedRuntime: { kind: "runtime.requested", runtimeId: review.reviewerRuntimeId, model: review.reviewerModelId },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:prepared" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: review.reviewerRuntimeId, model: review.reviewerModelId, evidenceRefs: ["host:fury:runtime"] },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed", executorId: review.reviewerExecutorId, evidenceRefs: ["host:fury:executor"] },
    timestamp: "2026-08-13T01:00:00.000Z",
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
  };
  const started = createSeatDispatchStartedEventV1({
    ...dispatchIdentityPayload(identity),
    timestamp: identity.timestamp,
    logSequence: 0,
    previousLogDigest: null,
    lifecycleSequence: 0,
    previousLifecycleDigest: null,
    inputEvidenceRefs: ["artifact:prepared-plan"],
  });
  const completed = createSeatDispatchLifecycleEventV1({
    ...dispatchIdentityPayload(identity),
    kind: "dispatch.completed",
    timestamp: "2026-08-13T01:00:01.000Z",
    logSequence: 1,
    previousLogDigest: started.entryDigest,
    lifecycleSequence: 1,
    previousLifecycleDigest: started.entryDigest,
    outputEvidenceRefs: [review.reviewId, review.reviewDigest, review.reviewedArtifactId, review.reviewedArtifactRevision],
  });
  await writeFile(join(current.root, ".shield", "dispatch-receipts.jsonl"), `${canonicalDispatchEventLine(started)}\n${canonicalDispatchEventLine(completed)}\n`);
  const materialized = await materializeReviewedMissionTransitionV1({
    missionId,
    repositoryRoot: current.root,
    transitionPlan: plan,
    reviewArtifact: review,
    expectedBinding: {
      schemaVersion: 1,
      missionId,
      subjectId,
      repositoryId: plan.repositoryId,
      planningBaseRevision: plan.planningBaseRevision,
      parentPlanCommit: plan.parentPlanCommit,
      parentPlanPath: plan.parentPlanPath,
      parentPlanRawSha256: plan.parentPlanRawSha256,
      transitionPlanId: plan.id,
      transitionPlanDigest: plan.digest,
      reviewedArtifactId: plan.id,
      reviewedArtifactRevision: plan.digest,
    },
    dispatchIdentity: identity,
  });
  assert.equal(materialized.state, "materialized", JSON.stringify(materialized));

  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Exercise caller-free prepared review publication.",
    subjectId,
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-13T01:01:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...briefContent } = brief;
  await writeFile(join(current.root, ".shield", "tmp", "prepared-brief.json"), `${JSON.stringify(briefContent, null, 2)}\n`);
  const begun = run(current.root, ["mission", "begin", "--profile-aware", "--brief", ".shield/tmp/prepared-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const initial = run(
    current.root,
    ["mission", "prepare-next", "--mission-id", missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "prepared-passcode\n", nodeArgs: fixedClockNodeArgs("2026-08-13T01:02:00Z") },
  );
  assert.equal(initial.status, 0, initial.stderr);
  await writeFile(join(current.root, "implementation.md"), "initial implementation\nprepared publication change\n");
  runGit(current.root, ["add", "implementation.md"]);
  runGit(current.root, ["commit", "-qm", "prepared publication descendant"]);
  return { ...current, missionId, homeRoot, plan, initialHeadRevision };
}

async function preparedGuidedReviewContext(prepared) {
  const selected = await resolvePreparedMissionTransitionV1({ missionId: prepared.missionId, repositoryRoot: prepared.root });
  assert.equal(selected.state, "publication_ready", JSON.stringify(selected));
  const exactRevision = selected.observation.headRevision;
  const driver = createGuidedReviewDriverReceiptV1({
    schemaVersion: 1, contractVersion: "guided.review.driver.v1", driverId: "driver:prepared-review", driverVersion: "v1",
    executorRef: "executor:prepared-review", exactRevision, environmentRef: "environment:prepared-review", status: "ready",
    capabilities: ["code_review"], scenarioRefs: ["scenario:prepared-review"], evidenceRefs: ["evidence:prepared-review"],
    effectClass: "read_only", detail: "Prepared Guided Review fixture.",
  });
  assert.equal(driver.state, "ready");
  const runtime = createGuidedReviewRuntimeHandoffV1({
    status: "ready", repositoryId: selected.observation.repositoryId, canonicalWorktreeRef: "worktree:prepared-review",
    branch: selected.observation.branch, exactRevision, builderSeatId: "may", builderBindingRef: "binding:may:prepared-review",
    reasoningRuntimeId: "runtime:may:prepared-review", toolExecutorId: "executor:prepared-review",
    dependencyBuildReceiptRef: "receipt:build:prepared-review", environmentRef: "environment:prepared-review",
    fixtureRef: "fixture:prepared-review", resourceBindingsRef: "bindings:prepared-review:redacted",
    endpointOwnershipRef: "ownership:prepared-review", portPreflightRef: "preflight:port:prepared-review",
    watcherPreflightRef: "preflight:watcher:prepared-review", externalEffectPolicyRef: "policy:no-external-effects",
    launchCommandRef: "command:prepared-review", healthProbeRef: "probe:prepared-review",
    reviewUrl: "http://127.0.0.1:4173/", teardownRef: "command:stop:prepared-review", recoveryRef: "recovery:prepared-review",
    driverReceipt: driver.value,
  });
  assert.equal(runtime.state, "ready");
  const plan = createGuidedReviewPlanV1({
    schemaVersion: 1, contractVersion: "guided.review.v1", planId: "plan:prepared-review", missionId: prepared.missionId,
    subjectId: selected.protectedGraph.transitionPlan.subjectId, kind: "backend", required: true,
    rationale: "The protected plan requires a completed exact-candidate code review.", method: "code_review",
    participantRelationship: "independent_reviewer", coveredCriterionRefs: ["AC-1"], evidenceRequirements: ["Named exact-revision observations."],
    exactRevision, gateOwnerSeatId: "coulson",
  });
  assert.equal(plan.state, "ready");
  const context = {
    plan: plan.value,
    acceptanceCriteria: [{ criterionId: "AC-1", text: "The exact candidate receives a named code review." }],
    runtimeHandoff: runtime.value,
    participantRelationship: "independent_reviewer",
    kind: "backend",
  };
  const contextPath = join(".shield", "tmp", "guided-review-context.json");
  await writeFile(join(prepared.root, contextPath), `${JSON.stringify(context, null, 2)}\n`);
  return { context, contextPath };
}

async function authorPreparedFuryRoute(prepared, routed) {
  const request = JSON.parse(await readFile(routed.paths.routeRequestPath, "utf8"));
  const ledgerPath = join(prepared.root, ".shield", "dispatch-receipts.jsonl");
  const existingBytes = await readFile(ledgerPath, "utf8");
  const existingEntries = existingBytes.trimEnd().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const route = createGuidedReviewRouteOverlayV1({
    schemaVersion: 1, contractVersion: "guided.review.route-overlay.v1", overlayId: "overlay:cli-prepared-review",
    missionId: request.missionId, subjectId: request.subjectId, repositoryId: request.repositoryId, branch: request.branch,
    exactRevision: request.exactRevision, protectedGraphId: request.protectedGraphId, protectedGraphDigest: request.protectedGraphDigest,
    templateId: request.templateId, templateVersion: request.templateVersion, templateDigest: request.templateDigest, kind: request.kind,
    rationale: "Fury selected the exact prepared publication route.", risks: ["Publication must remain exact-head."],
    acceptanceCriterionMappings: [{ criterionId: "AC-1", stepIds: ["intent"] }], inspectionPoints: [], overrides: [],
    furySeatId: "fury", furyBindingRef: "receipt:fury:cli-prepared-review",
    furyReasoningRuntimeId: "runtime:fury:cli-prepared-review", furyModelId: "model:fury:cli-prepared-review",
    furyToolExecutorId: "executor:fury:cli-prepared-review", identityAuthority: "claimed_only",
  });
  assert.equal(route.state, "ready", JSON.stringify(route));
  await writeFile(routed.paths.routeOverlayPath, canonicalJson(route.value), { mode: 0o600 });
  const common = {
    receiptId: route.value.furyBindingRef, dispatchId: "dispatch:fury:cli-prepared-review",
    parentMissionId: request.missionId, parentMissionRevision: request.missionRevisionId,
    parentSessionId: "session:hill:cli-prepared-review", childTaskId: "task:fury:cli-prepared-review",
    childSessionId: "session:fury:cli-prepared-review", accountableSeatId: "fury",
    repositoryId: request.repositoryId, repositoryWorkspaceId: existingEntries[0].repositoryWorkspaceId,
    repositoryRevision: request.exactRevision, subjectId: request.subjectId, subjectRevision: request.exactRevision,
    artifactId: request.requestId, artifactRevision: request.requestDigest,
    configuredRuntime: { kind: "runtime.configured", runtimeId: route.value.furyReasoningRuntimeId, model: route.value.furyModelId },
    requestedRuntime: { kind: "runtime.requested", runtimeId: route.value.furyReasoningRuntimeId, model: route.value.furyModelId },
    toolExecution: { kind: "tool.execution.requested", executorBindingRef: "binding:fury:cli-prepared-review" },
    runtimeSelfReport: { kind: "runtime.self_report.unavailable", reason: "not_reported" },
    runtimeHostObserved: { kind: "runtime.host_observed", runtimeId: route.value.furyReasoningRuntimeId,
      model: route.value.furyModelId, evidenceRefs: ["host:fury:runtime"] },
    executorSelfReport: { kind: "executor.self_report.unavailable", reason: "not_reported" },
    executorHostObserved: { kind: "executor.host_observed", executorId: route.value.furyToolExecutorId,
      evidenceRefs: ["host:fury:executor"] },
  };
  const previous = existingEntries.at(-1);
  const started = createSeatDispatchStartedEventV1({ ...common, inputEvidenceRefs: [request.requestId, request.requestDigest],
    timestamp: "2026-08-13T02:00:00.000Z", logSequence: existingEntries.length, previousLogDigest: previous?.entryDigest ?? null,
    lifecycleSequence: 0, previousLifecycleDigest: null });
  const completed = createSeatDispatchLifecycleEventV1({ ...common, kind: "dispatch.completed",
    outputEvidenceRefs: [request.requestId, request.requestDigest, route.value.overlayId, route.value.overlayDigest,
      request.protectedGraphId, request.protectedGraphDigest], timestamp: "2026-08-13T02:01:00.000Z",
    logSequence: existingEntries.length + 1, previousLogDigest: started.entryDigest, lifecycleSequence: 1, previousLifecycleDigest: started.entryDigest });
  await writeFile(ledgerPath, `${existingBytes}${canonicalDispatchEventLine(started)}\n${canonicalDispatchEventLine(completed)}\n`, { mode: 0o600 });
  return { request, overlay: route.value, started, completed };
}

async function passCurrentGuidedReviewStep(prepared, paths, minute) {
  const result = run(prepared.root, ["guided-review", "decide", "--playbook", paths.playbookPath,
    "--session", paths.sessionPath, "--decision-id", `decision:cli-prepared:${minute}`,
    "--disposition", "pass", "--observation", `Observed exact candidate question ${minute}.`,
    "--evidence-refs", "evidence:cli-prepared-review", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(await readFile(paths.sessionPath, "utf8"));
}

async function runPreparedYesAtDecision(prepared, mutate) {
  const child = spawn(process.execPath, [cli, "mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
  { cwd: prepared.root, env: { ...process.env, HOME: prepared.homeRoot }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let mutation = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (mutation === null && stderr.includes("SHIELD_REVIEW_PUBLICATION_DECISION_END")) {
      mutation = Promise.resolve(mutate()).then(() => child.stdin.end("prepared-passcode\n"));
    }
  });
  const status = await new Promise((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  if (mutation !== null) await mutation;
  return { status, stdout, stderr, mutated: mutation !== null };
}

test("packed CLI path completes execution while Fitz readiness remains waiting", async () => {
  const { root, brief, coulson, fitz } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.governance.state, "proposed");
  assert.equal(projection.readiness.execute.state, "waiting");

  const authorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const approvalPath = await writeEvidence(root, "coulson-approve.json", signedEvidence(
    coulson, projection, authorization, "approved", 1, "2020-01-01T00:01:00Z",
  ));
  const approved = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", approvalPath, "--json"]);
  assert.equal(approved.status, 0, approved.stderr);
  projection = JSON.parse(approved.stdout);
  assert.equal(projection.governance.state, "approved");

  const first = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).projection.execution.status, "running");
  const second = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(second.status, 0, second.stderr);
  projection = JSON.parse(second.stdout).projection;
  assert.equal(projection.execution.status, "completed");
  assert.equal(projection.readiness.accept.state, "waiting");
  assert.equal(projection.readiness.accept.requirementStatuses[0].requiredSeatId, "fitz");

  const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
  const beforeNoop = await readFile(journalPath, "utf8");
  const noop = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(noop.status, 0, noop.stderr);
  assert.equal(JSON.parse(noop.stdout).outcome, "completed-noop");
  assert.equal(await readFile(journalPath, "utf8"), beforeNoop);

  const fitzRequirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "technical_review");
  const future = new Date(Date.now() + 60_000).toISOString();
  const fitzPath = await writeEvidence(root, "fitz-review.json", signedEvidence(fitz, projection, fitzRequirement, "approved", 4, future));
  const recorded = run(root, ["evidence", "record", "--mission-id", brief.missionId, "--evidence", fitzPath, "--json"]);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).readiness.accept.state, "ready");

  const beforeReadOnlyCommands = await readFile(journalPath, "utf8");
  const status = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).entries.length, 5);
  assert.equal(await readFile(journalPath, "utf8"), beforeReadOnlyCommands);
});

test("packed CLI status and report replay schema 9 without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const before = await readFile(journalPath, "utf8");
  const status = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  const projection = JSON.parse(status.stdout);
  assert.equal(projection.schemaVersion, 9);
  assert.equal(projection.authorization, "waiting");
  assert.equal(projection.readiness.execute, "waiting");

  const human = run(root, ["mission", "status", "--mission-id", brief.missionId]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Profile: standard@1/u);
  assert.match(human.stdout, /Next journal sequence: 1/u);

  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(report.status, 0, report.stderr);
  const parsedReport = JSON.parse(report.stdout);
  assert.deepEqual(parsedReport.entries, [entry]);
  assert.equal(parsedReport.projection.schemaVersion, 9);
  assert.equal(await readFile(journalPath, "utf8"), before);
});

test("Coulson-only repository admits only consistent standard profile missions and freezes one binding", async () => {
  const { root, coulson, fitz, simmons } = await fixture(false, "coulson_only_platform_review");
  const standard = profileBriefContent("mission:coulson-only-standard", "standard", false);
  await writeFile(join(root, "standard.json"), `${JSON.stringify(standard, null, 2)}\n`);
  const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", "standard.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const projection = JSON.parse(begun.stdout).projection;
  assert.deepEqual(projection.requirements.map(({ requiredRoleId }) => requiredRoleId), ["coulson", "coulson"]);
  const entries = await readJournalEntries(root, standard.missionId);
  assert.deepEqual(entries[0].payload.trustedBindings.map(({ seatId }) => seatId), ["coulson"]);
  assert.equal(entries[0].payload.requirements.some(({ requiredRoleId }) => requiredRoleId === "fitz" || requiredRoleId === "simmons"), false);

  const frozenBytes = await readFile(journalPath(root, standard.missionId), "utf8");
  for (const [seat, evidenceKind] of [[fitz, "technical_review"], [simmons, "product_domain_review"]]) {
    const timestamp = { value: "2026-08-06T00:01:00Z", provenance: "humanRecorded" };
    const payload = {
      schemaVersion: 1,
      evidenceId: `evidence:${seat.binding.seatId}:unsolicited`,
      requirementId: `req:${standard.missionId}:absent:${evidenceKind}`,
      missionId: standard.missionId,
      revisionId: projection.brief.revisionId,
      seatId: seat.binding.seatId,
      evidenceKind,
      decision: "approved",
      humanPrincipalId: seat.binding.humanPrincipalId,
      bindingId: seat.binding.bindingId,
      signingKeyRef: seat.binding.signingKeyRef,
      sourceRef: `fixture-signature:${seat.binding.seatId}:unsolicited`,
      timestamp,
      journalSequence: projection.lastSequence + 1,
    };
    const envelope = {
      payload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), seat.privateKey).toString("base64"),
    };
    assert.equal(verify(
      null,
      Buffer.from(canonicalJson(payload)),
      createPublicKey({ key: Buffer.from(seat.binding.publicKeySpkiBase64, "base64"), format: "der", type: "spki" }),
      Buffer.from(envelope.signatureBase64, "base64"),
    ), true);
    const candidate = {
      schemaVersion: 9,
      entryId: `entry:${standard.missionId}:${projection.lastSequence + 1}`,
      missionId: standard.missionId,
      sequence: projection.lastSequence + 1,
      type: "evidence.recorded",
      timestamp,
      payload: { evidence: envelope },
    };
    assert.equal(projection.requirements.some(({ evidenceKind: kind }) => kind === evidenceKind), false);
    assert.equal(candidate.sequence, 1);
    assert.equal(candidate.payload.evidence.payload.journalSequence, candidate.sequence);
    const replayRejected = replayProfileAwareMissionJournal([...entries, candidate]);
    assert.equal(replayRejected.state, "invalid");
    assert.equal(replayRejected.code, "duplicate_evidence");
    assert.match(replayRejected.errors.join(" "), /duplicate or ambiguous/u);
    const appendRejected = await appendProfileAwareMissionEntryV1({
      repositoryRoot: root,
      configuredJournalPath: ".shield/journals",
      missionId: standard.missionId,
      entry: candidate,
    });
    assert.equal(appendRejected.state, "invalid");
    assert.equal(appendRejected.code, "duplicate_evidence");
    assert.equal(await readFile(journalPath(root, standard.missionId), "utf8"), frozenBytes);
    const unchanged = JSON.parse(run(root, ["mission", "status", "--mission-id", standard.missionId, "--json"]).stdout);
    assert.equal(unchanged.requirements.some(({ requiredRoleId }) => requiredRoleId === seat.binding.seatId), false);
    assert.equal(unchanged.evidence.some(({ seatId }) => seatId === seat.binding.seatId), false);
  }

  const signedConfig = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: coulson.binding.signingKeyRef,
    fitzBindingRef: fitz.binding.signingKeyRef,
  });
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(signedConfig));
  const replayed = run(root, ["mission", "status", "--mission-id", standard.missionId, "--json"]);
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.deepEqual(JSON.parse(replayed.stdout).requirements, projection.requirements);
});

test("repository mission admission failures create no journal", async () => {
  const coulsonOnly = await fixture(false, "coulson_only_platform_review");
  const blocked = [
    [profileBriefContent("mission:coulson-only-high", "high_assurance", false), "repository_trust_profile_incompatible"],
    [profileBriefContent("mission:coulson-only-product", "product_sensitive", true), "repository_trust_profile_incompatible"],
    [profileBriefContent("mission:coulson-only-inconsistent", "standard", true), "repository_mission_profile_inconsistent"],
  ];
  for (const [brief, code] of blocked) {
    const path = `${brief.missionId.split(":").at(-1)}.json`;
    await writeFile(join(coulsonOnly.root, path), `${JSON.stringify(brief)}\n`);
    const result = run(coulsonOnly.root, ["mission", "begin", "--profile-aware", "--brief", path, "--json"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(code, "u"));
    if (code === "repository_mission_profile_inconsistent") {
      assert.doesNotMatch(result.stderr, /Profile-aware brief requireSimmons is inconsistent with its profile or participants/u);
    }
    await assert.rejects(lstat(journalPath(coulsonOnly.root, brief.missionId)), { code: "ENOENT" });
  }

  const legacy = run(coulsonOnly.root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /repository_trust_profile_incompatible/u);
  await assert.rejects(lstat(journalPath(coulsonOnly.root, coulsonOnly.brief.missionId)), { code: "ENOENT" });

  for (const [profileId, requireSimmons] of [["standard", true], ["high_assurance", true], ["product_sensitive", false]]) {
    const signed = await fixture(profileId === "product_sensitive");
    const brief = profileBriefContent(`mission:signed-inconsistent-${profileId}`, profileId, requireSimmons);
    await writeFile(join(signed.root, "brief.json"), `${JSON.stringify(brief)}\n`);
    const result = run(signed.root, ["mission", "begin", "--profile-aware", "--brief", "brief.json", "--json"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /repository_mission_profile_inconsistent/u);
    await assert.rejects(lstat(journalPath(signed.root, brief.missionId)), { code: "ENOENT" });
  }
});

test("signed-human repository keeps high-assurance and product-sensitive profile admission", async () => {
  for (const [profileId, requireSimmons, expectedBindings] of [
    ["high_assurance", false, ["coulson", "fitz"]],
    ["product_sensitive", true, ["coulson", "fitz", "simmons"]],
  ]) {
    const { root } = await fixture(requireSimmons);
    const brief = profileBriefContent(`mission:signed-${profileId}`, profileId, requireSimmons);
    await writeFile(join(root, "brief.json"), `${JSON.stringify(brief)}\n`);
    const result = run(root, ["mission", "begin", "--profile-aware", "--brief", "brief.json", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const entries = await readJournalEntries(root, brief.missionId);
    assert.deepEqual(entries[0].payload.trustedBindings.map(({ seatId }) => seatId), expectedBindings);
  }
});

test("supported profile-aware CLI workflow records three independent signed transitions and survives restart replay", async () => {
  const { root } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });
  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(root, ["add", "package.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(root, ["commit", "-qm", "fixture base"]);
  const baseRevision = runGit(root, ["rev-parse", "HEAD"]);
  await writeFile(join(root, "operator.txt"), "operator workflow\n");
  runGit(root, ["add", "operator.txt"]);
  runGit(root, ["commit", "-qm", "fixture head"]);
  const headRevision = runGit(root, ["rev-parse", "HEAD"]);

  const created = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: "mission:cli-profile-workflow",
    objective: "Prove one supported schema-9 signing workflow without model invocation.",
    subjectId: "issue:187",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-04T00:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...briefContent } = created;
  await writeFile(join(root, "profile-brief.json"), `${JSON.stringify(briefContent, null, 2)}\n`);
  await writeFile(join(root, "wheels-up.json"), `${JSON.stringify({
    baseRevision,
    modelId: "model:gemma-4-31b",
    approvedRelativePaths: ["packages/shield-team-system"],
    approvedActionIds: ["action:implement"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:implementation", "effect:validation"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:test"],
  }, null, 2)}\n`);
  await writeFile(join(root, "may-binding.json"), `${JSON.stringify({
    reasoningRuntimeId: "runtime:lm-studio",
    toolExecutorId: "executor:shield-host",
  }, null, 2)}\n`);

  const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", "profile-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  assert.equal(JSON.parse(begun.stdout).projection.schemaVersion, 9);
  let durableBytes = await readFile(journalPath(root, created.missionId), "utf8");

  const badPasscode = run(
    root,
    ["mission", "authorize", "--mission-id", created.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "wrong-passcode\n" },
  );
  assert.equal(badPasscode.status, 1);
  assert.doesNotMatch(badPasscode.stderr, /wrong-passcode|privateKey|ciphertext|saltBase64|ivBase64|tagBase64/iu);
  assert.equal(badPasscode.stderr.includes(homeRoot), false);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);

  const prematureWheels = run(
    root,
    ["mission", "wheels-up", "--mission-id", created.missionId, "--input", "wheels-up.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(prematureWheels.status, 1, prematureWheels.stderr);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);

  const authorize = run(
    root,
    ["mission", "authorize", "--mission-id", created.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorize.status, 0, authorize.stderr);
  assert.equal(JSON.parse(authorize.stdout).authorization, "authorized");
  durableBytes = await readFile(journalPath(root, created.missionId), "utf8");

  const overbroadWheels = JSON.parse(await readFile(join(root, "wheels-up.json"), "utf8"));
  overbroadWheels.repositoryId = "caller:forbidden";
  await writeFile(join(root, "overbroad-wheels-up.json"), `${JSON.stringify(overbroadWheels)}\n`);
  const rejectedOverbroad = run(
    root,
    ["mission", "wheels-up", "--mission-id", created.missionId, "--input", "overbroad-wheels-up.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(rejectedOverbroad.status, 1);
  assert.match(rejectedOverbroad.stderr, /must contain exactly/u);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);

  await writeFile(join(root, "non-ancestor-wheels-up.json"), `${JSON.stringify({
    ...JSON.parse(await readFile(join(root, "wheels-up.json"), "utf8")),
    baseRevision: "cccccccccccccccccccccccccccccccccccccccc",
  })}\n`);
  const rejectedBase = run(
    root,
    ["mission", "wheels-up", "--mission-id", created.missionId, "--input", "non-ancestor-wheels-up.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(rejectedBase.status, 1);
  assert.match(rejectedBase.stderr, /must exist and be an ancestor/u);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);

  const wheels = run(
    root,
    ["mission", "wheels-up", "--mission-id", created.missionId, "--input", "wheels-up.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(wheels.status, 0, wheels.stderr);
  assert.equal(JSON.parse(wheels.stdout).implementationAuthorityState, "authorized");
  durableBytes = await readFile(journalPath(root, created.missionId), "utf8");

  const configPath = join(root, ".shield", "config.json");
  const configBytes = await readFile(configPath, "utf8");
  const changedConfig = { ...JSON.parse(configBytes), repositoryId: "RanSolo/changed-repository" };
  await writeFile(configPath, `${JSON.stringify(changedConfig, null, 2)}\n`);
  const rejectedRepositoryId = run(
    root,
    ["mission", "bind", "--mission-id", created.missionId, "--input", "may-binding.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(rejectedRepositoryId.status, 1);
  assert.match(rejectedRepositoryId.stderr, /Repository ID no longer matches Wheels Up authority/u);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);
  await writeFile(configPath, configBytes);

  const originalBranch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  runGit(root, ["switch", "-q", "-c", "fixture/stale-binding-host"]);
  const rejectedBranch = run(
    root,
    ["mission", "bind", "--mission-id", created.missionId, "--input", "may-binding.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(rejectedBranch.status, 1);
  assert.match(rejectedBranch.stderr, /root, branch, or HEAD no longer matches/u);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);
  runGit(root, ["switch", "-q", originalBranch]);

  await writeFile(join(root, "colliding-may-binding.json"), `${JSON.stringify({
    reasoningRuntimeId: "model:gemma-4-31b",
    toolExecutorId: "executor:shield-host",
  })}\n`);
  const rejectedBinding = run(
    root,
    ["mission", "bind", "--mission-id", created.missionId, "--input", "colliding-may-binding.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(rejectedBinding.status, 1);
  assert.match(rejectedBinding.stderr, /must be mutually distinct/u);
  assert.equal(await readFile(journalPath(root, created.missionId), "utf8"), durableBytes);

  const bound = run(
    root,
    ["mission", "bind", "--mission-id", created.missionId, "--input", "may-binding.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(bound.status, 0, bound.stderr);
  const projection = JSON.parse(bound.stdout);
  assert.equal(projection.lastSequence, 3);
  assert.equal(projection.activeRuntimeBindings.length, 1);
  assert.equal(projection.activeRuntimeBindings[0].binding.reasoningRuntimeId, "runtime:lm-studio");
  assert.equal(projection.activeRuntimeBindings[0].binding.toolExecutorId, "executor:shield-host");
  assert.equal(projection.activeRuntimeBindings[0].modelId, "model:gemma-4-31b");
  assert.equal(projection.activeRuntimeBindings[0].headRevision, headRevision);

  const entries = await readJournalEntries(root, created.missionId);
  assert.deepEqual(entries.map(({ type }) => type), [
    "mission.begun", "governance.decided", "implementation.authorized", "runtime.binding_recorded",
  ]);
  assert.equal(new Set(entries.slice(1).map(({ payload }) => payload.evidence?.signatureBase64 ?? payload.authority?.signatureBase64 ?? payload.authorization?.signatureBase64)).size, 3);
  const restarted = run(root, ["mission", "status", "--mission-id", created.missionId, "--json"]);
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), projection);
});

test("authorize-wheels-up canonically orders mixed-case publication paths and has stable fresh-process digests", async () => {
  const { root } = await fixture();
  const homeRoot = join(root, ".shield", "tmp", "one-passcode-home");
  await mkdir(homeRoot, { recursive: true });
  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "one-passcode-secret\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  runGit(root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(root, ["commit", "-qm", "one-passcode base"]);
  const baseRevision = runGit(root, ["rev-parse", "HEAD"]);
  const publicationPaths = ["Z-upper-implementation.md", "a-lower-implementation.md", "Ω-implementation.md", "中-implementation.md"];
  for (const path of publicationPaths) await writeFile(join(root, path), `bounded initial draft: ${path}\n`);
  runGit(root, ["add", "--", ...publicationPaths]);
  runGit(root, ["commit", "-qm", "one-passcode head"]);
  const headRevision = runGit(root, ["rev-parse", "HEAD"]);
  const observedPublicationPaths = runGit(root, ["diff", "--name-only", "--no-renames", "-z", baseRevision, headRevision, "--"])
    .split("\0").filter(Boolean).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  assert.deepEqual(observedPublicationPaths, publicationPaths);

  const missionId = "mission:authorize-wheels-up";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Authorize one bounded implementation and initial draft publication.",
    subjectId: "issue:203",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-06T00:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const temporaryRoot = join(root, ".shield", "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const { revisionId: _revisionId, ...briefContent } = brief;
  await writeFile(join(temporaryRoot, "one-passcode-brief.json"), `${JSON.stringify(briefContent, null, 2)}\n`);
  await writeFile(join(temporaryRoot, "one-passcode-input.json"), `${JSON.stringify({
    baseRevision,
    modelId: "model:bounded-may",
    approvedRelativePaths: ["implementation.md"],
    approvedActionIds: ["action:implement"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:implementation", "effect:validation"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:test"],
    reasoningRuntimeId: "runtime:bounded-reasoner",
    toolExecutorId: "executor:bounded-tools",
    publicationPaths,
  }, null, 2)}\n`);

  const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", ".shield/tmp/one-passcode-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  assert.equal(runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  const before = await readFile(journalPath(root, missionId), "utf8");

  const validInput = JSON.parse(await readFile(join(temporaryRoot, "one-passcode-input.json"), "utf8"));
  await writeFile(join(temporaryRoot, "one-passcode-hostile.json"), `${JSON.stringify({ ...validInput, authorityId: "caller:forbidden" })}\n`);
  const hostile = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-hostile.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "one-passcode-secret\n" },
  );
  assert.equal(hostile.status, 1);
  assert.doesNotMatch(hostile.stderr, /SHIELD_WHEELS_UP_MANIFEST_BEGIN/u);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), before);

  for (const [name, paths] of [
    ["missing", publicationPaths.slice(0, -1)],
    ["extra", [...publicationPaths.slice(0, 2), "z-extra.md", ...publicationPaths.slice(2)]],
  ]) {
    const inputPath = join(temporaryRoot, `one-passcode-${name}.json`);
    await writeFile(inputPath, `${JSON.stringify({ ...validInput, publicationPaths: paths })}\n`);
    const closedSetMismatch = run(
      root,
      ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", `.shield/tmp/one-passcode-${name}.json`, "--passcode-stdin", "--json"],
      { env: { HOME: homeRoot }, input: "one-passcode-secret\n" },
    );
    assert.equal(closedSetMismatch.status, 1, name);
    assert.match(closedSetMismatch.stderr, /must exactly equal/u, name);
    assert.equal(await readFile(journalPath(root, missionId), "utf8"), before, name);
  }

  const wrongPasscode = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "wrong-passcode\n" },
  );
  assert.equal(wrongPasscode.status, 1);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), before);

  const missingHome = join(root, ".shield", "tmp", "missing-signer-home");
  await mkdir(missingHome, { recursive: true });
  const missingSigner = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--json"],
    { env: { HOME: missingHome }, input: "one-passcode-secret\n" },
  );
  assert.equal(missingSigner.status, 1);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), before);

  const signerDirectory = join(homeRoot, ".shield", "signers");
  const signerFiles = await readdir(signerDirectory);
  assert.equal(signerFiles.length, 1);
  const signerPath = join(signerDirectory, signerFiles[0]);
  const signerBytes = await readFile(signerPath, "utf8");
  const mismatchedSigner = { ...JSON.parse(signerBytes), signingKeyRef: `ed25519:sha256:${"A".repeat(43)}` };
  await writeFile(signerPath, `${JSON.stringify(mismatchedSigner, null, 2)}\n`);
  const keyMismatch = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "one-passcode-secret\n" },
  );
  assert.equal(keyMismatch.status, 1);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), before);
  await writeFile(signerPath, signerBytes);

  const fixedTimestamp = "2026-08-07T12:34:56.000Z";
  const humanResult = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--human"],
    {
      env: { HOME: homeRoot },
      input: "one-passcode-secret\n",
      nodeArgs: fixedClockNodeArgs(fixedTimestamp),
    },
  );
  assert.equal(humanResult.status, 0, humanResult.stderr);
  assert.match(humanResult.stdout, /APPROVAL NEEDED — mission:authorize-wheels-up/u);
  assert.match(humanResult.stdout, /Enter your passcode to authorize May to:/u);
  assert.match(humanResult.stdout, /AUTHORIZED — mission:authorize-wheels-up/u);
  assert.match(humanResult.stdout, /Coulson: final acceptance/u);
  assert.match(humanResult.stdout, /Fitz: technical review/u);
  assert.doesNotMatch(humanResult.stdout, /manifestDigest|receiptDigest|sha256|startingJournalSequence/u);
  assert.doesNotMatch(humanResult.stderr, /SHIELD_WHEELS_UP_MANIFEST_BEGIN/u);
  const humanJournal = await readFile(journalPath(root, missionId), "utf8");
  await writeFile(journalPath(root, missionId), before);

  const firstResult = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--json"],
    {
      env: { HOME: homeRoot, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
      input: "one-passcode-secret\n",
      nodeArgs: fixedClockNodeArgs(fixedTimestamp),
    },
  );
  assert.equal(firstResult.status, 0, firstResult.stderr);
  const firstJournal = await readFile(journalPath(root, missionId), "utf8");
  assert.equal(firstJournal, humanJournal);
  await writeFile(journalPath(root, missionId), before);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), before);

  const secondResult = run(
    root,
    ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", ".shield/tmp/one-passcode-input.json", "--passcode-stdin", "--json"],
    {
      env: { HOME: homeRoot, LANG: "sv_SE.UTF-8", LC_ALL: "sv_SE.UTF-8" },
      input: "one-passcode-secret\n",
      nodeArgs: fixedClockNodeArgs(fixedTimestamp),
    },
  );
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.equal(secondResult.stderr.match(/SHIELD_WHEELS_UP_MANIFEST_BEGIN/gu)?.length, 1);
  assert.equal(secondResult.stderr.match(/SHIELD_WHEELS_UP_MANIFEST_END/gu)?.length, 1);
  const firstManifest = wheelsUpManifest(firstResult.stderr);
  const secondManifest = wheelsUpManifest(secondResult.stderr);
  const firstReceipt = JSON.parse(firstResult.stdout);
  const receipt = JSON.parse(secondResult.stdout);
  assert.equal(firstManifest.manifestDigest, secondManifest.manifestDigest);
  assert.equal(firstReceipt.receiptDigest, receipt.receiptDigest);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), firstJournal);
  assert.deepEqual(secondManifest.repository.changedPaths, publicationPaths);
  assert.deepEqual(secondManifest.publicationAuthority.authorizedPaths, publicationPaths);
  assert.deepEqual(receipt.publicationScope.authorizedPaths, publicationPaths);
  assert.equal(receipt.schemaId, "shield.wheels-up-authorization-receipt.v1");
  assert.equal(receipt.baseRevision, baseRevision);
  assert.equal(receipt.headRevision, headRevision);
  assert.equal(receipt.startingJournalSequence, 0);
  assert.equal(receipt.endingJournalSequence, 4);
  assert.deepEqual(receipt.publicationScope.permittedEffects, ["review.branch.push", "review.pull_request.create_draft"]);
  assert.ok(receipt.exclusions.includes("review.comment.publish"));
  assert.ok(receipt.exclusions.includes("review.pull_request.update_draft"));
  assert.equal(receipt.constituents.length, 4);

  const after = await readFile(journalPath(root, missionId), "utf8");
  assert.notEqual(after, before);
  const entries = after.trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(entries.map(({ type }) => type), [
    "mission.begun", "governance.decided", "implementation.authorized",
    "runtime.binding_recorded", "review.publication_authorized",
  ]);
  const publicKey = createPublicKey({ key: Buffer.from(entries[0].payload.trustedBindings[0].publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
  const envelopes = [entries[1].payload.evidence, entries[2].payload.authority, entries[3].payload.authorization, entries[4].payload.authorization];
  for (const envelope of envelopes) {
    assert.equal(verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, Buffer.from(envelope.signatureBase64, "base64")), true);
  }
  const restarted = run(root, ["mission", "status", "--mission-id", missionId, "--json"]);
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.equal(JSON.parse(restarted.stdout).lastSequence, 4);
});

async function daisySignerFreshnessFixture() {
  const { root } = await fixture();
  const homeRoot = join(root, ".shield", "tmp", "daisy-signer-home");
  await mkdir(homeRoot, { recursive: true });
  const passcode = "daisy-snapshot-passcode";
  const setup = run(root, [
    "mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json",
  ], { env: { HOME: homeRoot }, input: `${passcode}\n` });
  assert.equal(setup.status, 0, setup.stderr);

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  runGit(root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(root, ["commit", "-qm", "Daisy signer freshness fixture"]);

  const missionId = "mission:test:daisy-signer-freshness";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Prove exact signer freshness for bounded Daisy coordination.",
    subjectId: "issue:test:daisy-signer-freshness",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: true,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true,
    },
    participants: ["hill", "daisy", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-10T12:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...briefContent } = brief;
  const artifactRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-daisy-snapshot-artifacts-")));
  const inputPath = join(root, ".shield", "tmp", "daisy-snapshot-input.json");
  const briefPath = join(root, ".shield", "tmp", "daisy-snapshot-brief.json");
  await writeFile(briefPath, `${JSON.stringify(briefContent, null, 2)}\n`);
  await writeFile(inputPath, `${JSON.stringify({
    effectKey: "effect:test:daisy-snapshot-read",
    approvedReadRoots: [await realpath(root)],
    durableArtifactRoot: artifactRoot,
    runtimeId: "runtime:test:daisy-snapshot",
    modelId: "model:test:daisy-snapshot",
    executorId: "executor:test:daisy-snapshot",
  }, null, 2)}\n`);
  const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", briefPath, "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const authorized = run(root, [
    "mission", "authorize", "--mission-id", missionId, "--passcode-stdin", "--json",
  ], { env: { HOME: homeRoot }, input: `${passcode}\n` });
  assert.equal(authorized.status, 0, authorized.stderr);
  const signerDirectory = join(homeRoot, ".shield", "signers");
  const signerFiles = await readdir(signerDirectory);
  assert.equal(signerFiles.length, 1);
  return {
    root, homeRoot, passcode, missionId, inputPath,
    journalPath: journalPath(root, missionId),
    signerPath: join(signerDirectory, signerFiles[0]),
  };
}

async function runDaisySignerRewrite(current, mutate) {
  const child = spawn(process.execPath, [
    cli, "mission", "authorize-daisy-coordination", "--mission-id", current.missionId,
    "--input", current.inputPath, "--passcode-stdin", "--json",
  ], { cwd: current.root, env: { ...process.env, HOME: current.homeRoot }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let mutation = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (mutation === null && stderr.includes("SHIELD_DAISY_COORDINATION_MANIFEST_END")) {
      mutation = Promise.resolve(mutate()).then(() => child.stdin.end(`${current.passcode}\n`));
    }
  });
  const status = await new Promise((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  if (mutation !== null) await mutation;
  return { status, stdout, stderr, mutated: mutation !== null };
}

test("authorize-daisy-coordination rejects exact signer byte, inode, and mode drift after successful signing", async () => {
  for (const scenario of ["whitespace", "field-order", "equivalent-number", "inode", "mode"]) {
    const current = await daisySignerFreshnessFixture();
    const baseline = await readFile(current.journalPath, "utf8");
    const original = await readFile(current.signerPath, "utf8");
    const record = JSON.parse(original);
    const result = await runDaisySignerRewrite(current, async () => {
      if (scenario === "whitespace") {
        await writeFile(current.signerPath, `  ${JSON.stringify(record)}\n`);
      } else if (scenario === "field-order") {
        await writeFile(current.signerPath, `${JSON.stringify(Object.fromEntries(Object.entries(record).reverse()), null, 2)}\n`);
      } else if (scenario === "equivalent-number") {
        await writeFile(current.signerPath, original.replace('"schemaVersion": 1', '"schemaVersion": 1e0'));
      } else if (scenario === "inode") {
        const replacement = `${current.signerPath}.replacement`;
        await writeFile(replacement, original, { mode: 0o600 });
        await rename(replacement, current.signerPath);
      } else {
        await chmod(current.signerPath, 0o640);
      }
    });
    assert.equal(result.mutated, true, scenario);
    assert.equal(result.status, 1, `${scenario}: ${result.stderr}`);
    assert.match(result.stderr, /Mission signer snapshot changed after display/u, scenario);
    assert.equal(result.stdout, "", scenario);
    const finalJournal = await readFile(current.journalPath, "utf8");
    assert.equal(finalJournal, baseline, scenario);
    assert.doesNotMatch(finalJournal, /coordination\.(?:authorized|runtime_bound)/u, scenario);
  }
});

test("mission signer snapshot rejects a symlink instead of following it", async () => {
  const current = await daisySignerFreshnessFixture();
  const target = `${current.signerPath}.target`;
  await rename(current.signerPath, target);
  await symlink(target, current.signerPath);
  const signingKeyRef = JSON.parse(await readFile(target, "utf8")).signingKeyRef;
  await assert.rejects(captureMissionSignerSnapshot(signingKeyRef, current.homeRoot));
});

test("batch signer performs one record read, four signatures, and exposes no partial result on each signing failure", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "shield-batch-signer-"));
  const keyPair = generateKeyPairSync("ed25519");
  const created = await signerTestOnly.createSigner(
    SIGNER_INPUT,
    "batch-passcode",
    deterministicSignerDependencies(homeDirectory, keyPair),
  );
  const record = await readFile(created.signerPath, "utf8");
  const payloads = [0, 1, 2, 3].map((index) => ({ schemaVersion: 1, index }));
  let reads = 0;
  let signs = 0;
  const signatures = await batchSignerTestOnly.signPayloadBatch(
    created.signingKeyRef,
    created.publicKeySpkiBase64,
    "batch-passcode",
    payloads,
    {
      readSigner: async () => { reads += 1; return record; },
      signPayload: (bytes, privateKey) => { signs += 1; return sign(null, bytes, privateKey); },
    },
  );
  assert.equal(reads, 1);
  assert.equal(signs, 4);
  assert.equal(signatures.length, 4);

  for (let failureIndex = 0; failureIndex < 4; failureIndex += 1) {
    let attempts = 0;
    let exposed;
    await assert.rejects(async () => {
      exposed = await batchSignerTestOnly.signPayloadBatch(
        created.signingKeyRef,
        created.publicKeySpkiBase64,
        "batch-passcode",
        payloads,
        {
          readSigner: async () => record,
          signPayload: (bytes, privateKey, index) => {
            attempts += 1;
            if (index === failureIndex) throw new Error("injected constituent signing failure");
            return sign(null, bytes, privateKey);
          },
        },
      );
    }, /complete payload batch/u);
    assert.equal(exposed, undefined);
    assert.equal(attempts, failureIndex + 1);
  }
});

test("authorize-wheels-up keeps locale ordering for non-publication arrays and rejects malformed publication data", () => {
  const localeOrdered = ["Z", "a"].sort((left, right) => left.localeCompare(right));
  const publicationOrdered = ["Z", "a"];
  const valid = {
    baseRevision: "a".repeat(40),
    modelId: "model:bounded",
    approvedRelativePaths: localeOrdered,
    approvedActionIds: localeOrdered,
    approvedEffectClasses: localeOrdered,
    approvedEffectKeys: localeOrdered,
    approvedCapabilities: localeOrdered,
    validationCommandIds: localeOrdered,
    reasoningRuntimeId: "runtime:reasoner",
    toolExecutorId: "executor:tools",
    publicationPaths: publicationOrdered,
  };
  const validated = validateAuthorizeWheelsUpInput(valid);
  for (const field of [
    "approvedRelativePaths", "approvedActionIds", "approvedEffectClasses", "approvedEffectKeys",
    "approvedCapabilities", "validationCommandIds",
  ]) assert.deepEqual(validated[field], localeOrdered, field);
  assert.deepEqual(validated.publicationPaths, publicationOrdered);
  assert.throws(() => validateAuthorizeWheelsUpInput(new Proxy(valid, {})), /plain closed data object/u);
  const accessor = { ...valid };
  Object.defineProperty(accessor, "modelId", { enumerable: true, get: () => "model:forged" });
  assert.throws(() => validateAuthorizeWheelsUpInput(accessor), /enumerable data fields/u);
  const symbolic = { ...valid, [Symbol("authority")]: "caller:forbidden" };
  assert.throws(() => validateAuthorizeWheelsUpInput(symbolic), /enumerable data fields/u);
  assert.throws(() => validateAuthorizeWheelsUpInput({ ...valid, publicationPaths: ["a", "Z"] }), /must be sorted/u);
  assert.throws(() => validateAuthorizeWheelsUpInput({ ...valid, publicationPaths: ["Z", "Z"] }), /duplicates/u);
  assert.throws(() => validateAuthorizeWheelsUpInput({ ...valid, publicationPaths: [""] }), /malformed/u);
});

test("authorize-wheels-up rejects symlink and gitlink publication paths without journal mutation", async () => {
  for (const pathKind of ["symlink", "gitlink"]) {
    const { root } = await fixture();
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.email", "shield@example.invalid"]);
    runGit(root, ["config", "user.name", "SHIELD Fixture"]);
    runGit(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
    runGit(root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
    runGit(root, ["commit", "-qm", `${pathKind} base`]);
    const baseRevision = runGit(root, ["rev-parse", "HEAD"]);
    const publicationPath = pathKind === "symlink" ? "A-symlink.md" : "A-gitlink";
    if (pathKind === "symlink") {
      await symlink("package.json", join(root, publicationPath));
      runGit(root, ["add", "--", publicationPath]);
    } else {
      runGit(root, ["update-index", "--add", "--cacheinfo", `160000,${baseRevision},${publicationPath}`]);
    }
    runGit(root, ["commit", "-qm", `${pathKind} head`]);
    if (pathKind === "gitlink") await mkdir(join(root, publicationPath));

    const missionId = `mission:authorize-wheels-up-${pathKind}`;
    const brief = createProfileAwareMissionBrief({
      schemaVersion: 2,
      missionId,
      objective: `Reject one ${pathKind} from initial draft publication.`,
      subjectId: "issue:236",
      riskFlags: {
        production: false, destructive: false, migration: false, credentialsOrSecurity: false,
        externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
      },
      participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
      activatedModes: [],
      requireSimmons: false,
      createdAt: { value: "2026-08-07T00:00:00Z", provenance: "humanRecorded" },
      profileId: "standard",
      profileVersion: 1,
      requiredExecutionGateRoleIds: ["coulson"],
      requiredFinalAcceptanceGateRoleIds: ["coulson"],
      predecessorMissionId: "mission:issue-130",
      predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
    });
    const temporaryRoot = join(root, ".shield", "tmp");
    await mkdir(temporaryRoot, { recursive: true });
    const { revisionId: _revisionId, ...briefContent } = brief;
    await writeFile(join(temporaryRoot, `${pathKind}-brief.json`), `${JSON.stringify(briefContent, null, 2)}\n`);
    await writeFile(join(temporaryRoot, `${pathKind}-input.json`), `${JSON.stringify({
      baseRevision,
      modelId: "model:bounded-may",
      approvedRelativePaths: [publicationPath],
      approvedActionIds: ["action:implement"],
      approvedEffectClasses: ["behavioral_implementation", "verification"],
      approvedEffectKeys: ["effect:implementation", "effect:validation"],
      approvedCapabilities: ["filesystem_write"],
      validationCommandIds: ["validation:test"],
      reasoningRuntimeId: "runtime:bounded-reasoner",
      toolExecutorId: "executor:bounded-tools",
      publicationPaths: [publicationPath],
    }, null, 2)}\n`);
    const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", `.shield/tmp/${pathKind}-brief.json`, "--json"]);
    assert.equal(begun.status, 0, begun.stderr);
    const before = await readFile(journalPath(root, missionId), "utf8");
    const rejected = run(
      root,
      ["mission", "authorize-wheels-up", "--mission-id", missionId, "--input", `.shield/tmp/${pathKind}-input.json`, "--passcode-stdin", "--json"],
      { input: "unused-passcode\n" },
    );
    assert.equal(rejected.status, 1, pathKind);
    assert.match(rejected.stderr, new RegExp(`${pathKind}_path_denied`, "u"), pathKind);
    assert.equal(await readFile(journalPath(root, missionId), "utf8"), before, pathKind);
  }
});

test("prepare-next exhaustively consumes the exported transition result without a cast", async () => {
  const source = await readFile(new URL("../src/mission-cli.mts", import.meta.url), "utf8");
  const start = source.indexOf("async function prepareNext");
  const end = source.indexOf("\nfunction canonicalDigest", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const consumer = source.slice(start, end);
  assert.match(consumer, /const prepareSession = dependencies\.prepareSession \?\? prepareMissionTransitionSessionV1;/u);
  assert.match(consumer, /let result = await prepareSession\([^;]+\);/u);
  assert.doesNotMatch(consumer, /prepareMissionTransitionSessionV1\([^;]+\) as/u);
  assert.match(consumer, /const ready: Extract<ResolvePreparedMissionTransitionResultV1, \{ state: "ready" \}> = result;/u);
  assert.match(consumer, /result\.state === "runtime_binding_ready"/u);
  assert.match(consumer, /result\.state === "runtime_binding_already_authorized"/u);
});

test("prepare-next composes the guarded legacy continuation with one preparation replay", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-prepare-next-composition-")));
  const missionId = "mission:issue-362-composition";
  const first = { state: "blocked", missionId, reasonCode: "protected_evidence_mismatch", errors: ["graph missing"] };
  const second = { state: "blocked", missionId, reasonCode: "repository_observation_stale", errors: ["second preparation blocked"] };
  const calls = [];
  let preparationCalls = 0;
  const stdout = [];
  const stderr = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  try {
    const missingModelStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--json",
    ], {
      prepareSession: async () => first,
      continueLegacyReviewedTransition: async () => { throw new Error("must not run without Fury model"); },
    });
    assert.equal(missingModelStatus, 1);
    assert.deepEqual(JSON.parse(stdout.join("")), {
      schemaVersion: 1,
      state: "blocked",
      reasonCode: "legacy_fury_model_required",
      missionId,
      nextAction: {
        authority: "none",
        owner: "hill",
        commandId: "mission.prepare-next",
        requiredOption: "--fury-model",
        humanGate: false,
      },
    });
    assert.equal(stderr.join(""), "");
    stdout.length = 0;

    const status = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury", "--json",
    ], {
      prepareSession: async () => {
        preparationCalls += 1;
        return preparationCalls === 1 ? first : second;
      },
      continueLegacyReviewedTransition: async (input) => {
        calls.push(input);
        return { state: "materialized", graphPath: "graph", graphId: "graph:id", graphDigest: "sha256:graph" };
      },
    });
    assert.equal(status, 1);
    assert.deepEqual(calls, [{ missionId, repositoryRoot: root, furyModel: "model:fury" }]);
    assert.equal(preparationCalls, 2);
    assert.deepEqual(JSON.parse(stdout.join("")), second);

    stdout.length = 0;
    stderr.length = 0;
    let passPreparationCalls = 0;
    const passStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury", "--json",
    ], {
      prepareSession: async () => { passPreparationCalls += 1; return first; },
      continueLegacyReviewedTransition: async () => ({
        authority: "none", missionId, state: "completed", disposition: "PASS", receiptId: "receipt:fury:pass",
      }),
    });
    assert.equal(passStatus, 1);
    assert.equal(passPreparationCalls, 1);
    assert.equal(stderr.join(""), "");
    assert.deepEqual(JSON.parse(stdout.join("")), {
      authority: "none", missionId, state: "completed", disposition: "PASS", receiptId: "receipt:fury:pass",
    });
    assert.equal((stdout.join("").match(/"state"/gu) ?? []).length, 1);

    for (const closed of [
      { state: "invalid", code: "LEGACY_STATE_INELIGIBLE", errors: ["invalid legacy lineage", "no effects performed"] },
      { state: "conflict", code: "LEGACY_STATE_CHANGED", errors: ["legacy evidence changed"] },
      { state: "recovery_required", code: "RECOVERY_REQUIRED", errors: ["dispatch cannot be reinvoked"] },
      { state: "failed", code: "COPILOT_EXECUTION_FAILED", errors: ["model execution failed"] },
    ]) {
      stdout.length = 0;
      stderr.length = 0;
      const closedStatus = await runMissionCli([
        "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury",
      ], {
        prepareSession: async () => first,
        continueLegacyReviewedTransition: async () => ({ authority: "none", missionId, ...closed }),
      });
      assert.equal(closedStatus, 1);
      assert.equal(stdout.join(""), "");
      assert.equal(stderr.join(""), `state: ${closed.state}\ncode: ${closed.code}\nerrors: ${closed.errors.join(" ")}\n`);
    }

    stdout.length = 0;
    stderr.length = 0;
    const reviseStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury",
    ], {
      prepareSession: async () => first,
      continueLegacyReviewedTransition: async () => ({
        authority: "none", missionId, state: "completed", disposition: "REVISE", receiptId: "receipt:fury:revise",
      }),
    });
    assert.equal(reviseStatus, 1);
    assert.equal(stdout.join(""), "");
    assert.equal(stderr.join(""), "state: completed\ndisposition: REVISE\nreceiptId: receipt:fury:revise\n");
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
});

test("prepare-next renders protected evidence exactly and shell-quotes missing-model roots", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield prepare '$;()-")));
  const missionId = "mission:issue-362-shell-path";
  const first = { state: "blocked", missionId, reasonCode: "protected_evidence_mismatch", errors: ["graph missing"] };
  const stdout = [];
  const stderr = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };
  try {
    const missingStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root,
    ], {
      prepareSession: async () => first,
      continueLegacyReviewedTransition: async () => { throw new Error("must not run without a model"); },
    });
    assert.equal(missingStatus, 1);
    assert.equal(stdout.join(""), "");
    const quotedRoot = `'${root.replaceAll("'", `'"'"'`)}'`;
    assert.equal(stderr.join(""), [
      "Preparation blocked — protected_evidence_mismatch: graph missing",
      `Next action: shield mission prepare-next --mission-id '${missionId}' --root ${quotedRoot} --fury-model '<model-id>'`,
      "",
    ].join("\n"));

    stdout.length = 0;
    stderr.length = 0;
    const graphRoot = join(root, ".shield", "audit", "mission-preparation", createHash("sha256").update(missionId).digest("hex"));
    await mkdir(graphRoot, { recursive: true });
    const protectedStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury",
    ], {
      prepareSession: async () => first,
      continueLegacyReviewedTransition: async () => { throw new Error("must not run with protected evidence"); },
    });
    assert.equal(protectedStatus, 1);
    assert.equal(stdout.join(""), "");
    assert.equal(stderr.join(""), [
      "state: blocked",
      "code: PROTECTED_GRAPH_NOT_ABSENT",
      "errors: Protected mission-preparation graph state appeared during absence verification.",
      "",
    ].join("\n"));
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
});

test("prepare-next returns protected graph evidence unchanged before model selection", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-prepare-next-protected-")));
  const missionId = "mission:issue-362-protected";
  const graphRoot = join(root, ".shield", "audit", "mission-preparation", createHash("sha256").update(missionId).digest("hex"));
  await mkdir(graphRoot, { recursive: true });
  const stdout = [];
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  try {
    const status = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", root, "--fury-model", "model:fury", "--json",
    ], {
      prepareSession: async () => ({ state: "blocked", missionId, reasonCode: "protected_evidence_mismatch", errors: ["unsafe graph"] }),
      continueLegacyReviewedTransition: async () => { throw new Error("must not run with protected evidence"); },
    });
    assert.equal(status, 1);
    const result = JSON.parse(stdout.join(""));
    assert.equal(result.authority, "none");
    assert.equal(result.state, "blocked");
    assert.equal(result.code, "PROTECTED_GRAPH_NOT_ABSENT");
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test("prepare-next routes a fresh issue-intake journal before protected or legacy preparation and blocks journal readback drift", async () => {
  const current = await nativeIssueIntakeFixture();
  const { initialBytes, missionId, missionJournalPath } = current;

  const firstBefore = await readFile(missionJournalPath, "utf8");
  let prepareCalls = 0;
  let legacyCalls = 0;
  const firstOutput = [];
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk) => { firstOutput.push(String(chunk)); return true; };
  try {
    const firstStatus = await runMissionCli([
      "mission", "prepare-next", "--mission-id", missionId, "--root", current.root, "--json", "--fury-model", "must-be-ignored",
    ], {
      prepareSession: async () => { prepareCalls += 1; throw new Error("protected preparation must not run"); },
      continueLegacyReviewedTransition: async () => { legacyCalls += 1; throw new Error("legacy continuation must not run"); },
    });
    assert.equal(firstStatus, 0);
    assert.deepEqual(JSON.parse(firstOutput.join("")), {
      state: "mission_authorization_ready",
      authority: "none",
      owner: "coulson",
      commandId: "mission.authorize",
      humanGate: true,
      pinRequired: true,
      missionId,
      repositoryRoot: current.root,
    });
    assert.equal(prepareCalls, 0);
    assert.equal(legacyCalls, 0);
    assert.equal(await readFile(missionJournalPath, "utf8"), firstBefore);
  } finally {
    process.stdout.write = originalStdoutWrite;
  }

  const advanced = { ...current.compiled.entry, entryId: `entry:${missionId}:1`, sequence: 1 };
  const advancedBytes = `${initialBytes}${JSON.stringify(advanced)}\n`;
  const blockedOutput = [];
  process.stdout.write = (chunk) => { blockedOutput.push(String(chunk)); return true; };
  try {
    const blockedStatus = await runMissionCli(
      ["mission", "prepare-next", "--mission-id", missionId, "--root", current.root, "--json"],
      {
        prepareSession: async () => { throw new Error("advanced native lineage must not enter protected preparation"); },
        beforeNativeIssueIntakeReadback: async () => { await writeFile(missionJournalPath, advancedBytes); },
      },
    );
    assert.equal(blockedStatus, 1);
    const blocked = JSON.parse(blockedOutput.join(""));
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.reasonCode, "native_issue_intake_readback_changed");
    assert.equal(blocked.missionId, missionId);
    assert.equal(blocked.authority, "none");
    assert.equal(await readFile(missionJournalPath, "utf8"), advancedBytes);
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test("prepare-next binds each native snapshot to one no-follow handle and rejects replacement or symlink swaps", async () => {
  for (const scenario of ["replacement", "symlink"]) {
    const current = await nativeIssueIntakeFixture();
    let swapped = false;
    let prepareCalls = 0;
    let legacyCalls = 0;
    const result = await runMissionCliCaptured(
      ["mission", "prepare-next", "--mission-id", current.missionId, "--root", current.root, "--json"],
      {
        prepareSession: async () => { prepareCalls += 1; throw new Error("protected preparation must not run"); },
        continueLegacyReviewedTransition: async () => { legacyCalls += 1; throw new Error("legacy continuation must not run"); },
        afterNativeIssueIntakeJournalHandleRead: async () => {
          if (swapped) return;
          swapped = true;
          if (scenario === "replacement") {
            const replacementPath = `${current.missionJournalPath}.replacement`;
            await writeFile(replacementPath, current.initialBytes);
            await rename(replacementPath, current.missionJournalPath);
          } else {
            const originalPath = `${current.missionJournalPath}.original`;
            await rename(current.missionJournalPath, originalPath);
            await symlink(originalPath, current.missionJournalPath);
          }
        },
      },
    );
    assert.equal(result.status, 1, scenario);
    assert.equal(result.stderr, "", scenario);
    const blocked = JSON.parse(result.stdout);
    assert.equal(blocked.state, "blocked", scenario);
    assert.equal(blocked.reasonCode, "native_issue_intake_journal_invalid", scenario);
    assert.equal(blocked.code, "journal_identity_changed", scenario);
    assert.equal(blocked.authority, "none", scenario);
    assert.equal(prepareCalls, 0, scenario);
    assert.equal(legacyCalls, 0, scenario);
    if (scenario === "replacement") assert.equal(await readFile(current.missionJournalPath, "utf8"), current.initialBytes);
    else assert.equal((await lstat(current.missionJournalPath)).isSymbolicLink(), true);
  }
});

test("prepare-next blocks a projection that does not match the exact bound journal bytes", async () => {
  const current = await nativeIssueIntakeFixture();
  let parseCalls = 0;
  let downstreamCalls = 0;
  const result = await runMissionCliCaptured(
    ["mission", "prepare-next", "--mission-id", current.missionId, "--root", current.root, "--json"],
    {
      prepareSession: async () => { downstreamCalls += 1; throw new Error("protected preparation must not run"); },
      continueLegacyReviewedTransition: async () => { downstreamCalls += 1; throw new Error("legacy continuation must not run"); },
      parseNativeIssueIntakeJournalBytes: (journalBytes, missionId) => {
        const entries = journalBytes.trimEnd().split("\n").map((line) => JSON.parse(line));
        const replay = replayProfileAwareMissionJournal(entries);
        assert.equal(replay.state, "valid");
        assert.equal(replay.value.missionId, missionId);
        parseCalls += 1;
        return {
          state: "valid",
          value: {
            kind: "profile-aware",
            entries,
            projection: parseCalls === 2 ? { ...replay.value, authorization: "authorized" } : replay.value,
          },
        };
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const blocked = JSON.parse(result.stdout);
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.reasonCode, "native_issue_intake_readback_changed");
  assert.equal(blocked.authority, "none");
  assert.equal(parseCalls, 2);
  assert.equal(downstreamCalls, 0);
  assert.equal(await readFile(current.missionJournalPath, "utf8"), current.initialBytes);
});

test("prepare-next blocks malformed, mixed-schema, and tampered issue-intake journals without downstream calls or mutation", async () => {
  const cases = [
    {
      label: "malformed JSON",
      expectedCode: "recovery_required",
      bytes: (current) => `${current.initialBytes}{not-json}\n`,
    },
    {
      label: "mixed schema",
      expectedCode: "schema_mixed",
      bytes: (current) => `${current.initialBytes}${JSON.stringify({ ...current.compiled.entry, schemaVersion: 8, entryId: `entry:${current.missionId}:1`, sequence: 1 })}\n`,
    },
    {
      label: "tampered issue source binding",
      expectedCode: "binding_invalid",
      bytes: (current) => {
        const entry = structuredClone(current.compiled.entry);
        entry.payload.issueIntakeSourceBinding.issueNumber += 1;
        return `${JSON.stringify(entry)}\n`;
      },
    },
  ];
  for (const scenario of cases) {
    const current = await nativeIssueIntakeFixture();
    const journalBytes = scenario.bytes(current);
    await writeFile(current.missionJournalPath, journalBytes);
    let prepareCalls = 0;
    let legacyCalls = 0;
    const result = await runMissionCliCaptured(
      ["mission", "prepare-next", "--mission-id", current.missionId, "--root", current.root, "--json"],
      {
        prepareSession: async () => { prepareCalls += 1; throw new Error("protected preparation must not run"); },
        continueLegacyReviewedTransition: async () => { legacyCalls += 1; throw new Error("legacy continuation must not run"); },
      },
    );
    assert.equal(result.status, 1, scenario.label);
    assert.equal(result.stderr, "", scenario.label);
    const blocked = JSON.parse(result.stdout);
    assert.equal(blocked.state, "blocked", scenario.label);
    assert.equal(blocked.reasonCode, "native_issue_intake_journal_invalid", scenario.label);
    assert.equal(blocked.code, scenario.expectedCode, scenario.label);
    assert.equal(blocked.authority, "none", scenario.label);
    assert.equal(prepareCalls, 0, scenario.label);
    assert.equal(legacyCalls, 0, scenario.label);
    assert.equal(await readFile(current.missionJournalPath, "utf8"), journalBytes, scenario.label);
  }
});

test("spawned prepare-next derives Issue #349 legacy authority and reaches the publication gate", async () => {
  const current = await legacyPublicationCliFixture();
  const homeRoot = join(current.root, ".shield", "tmp", "isolated-home");
  await mkdir(homeRoot, { recursive: true });
  await signerTestOnly.createSigner({
    seatId: "coulson",
    bindingId: current.coulson.binding.bindingId,
    humanPrincipalId: current.coulson.binding.humanPrincipalId,
  }, "unused-publication-passcode", {
    homeDirectory: homeRoot,
    generateKeyPair: () => ({ privateKey: current.coulson.privateKey, publicKey: createPublicKey(current.coulson.privateKey) }),
  });
  const args = [
    "mission", "prepare-next", "--mission-id", current.missionId, "--root", current.root,
    "--fury-model", "model:fury-issue-349", "--guided-review-choice", "no", "--passcode-stdin", "--json",
  ];
  assert.equal(args.includes("--authority"), false);
  assert.equal(args.includes("--input"), false);
  const result = run(current.root, args, {
    env: { HOME: homeRoot, COPILOT_HOME: homeRoot },
    unsetEnv: ["FORCE_COLOR", "NO_COLOR"],
    input: "\n",
    nodeArgs: [...await fakeCopilotSdkNodeArgs(current.root), ...fixedClockNodeArgs("2026-08-19T12:03:00.000Z")],
  });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  const decisionMatch = /^SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN\n(?<decision>[^\n]+)\nSHIELD_REVIEW_PUBLICATION_DECISION_END\nSHIELD: Passcode input was empty\.\n$/u.exec(result.stderr);
  assert.ok(decisionMatch?.groups?.decision, result.stderr);
  const decision = JSON.parse(decisionMatch.groups.decision);
  assert.equal(decision.missionId, current.missionId);
  assert.equal(decision.guidedReview.choice, "no");
  assert.equal(decision.guidedReview.disposition, "skipped_by_operator");
  assert.equal(result.stderr, `SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN\n${JSON.stringify(decision)}\nSHIELD_REVIEW_PUBLICATION_DECISION_END\nSHIELD: Passcode input was empty.\n`);
  const graph = JSON.parse(await readFile(deriveMissionReviewedTransitionGraphMaterializationPathV1(current.root, current.missionId).graphPath, "utf8"));
  assert.equal(graph.transitionPlan.missionId, current.missionId);
});

test("prepare-next derives and signs one prepared publication without caller JSON or external effect", async () => {
  const prepared = await preparedPublicationCliFixture();
  const path = journalPath(prepared.root, prepared.missionId);
  const beforeCancellation = await readFile(path, "utf8");
  const missingChoice = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n", nodeArgs: fixedClockNodeArgs("2026-08-13T01:03:00Z") },
  );
  assert.equal(missingChoice.status, 1);
  assert.match(missingChoice.stderr, /requires --guided-review-choice/u);
  assert.doesNotMatch(missingChoice.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), beforeCancellation);
  const cancelledFork = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "cancel", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n", nodeArgs: fixedClockNodeArgs("2026-08-13T01:03:00Z") },
  );
  assert.equal(cancelledFork.status, 1);
  assert.match(cancelledFork.stdout, /"state": "cancelled"/u);
  assert.doesNotMatch(cancelledFork.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), beforeCancellation);
  const cancelled = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "no", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "\n", nodeArgs: fixedClockNodeArgs("2026-08-13T01:03:00Z") },
  );
  assert.equal(cancelled.status, 2, cancelled.stderr);
  assert.match(cancelled.stderr, /SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.match(cancelled.stderr, /Passcode input was empty/u);
  assert.equal(await readFile(path, "utf8"), beforeCancellation);

  const authorized = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "no", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "prepared-passcode\n", nodeArgs: fixedClockNodeArgs("2026-08-13T01:03:00Z") },
  );
  assert.equal(authorized.status, 0, authorized.stderr);
  const decisionMatch = /SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN\n(?<decision>[^\n]+)\nSHIELD_REVIEW_PUBLICATION_DECISION_END/u.exec(authorized.stderr);
  assert.ok(decisionMatch?.groups?.decision, authorized.stderr);
  const decision = JSON.parse(decisionMatch.groups.decision);
  assert.equal(decision.missionId, prepared.missionId);
  assert.equal(decision.repository.baseRevision, prepared.plan.planningBaseRevision);
  assert.equal(decision.repository.headRevision, runGit(prepared.root, ["rev-parse", "HEAD"]));
  assert.deepEqual(decision.authorizedPaths, ["implementation.md"]);
  assert.deepEqual(decision.permittedEffects, ["review.branch.push", "review.pull_request.create_draft"]);
  assert.deepEqual(decision.remainingHumanGates, ["coulson.final_acceptance", "fitz.technical_review"]);
  assert.equal(decision.guidedReview.choice, "no");
  assert.equal(decision.guidedReview.disposition, "skipped_by_operator");
  assert.equal(decision.guidedReview.required, false);
  assert.match(decision.guidedReview.rationale, /optional No route/u);
  assert.equal(decision.guidedReview.gateOwnerSeatId, "coulson");
  assert.match(decision.guidedReview.bundleDigest, /^sha256:/u);

  const projection = JSON.parse(authorized.stdout);
  assert.equal(projection.publicationAuthorizations.length, 2);
  const publication = projection.publicationAuthorizations[1];
  assert.equal(publication.authority.authorityKind, "review.publish");
  assert.equal(publication.authority.authorityRef, `authorization:${prepared.missionId}:review-publish:5`);
  assert.equal(publication.authorization.sourceRef, `cli:prepare-next:publication-authorize:5:guided-review-v2:${decision.guidedReview.bundleDigest}`);
  assert.deepEqual(publication.authority.authorizedPaths, ["implementation.md"]);
  assert.deepEqual(publication.authority.permittedEffects, ["review.branch.push", "review.pull_request.create_draft"]);
  assert.equal(projection.communication.requests.length, 0);
  const after = await readJournalEntries(prepared.root, prepared.missionId);
  assert.equal(after.length, 6);
  assert.equal(after.at(-1).type, "review.publication_authorized");

  const bytesAfterAuthorization = await readFile(path, "utf8");
  const retry = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--human"],
    { env: { HOME: prepared.homeRoot } },
  );
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /^ALREADY AUTHORIZED — nothing repeated\.\n/u);
  assert.match(retry.stdout, new RegExp(`authorizationId: ${publication.authorization.authorizationId}\\n`, "u"));
  assert.match(retry.stdout, new RegExp(`authorityDigest: ${publication.authorization.authorityDigest}\\n`, "u"));
  assert.match(retry.stdout, new RegExp(`journalSequence: ${publication.journalSequence}\\n`, "u"));
  assert.doesNotMatch(`${retry.stdout}${retry.stderr}`, /Passcode:/u);
  assert.equal(await readFile(path, "utf8"), bytesAfterAuthorization);
});

test("prepare-next rejects legacy or missing YES context and a required-to-optional downgrade before PIN", async () => {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const path = journalPath(prepared.root, prepared.missionId);
  const before = await readFile(path, "utf8");
  const no = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "no", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
  );
  assert.equal(no.status, 1);
  assert.match(no.stderr, /requires Guided Review; No is not available/u);
  assert.doesNotMatch(no.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), before);

  const yesWithoutContext = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
  );
  assert.equal(yesWithoutContext.status, 1);
  assert.match(yesWithoutContext.stderr, /CURRENT_ROUTE_REQUEST_NOT_FOUND/u);
  assert.doesNotMatch(yesWithoutContext.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), before);

  const legacy = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "yes",
      "--guided-review-playbook", ".shield/tmp/legacy-playbook.json", "--guided-review-session", ".shield/tmp/legacy-session.json",
      "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
  );
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /Yes no longer accepts --guided-review-playbook or --guided-review-session/u);
  assert.doesNotMatch(legacy.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), before);

  const outside = join(await mkdtemp(join(tmpdir(), "shield-guided-context-outside-")), "context.json");
  await writeFile(outside, "{}\n");
  const outsideContext = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "yes",
      "--guided-review-context", outside, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
  );
  assert.equal(outsideContext.status, 1);
  assert.match(outsideContext.stderr, /Guided Review context must resolve beneath the repository root/u);
  assert.doesNotMatch(outsideContext.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal(await readFile(path, "utf8"), before);
});

test("prepare-next YES materializes a lazy exact-head route request before decision, PIN, sign, or journal append", async () => {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const evidence = await preparedGuidedReviewContext(prepared);
  const path = journalPath(prepared.root, prepared.missionId);
  const before = await readFile(path, "utf8");
  const routed = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "yes",
      "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
  );
  assert.equal(routed.status, 0, routed.stderr);
  assert.doesNotMatch(`${routed.stdout}${routed.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  const result = JSON.parse(routed.stdout);
  assert.equal(result.state, "route_preparation_required");
  assert.equal(result.missionId, prepared.missionId);
  assert.equal(result.exactRevision, runGit(prepared.root, ["rev-parse", "HEAD"]));
  assert.equal(result.accountableSeatId, "fury");
  assert.match(result.requestId, /^guided-review-route-request:/u);
  assert.match(result.requestDigest, /^sha256:/u);
  assert.equal(result.requestPath, result.paths.routeRequestPath);
  assert.equal(await readFile(result.requestPath, "utf8"), canonicalJson(result.request));
  assert.equal(await readFile(path, "utf8"), before);
});

test("prepare-next YES automatically resumes pending, active, progressed, and completed Guided Review with one final PIN", async () => {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const evidence = await preparedGuidedReviewContext(prepared);
  const journal = journalPath(prepared.root, prepared.missionId);
  const before = await readJournalEntries(prepared.root, prepared.missionId);
  const routedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(routedRun.status, 0, routedRun.stderr);
  const routed = JSON.parse(routedRun.stdout);

  const pendingRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(pendingRun.status, 0, pendingRun.stderr);
  assert.equal(JSON.parse(pendingRun.stdout).state, "route_preparation_required");
  assert.doesNotMatch(`${pendingRun.stdout}${pendingRun.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  assert.equal((await readJournalEntries(prepared.root, prepared.missionId)).length, before.length);

  await authorPreparedFuryRoute(prepared, routed);
  const activeRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(activeRun.status, 0, JSON.stringify(activeRun));
  const active = JSON.parse(activeRun.stdout);
  assert.equal(active.state, "guided_review_in_progress");
  assert.match(active.currentStage.checkpointId, /^checkpoint:/u);
  assert.equal(typeof active.currentStep.question, "string");
  assert.equal(Array.isArray(active.currentStep.instructions), true);
  assert.equal(Array.isArray(active.currentStep.relevantPaths), true);
  assert.equal(Array.isArray(active.currentStep.evidenceRefs), true);
  assert.equal(Array.isArray(active.currentStep.criterionRefs), true);
  assert.equal(typeof active.currentStage.purpose, "string");
  assert.equal(typeof active.routeContext.rationale, "string");
  assert.equal(Array.isArray(active.routeContext.risks), true);
  assert.equal(Object.hasOwn(active, "currentStage"), true);
  assert.equal(Object.hasOwn(active, "currentStep"), true);
  assert.equal(active.projection.state, "ready", JSON.stringify(active.projection));
  assert.equal(active.projection.projection.authority, "none");
  assert.equal(active.projection.projection.durability, "ephemeral");
  assert.equal(active.projection.projection.sessionDigest, active.sessionDigest);
  assert.equal(active.projection.projection.stepId, active.currentStep.stepId);
  assert.equal(active.projection.projection.exactRevision, active.exactRevision);
  assert.equal(active.projection.projection.behaviorGroups.flatMap((group) => group.targets).every((target) =>
    target.navigation.executor === "git" && target.navigation.argv.at(-1).startsWith(":(top,literal)")), true);
  const projectionStat = await lstat(active.projection.projectionPath);
  assert.equal(projectionStat.isFile() && !projectionStat.isSymbolicLink() && projectionStat.nlink === 1, true);
  assert.equal(projectionStat.mode & 0o777, 0o600);
  assert.doesNotMatch(`${activeRun.stdout}${activeRun.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);

  const playbook = JSON.parse(await readFile(active.paths.playbookPath, "utf8"));
  const progressedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
    "--guided-review-question-digest", active.questionEnvelope.questionDigest,
    "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(progressedRun.status, 0, progressedRun.stderr);
  const progressed = JSON.parse(progressedRun.stdout);
  assert.equal(progressed.state, "guided_review_in_progress");
  assert.notEqual(progressed.sessionDigest, active.sessionDigest);
  assert.notEqual(progressed.currentStep.stepId, active.currentStep.stepId);
  assert.equal(progressed.projection.state, "ready", JSON.stringify(progressed.projection));
  assert.equal(progressed.projection.projection.sessionDigest, progressed.sessionDigest);
  assert.equal(progressed.projection.projection.stepId, progressed.currentStep.stepId);
  assert.notEqual(progressed.projection.projection.projectionDigest, active.projection.projection.projectionDigest);
  assert.equal(progressed.projection.projectionPath, active.projection.projectionPath);
  assert.equal(JSON.parse(await readFile(active.paths.sessionPath, "utf8")).decisions.at(-1).observation, "PASS");
  assert.doesNotMatch(`${progressedRun.stdout}${progressedRun.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);

  let session = JSON.parse(await readFile(active.paths.sessionPath, "utf8"));
  let displayed = progressed;
  const totalSteps = playbook.stages.flatMap((stage) => stage.steps).length;
  while (session.decisions.length < totalSteps - 1) {
    const next = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
      "--guided-review-question-digest", displayed.questionEnvelope.questionDigest,
      "--passcode-stdin", "--json"], { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
    assert.equal(next.status, 0, next.stderr);
    displayed = JSON.parse(next.stdout);
    assert.equal(displayed.state, "guided_review_in_progress");
    assert.doesNotMatch(`${next.stdout}${next.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
    session = JSON.parse(await readFile(active.paths.sessionPath, "utf8"));
  }
  const completedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
    "--guided-review-question-digest", displayed.questionEnvelope.questionDigest,
    "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "prepared-passcode\n" });
  assert.equal(completedRun.status, 0, completedRun.stderr);
  assert.equal((completedRun.stderr.match(/SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/gu) ?? []).length, 1);
  const after = await readJournalEntries(prepared.root, prepared.missionId);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1).type, "review.publication_authorized");
  assert.match(after.at(-1).payload.authorization.payload.sourceRef, /:guided-review-v2:sha256:/u);
  assert.notEqual(await readFile(journal, "utf8"), "");
});

test("ignored symlinked, hard-linked, and replaced projections cannot block a previously displayed bound answer", async (t) => {
  for (const kind of ["symlink", "hardlink", "replaced"]) await t.test(kind, async () => {
    const value = await activeGuidedReviewProjectionFixture();
    const { active, prepared } = value;
    const sessionBefore = JSON.parse(await readFile(active.paths.sessionPath, "utf8"));
    const projectionPath = active.projection.projectionPath;
    const outside = kind === "replaced" ? null : join(await mkdtemp(join(tmpdir(), "shield-guided-projection-outside-")), "projection.json");
    if (outside !== null) await writeFile(outside, "outside projection\n", { mode: 0o600 });
    const installIgnoredStorage = async () => {
      await unlink(projectionPath).catch(() => undefined);
      if (kind === "symlink") await symlink(outside, projectionPath);
      else if (kind === "hardlink") await link(outside, projectionPath);
      else await writeFile(projectionPath, "replaced projection storage\n", { mode: 0o600 });
    };
    await installIgnoredStorage();
    const outsideBefore = outside === null ? null : { bytes: await readFile(outside, "utf8"), stat: await lstat(outside) };
    const hostilePathBefore = await lstat(projectionPath);

    const materialized = await projectCurrentGuidedReviewStepHostV1({ repositoryRoot: prepared.root, preparation: value.preparation,
      resolution: value.resolution, expectedSessionDigest: active.sessionDigest }, projectionDependencies());
    if (kind === "replaced") assert.equal(materialized.state, "ready", JSON.stringify(materialized));
    else assert.equal(materialized.state, "projection_unavailable", JSON.stringify(materialized));
    assert.deepEqual(JSON.parse(await readFile(active.paths.sessionPath, "utf8")), sessionBefore);
    if (outside !== null) {
      assert.equal(await readFile(outside, "utf8"), outsideBefore.bytes);
      const outsideAfterMaterialization = await lstat(outside);
      assert.equal(outsideAfterMaterialization.dev, outsideBefore.stat.dev);
      assert.equal(outsideAfterMaterialization.ino, outsideBefore.stat.ino);
      const hostilePathAfterMaterialization = await lstat(projectionPath);
      assert.equal(hostilePathAfterMaterialization.dev, hostilePathBefore.dev);
      assert.equal(hostilePathAfterMaterialization.ino, hostilePathBefore.ino);
    } else {
      await installIgnoredStorage();
    }

    const answeredRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
      "--guided-review-question-digest", active.questionEnvelope.questionDigest, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
    assert.equal(answeredRun.status, 0, answeredRun.stderr);
    const answered = JSON.parse(answeredRun.stdout);
    if (kind === "replaced") {
      assert.equal(answered.state, "guided_review_in_progress");
      assert.equal(answered.projection.state, "ready");
    } else {
      assert.equal(answered.state, "guided_review_decision_recorded");
      assert.equal(answered.projection.state, "projection_unavailable");
    }
    const sessionAfter = JSON.parse(await readFile(active.paths.sessionPath, "utf8"));
    assert.equal(sessionAfter.decisions.length, sessionBefore.decisions.length + 1);
    assert.equal(sessionAfter.decisions.at(-1).observation, "PASS");
    if (outside !== null) {
      assert.equal(await readFile(outside, "utf8"), outsideBefore.bytes);
      const outsideAfter = await lstat(outside);
      assert.equal(outsideAfter.dev, outsideBefore.stat.dev);
      assert.equal(outsideAfter.ino, outsideBefore.stat.ino);
      const hostilePathAfter = await lstat(projectionPath);
      assert.equal(hostilePathAfter.dev, hostilePathBefore.dev);
      assert.equal(hostilePathAfter.ino, hostilePathBefore.ino);
    }

    const duplicateRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
      "--guided-review-question-digest", active.questionEnvelope.questionDigest, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
    assert.equal(duplicateRun.status, 1);
    assert.match(duplicateRun.stderr, /GUIDED_REVIEW_ANSWER_STALE/u);
    assert.deepEqual(JSON.parse(await readFile(active.paths.sessionPath, "utf8")), sessionAfter);
    if (outside !== null) {
      assert.equal(await readFile(outside, "utf8"), outsideBefore.bytes);
      const outsideAfterDuplicate = await lstat(outside);
      assert.equal(outsideAfterDuplicate.dev, outsideBefore.stat.dev);
      assert.equal(outsideAfterDuplicate.ino, outsideBefore.stat.ino);
    }
  });
});

async function activeGuidedReviewProjectionFixture() {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const evidence = await preparedGuidedReviewContext(prepared);
  const routedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(routedRun.status, 0, routedRun.stderr);
  await authorPreparedFuryRoute(prepared, JSON.parse(routedRun.stdout));
  const activeRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(activeRun.status, 0, activeRun.stderr);
  const active = JSON.parse(activeRun.stdout);
  assert.equal(active.projection.state, "ready", JSON.stringify(active));
  const preparation = await resolvePreparedMissionTransitionV1({ missionId: prepared.missionId, repositoryRoot: prepared.root });
  assert.equal(preparation.state, "publication_ready");
  const resolution = await resolveGuidedReviewRoutePreparationHostV1({ preparation, repositoryRoot: prepared.root });
  assert.equal(resolution.state, "guided_review_ready");
  return { prepared, active, preparation, resolution };
}

function projectionDependencies(afterProjectionLockAcquired) {
  return {
    async runGit(root, argv) { return runGit(root, argv); },
    resolvePaths: resolveGuidedReviewRoutePackagePathsV1,
    readArtifact: readGuidedReviewRoutePackageJsonV1,
    ...(afterProjectionLockAcquired === undefined ? {} : { afterProjectionLockAcquired }),
  };
}

test("projection host rejects substituted package paths without touching outside bytes", async () => {
  const value = await activeGuidedReviewProjectionFixture();
  const outside = await mkdtemp(join(tmpdir(), "shield-guided-projection-hostile-path-"));
  const sentinel = join(outside, "sentinel.json");
  await writeFile(sentinel, "outside bytes\n", { mode: 0o600 });
  const hostile = { ...value.resolution, paths: { ...value.resolution.paths, packageDirectory: outside,
    routeRequestPath: sentinel, routeOverlayPath: sentinel, playbookPath: sentinel, sessionPath: sentinel } };
  const result = await projectCurrentGuidedReviewStepHostV1({ repositoryRoot: value.prepared.root, preparation: value.preparation,
    resolution: hostile, expectedSessionDigest: value.active.sessionDigest }, projectionDependencies());
  assert.equal(result.state, "projection_stale", JSON.stringify(result));
  assert.equal(await readFile(sentinel, "utf8"), "outside bytes\n");
  assert.equal(await lstat(join(outside, "current-projection.json")).then(() => true, () => false), false);
  assert.equal(runGit(value.prepared.root, ["status", "--porcelain"]), "");
});

test("locked projection refresh rejects HEAD drift and preserves the prior projection bytes", async () => {
  const value = await activeGuidedReviewProjectionFixture();
  const path = value.active.projection.projectionPath;
  const before = await readFile(path, "utf8");
  const result = await projectCurrentGuidedReviewStepHostV1({ repositoryRoot: value.prepared.root, preparation: value.preparation,
    resolution: value.resolution, expectedSessionDigest: value.active.sessionDigest }, projectionDependencies(async () => {
      await writeFile(join(value.prepared.root, "implementation.md"), "initial implementation\nprepared publication change\nracing change\n");
      runGit(value.prepared.root, ["add", "implementation.md"]);
      runGit(value.prepared.root, ["commit", "-qm", "projection race head"]);
    }));
  assert.equal(result.state, "projection_stale", JSON.stringify(result));
  assert.equal(await readFile(path, "utf8"), before);
  assert.equal(runGit(value.prepared.root, ["status", "--porcelain"]), "");
});

test("an older locked writer cannot overwrite the next-session projection", async () => {
  const value = await activeGuidedReviewProjectionFixture();
  const path = value.active.projection.projectionPath;
  const oldBytes = await readFile(path, "utf8");
  const storedSession = JSON.parse(await readFile(value.active.paths.sessionPath, "utf8"));
  const decidedAt = new Date(Date.parse(storedSession.startedAt) + 1).toISOString();
  let nextSessionDigest;
  let competing;
  const oldInput = { repositoryRoot: value.prepared.root, preparation: value.preparation, resolution: value.resolution,
    expectedSessionDigest: value.active.sessionDigest };
  const oldResult = await projectCurrentGuidedReviewStepHostV1(oldInput, projectionDependencies(async () => {
    const answered = await answerCurrentGuidedReviewSessionHostV1({ repositoryRoot: value.prepared.root, resolution: value.resolution,
      expectedSessionDigest: value.active.sessionDigest, disposition: "pass", observation: "PASS", finding: null, condition: null,
      decidedAt });
    assert.equal(answered.state, "ready", JSON.stringify(answered));
    nextSessionDigest = answered.value.sessionDigest;
    competing = await projectCurrentGuidedReviewStepHostV1({ ...oldInput, expectedSessionDigest: nextSessionDigest }, projectionDependencies());
  }));
  assert.equal(competing.state, "projection_unavailable", JSON.stringify(competing));
  assert.equal(oldResult.state, "projection_stale", JSON.stringify(oldResult));
  assert.equal(await readFile(path, "utf8"), oldBytes);
  const current = await projectCurrentGuidedReviewStepHostV1({ ...oldInput, expectedSessionDigest: nextSessionDigest }, projectionDependencies());
  assert.equal(current.state, "ready", JSON.stringify(current));
  assert.notEqual(await readFile(path, "utf8"), oldBytes);
  assert.equal(current.projection.sessionDigest, nextSessionDigest);
  assert.equal(runGit(value.prepared.root, ["status", "--porcelain"]), "");
});

test("post-replace session drift restores prior projection bytes without rolling back the answer", async () => {
  const value = await activeGuidedReviewProjectionFixture();
  const path = value.active.projection.projectionPath;
  const priorBytes = await readFile(path, "utf8");
  let nextSessionDigest;
  const dependencies = { ...projectionDependencies(), afterProjectionReplace: async () => {
    const answered = await answerCurrentGuidedReviewSessionHostV1({ repositoryRoot: value.prepared.root, resolution: value.resolution,
      expectedSessionDigest: value.active.sessionDigest, disposition: "pass", observation: "PASS", finding: null, condition: null,
      decidedAt: "2026-08-14T12:01:00.000Z" });
    assert.equal(answered.state, "ready", JSON.stringify(answered));
    nextSessionDigest = answered.value.sessionDigest;
  } };
  const result = await projectCurrentGuidedReviewStepHostV1({ repositoryRoot: value.prepared.root, preparation: value.preparation,
    resolution: value.resolution, expectedSessionDigest: value.active.sessionDigest }, dependencies);
  assert.equal(result.state, "projection_stale", JSON.stringify(result));
  assert.equal(await readFile(path, "utf8"), priorBytes);
  const session = JSON.parse(await readFile(value.active.paths.sessionPath, "utf8"));
  assert.equal(session.sessionDigest, nextSessionDigest);
  assert.equal(session.decisions.at(-1).observation, "PASS");
  assert.equal(runGit(value.prepared.root, ["status", "--porcelain"]), "");
});

test("prepare-next bare answers preserve exact human follow-ups and mutate at most one current question", async () => {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const evidence = await preparedGuidedReviewContext(prepared);
  const routedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "unused\n" });
  assert.equal(routedRun.status, 0, routedRun.stderr);
  await authorPreparedFuryRoute(prepared, JSON.parse(routedRun.stdout));
  const activeRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"], { env: { HOME: prepared.homeRoot }, input: "unused\n" });
  assert.equal(activeRun.status, 0, activeRun.stderr);
  const active = JSON.parse(activeRun.stdout);
  const sessionPath = active.paths.sessionPath;
  const projectionPath = active.projection.projectionPath;
  const journalBefore = await readFile(journalPath(prepared.root, prepared.missionId), "utf8");
  const sessionBefore = await readFile(sessionPath, "utf8");
  const projectionBefore = await readFile(projectionPath, "utf8");
  const projectionStatBefore = await lstat(projectionPath);

  const unsafeLegacy = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "PASS", "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(unsafeLegacy.status, 1);
  assert.match(unsafeLegacy.stderr, /displayed --guided-review-question-digest/u);
  assert.equal(await readFile(sessionPath, "utf8"), sessionBefore);

  const confirmationRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-response", "PASS because it looks good",
    "--guided-review-question-digest", active.questionEnvelope.questionDigest, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(confirmationRun.status, 0, confirmationRun.stderr);
  const confirmation = JSON.parse(confirmationRun.stdout);
  assert.equal(confirmation.state, "confirmation_required");
  assert.equal(confirmation.code, "GUIDED_REVIEW_ANSWER_CONFIRMATION_REQUIRED");
  assert.equal(confirmation.questionEnvelope.questionDigest, active.questionEnvelope.questionDigest);
  assert.deepEqual(confirmation.acceptedAnswers, ["PASS", "FAIL", "NOT_OBSERVED", "CONDITIONAL_PASS"]);
  assert.equal(await readFile(sessionPath, "utf8"), sessionBefore);
  assert.equal(await readFile(journalPath(prepared.root, prepared.missionId), "utf8"), journalBefore);
  assert.equal(await readFile(projectionPath, "utf8"), projectionBefore);
  assert.equal((await lstat(projectionPath)).ino, projectionStatBefore.ino);

  for (const [answer, requiredField] of [["FAIL", "finding"], ["NOT_OBSERVED", "finding"], ["CONDITIONAL_PASS", "condition"]]) {
    const followUpRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", "yes", "--guided-review-answer", answer,
      "--guided-review-question-digest", active.questionEnvelope.questionDigest, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
    assert.equal(followUpRun.status, 0, followUpRun.stderr);
    const followUp = JSON.parse(followUpRun.stdout);
    assert.equal(followUp.state, "follow_up_required");
    assert.equal(followUp.canonicalAnswer, answer);
    assert.equal(followUp.requiredField, requiredField);
    assert.equal(await readFile(sessionPath, "utf8"), sessionBefore);
    assert.equal(await readFile(journalPath(prepared.root, prepared.missionId), "utf8"), journalBefore);
    assert.equal(await readFile(projectionPath, "utf8"), projectionBefore);
    assert.equal((await lstat(projectionPath)).ino, projectionStatBefore.ino);
    assert.doesNotMatch(`${followUpRun.stdout}${followUpRun.stderr}`, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
  }

  const exactFinding = "The exact current behavior violates the inspected boundary.";
  const failed = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "FAIL", "--guided-review-finding", exactFinding,
    "--guided-review-question-digest", active.questionEnvelope.questionDigest,
    "--passcode-stdin", "--json"], { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(failed.status, 0, failed.stderr);
  const failedOutput = JSON.parse(failed.stdout);
  let session = JSON.parse(await readFile(sessionPath, "utf8"));
  assert.deepEqual({ observation: session.decisions.at(-1).observation, finding: session.decisions.at(-1).finding },
    { observation: "FAIL", finding: exactFinding });

  const exactCondition = "Proceed only after the named boundary is corrected.";
  const conditional = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "CONDITIONAL_PASS", "--guided-review-condition", exactCondition,
    "--guided-review-question-digest", failedOutput.questionEnvelope.questionDigest,
    "--passcode-stdin", "--json"], { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(conditional.status, 0, conditional.stderr);
  const conditionalOutput = JSON.parse(conditional.stdout);
  session = JSON.parse(await readFile(sessionPath, "utf8"));
  assert.deepEqual({ observation: session.decisions.at(-1).observation, condition: session.decisions.at(-1).condition },
    { observation: "CONDITIONAL_PASS", condition: exactCondition });

  await unlink(conditionalOutput.projection.projectionPath);
  assert.equal(await lstat(conditionalOutput.projection.projectionPath).then(() => true, () => false), false);
  const passed = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-answer", "PASS",
    "--guided-review-question-digest", conditionalOutput.questionEnvelope.questionDigest, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
  assert.equal(passed.status, 0, passed.stderr);
  session = JSON.parse(await readFile(sessionPath, "utf8"));
  assert.equal(session.decisions.at(-1).observation, "PASS");
  assert.notEqual(session.currentStepId, active.currentStep.stepId);
  assert.equal(await lstat(passed.status === 0 ? JSON.parse(passed.stdout).projection.projectionPath : projectionPath).then(() => true, () => false), true);
  const freshPreparation = await resolvePreparedMissionTransitionV1({ missionId: prepared.missionId, repositoryRoot: prepared.root });
  assert.equal(freshPreparation.state, "publication_ready");
  const resolution = await resolveGuidedReviewRoutePreparationHostV1({ preparation: freshPreparation, repositoryRoot: prepared.root });
  assert.equal(resolution.state, "guided_review_ready");
  const expectedSessionDigest = session.sessionDigest;
  const decisionInput = { repositoryRoot: prepared.root, resolution, expectedSessionDigest, disposition: "pass",
    observation: "PASS", finding: null, condition: null, decidedAt: new Date().toISOString() };
  const firstCas = await answerCurrentGuidedReviewSessionHostV1(decisionInput);
  assert.equal(firstCas.state, "ready", JSON.stringify(firstCas));
  const staleCas = await answerCurrentGuidedReviewSessionHostV1(decisionInput);
  assert.equal(staleCas.state, "invalid");
  assert.equal(staleCas.code, "GUIDED_REVIEW_ANSWER_STALE");
  assert.equal(await readFile(journalPath(prepared.root, prepared.missionId), "utf8"), journalBefore);
});

async function completedPreparedGuidedReviewFixture() {
  const prepared = await preparedPublicationCliFixture(["guided_review_required"]);
  const evidence = await preparedGuidedReviewContext(prepared);
  const routedRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "unused\n" });
  assert.equal(routedRun.status, 0, routedRun.stderr);
  const routed = JSON.parse(routedRun.stdout);
  await authorPreparedFuryRoute(prepared, routed);
  const activeRun = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
    "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
  { env: { HOME: prepared.homeRoot }, input: "unused\n" });
  assert.equal(activeRun.status, 0, JSON.stringify(activeRun));
  const active = JSON.parse(activeRun.stdout);
  const playbook = JSON.parse(await readFile(active.paths.playbookPath, "utf8"));
  let session = JSON.parse(await readFile(active.paths.sessionPath, "utf8"));
  while (session.state !== "completed") session = await passCurrentGuidedReviewStep(prepared, active.paths, session.decisions.length + 1);
  return { prepared, routed, active, playbook, session };
}

test("completed YES revalidates before display and after signing; every route artifact or HEAD mutation appends zero", async (t) => {
  for (const kind of ["request", "ledger", "overlay", "playbook", "session", "graph", "HEAD"]) await t.test(kind, async () => {
    const value = await completedPreparedGuidedReviewFixture();
    const path = journalPath(value.prepared.root, value.prepared.missionId);
    const before = await readFile(path, "utf8");
    const result = await runPreparedYesAtDecision(value.prepared, async () => {
      if (kind === "HEAD") {
        await writeFile(join(value.prepared.root, "implementation.md"), "mutated during Guided Review signing\n");
        runGit(value.prepared.root, ["add", "implementation.md"]);
        runGit(value.prepared.root, ["commit", "-qm", "mutate guided review head"]);
        return;
      }
      const target = kind === "request" ? value.routed.paths.routeRequestPath
        : kind === "ledger" ? join(value.prepared.root, ".shield", "dispatch-receipts.jsonl")
          : kind === "overlay" ? value.routed.paths.routeOverlayPath
            : kind === "playbook" ? value.active.paths.playbookPath
              : kind === "graph" ? deriveMissionReviewedTransitionGraphMaterializationPathV1(
                value.prepared.root,
                value.prepared.missionId,
              ).graphPath
                : value.active.paths.sessionPath;
      if (kind === "ledger") await writeFile(target, `${await readFile(target, "utf8")}{malformed\n`);
      else {
        const artifact = JSON.parse(await readFile(target, "utf8"));
        artifact.schemaVersion = 99;
        await writeFile(target, canonicalJson(artifact));
      }
    });
    assert.equal(result.mutated, true, kind);
    assert.equal(result.status, 1, `${kind}: ${result.stderr}`);
    assert.match(result.stderr, /changed while authorization was being signed|no longer complete|INVALID|MALFORMED|HEAD|ledger|graph/iu, kind);
    assert.equal(await readFile(path, "utf8"), before, kind);
  });
});

test("completed YES read-only reload never recreates a deleted request, overlay, playbook, or session", async (t) => {
  for (const phase of ["before-display", "after-signing"]) for (const kind of ["request", "overlay", "playbook", "session"]) await t.test(`${phase}:${kind}`, async () => {
    const value = await completedPreparedGuidedReviewFixture();
    const journal = journalPath(value.prepared.root, value.prepared.missionId);
    const before = await readFile(journal, "utf8");
    const target = kind === "request" ? value.routed.paths.routeRequestPath
      : kind === "overlay" ? value.routed.paths.routeOverlayPath
        : kind === "playbook" ? value.active.paths.playbookPath : value.active.paths.sessionPath;
    const result = phase === "after-signing"
      ? await runPreparedYesAtDecision(value.prepared, async () => unlink(target))
      : await (async () => {
          await unlink(target);
          const child = run(value.prepared.root, ["mission", "prepare-next", "--mission-id", value.prepared.missionId,
            "--guided-review-choice", "yes", "--passcode-stdin", "--json"],
          { env: { HOME: value.prepared.homeRoot }, input: "prepared-passcode\n" });
          return { ...child, mutated: true };
        })();
    assert.equal(result.mutated, true, `${phase}:${kind}`);
    assert.equal(result.status, 1, `${kind}: ${result.stderr}`);
    assert.match(result.stderr, /no longer complete|no longer ready|missing|not found|unavailable|failed/iu, kind);
    await assert.rejects(readFile(target), { code: "ENOENT" });
    assert.equal(await readFile(journal, "utf8"), before, kind);
  });
});

test("prepare-next No and Cancel reject route context before PIN and preserve their one-PIN/no-effect boundaries", async () => {
  for (const choice of ["no", "cancel"]) {
    const prepared = await preparedPublicationCliFixture();
    const evidence = await preparedGuidedReviewContext(prepared);
    const path = journalPath(prepared.root, prepared.missionId);
    const before = await readFile(path, "utf8");
    const rejected = run(
      prepared.root,
      ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", choice,
        "--guided-review-context", evidence.contextPath, "--passcode-stdin", "--json"],
      { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" },
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, new RegExp(`${choice === "no" ? "No" : "Cancel"} cannot include --guided-review-context`, "u"));
    assert.doesNotMatch(rejected.stderr, /Passcode:|SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/u);
    assert.equal(await readFile(path, "utf8"), before);
  }

  const prepared = await preparedPublicationCliFixture();
  const beforeEntries = await readJournalEntries(prepared.root, prepared.missionId);
  const accepted = run(
    prepared.root,
    ["mission", "prepare-next", "--mission-id", prepared.missionId, "--guided-review-choice", "no", "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "prepared-passcode\n" },
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal((accepted.stderr.match(/SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/gu) ?? []).length, 1);
  const afterEntries = await readJournalEntries(prepared.root, prepared.missionId);
  assert.equal(afterEntries.length, beforeEntries.length + 1);
  assert.equal(afterEntries.at(-1).type, "review.publication_authorized");
  assert.equal(afterEntries.filter(({ type }) => type === "review.publication_authorized").length,
    beforeEntries.filter(({ type }) => type === "review.publication_authorized").length + 1);
});

test("prepare-next No and Cancel never resume Guided Review or inspect poisoned overlay and Fury state", async (t) => {
  for (const choice of ["no", "cancel"]) await t.test(choice, async () => {
    const prepared = await preparedPublicationCliFixture();
    const outside = await mkdtemp(join(tmpdir(), "shield-poisoned-guided-review-"));
    await writeFile(join(outside, "route-overlay.json"), "{malformed\n");
    await symlink(outside, join(prepared.root, ".shield", "tmp", "guided-review"));
    const ledger = join(prepared.root, ".shield", "dispatch-receipts.jsonl");
    const ledgerBefore = await readFile(ledger, "utf8");
    const rejectedAnswer = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", choice, "--guided-review-answer", "PASS", "--guided-review-question-digest", `sha256:${"x".repeat(43)}`,
      "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: "must-not-be-read\n" });
    assert.equal(rejectedAnswer.status, 1);
    assert.match(rejectedAnswer.stderr, /Only the Guided Review Yes route accepts/u);
    assert.doesNotMatch(`${rejectedAnswer.stdout}${rejectedAnswer.stderr}`, /ROUTE|OVERLAY|FURY|DISPATCH_LEDGER|Passcode:/u);
    const result = run(prepared.root, ["mission", "prepare-next", "--mission-id", prepared.missionId,
      "--guided-review-choice", choice, "--passcode-stdin", "--json"],
    { env: { HOME: prepared.homeRoot }, input: choice === "no" ? "prepared-passcode\n" : "must-not-be-read\n" });
    assert.equal(result.status, choice === "no" ? 0 : 1, result.stderr);
    assert.equal((result.stderr.match(/SHIELD_REVIEW_PUBLICATION_DECISION_BEGIN/gu) ?? []).length, choice === "no" ? 1 : 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /ROUTE|OVERLAY|FURY|DISPATCH_LEDGER|Passcode:/u);
    assert.equal(await readFile(ledger, "utf8"), ledgerBefore);
  });
});

test("schema-9 publication-authorize CLI signs once, retries without passcode, queues, and rejects file-delivered outcomes", async () => {
  const { root } = await fixture();
  const homeRoot = join(root, ".shield", "tmp", "home");
  await mkdir(homeRoot, { recursive: true });
  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "publication-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);

  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"]);
  await writeFile(join(root, "AGENTS.md"), "ordinary tracked file\n");
  runGit(root, ["add", "package.json", "mission-brief.json", "AGENTS.md", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"]);
  runGit(root, ["commit", "-qm", "publication base"]);
  const baseRevision = runGit(root, ["rev-parse", "HEAD"]);
  await writeFile(join(root, "review-artifact.md"), "schema 9 publication\n");
  await symlink("AGENTS.md", join(root, ":AGENTS.md"));
  runGit(root, ["add", "review-artifact.md", "./:AGENTS.md"]);
  runGit(root, ["commit", "-qm", "publication head"]);

  const missionId = "mission:cli-schema9-publication";
  const created = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Exercise the supported schema-9 review publication lifecycle.",
    subjectId: "issue:149",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: ["hill", "may", "coulson"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-05T00:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const temporaryRoot = join(root, ".shield", "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const { revisionId: _revisionId, ...briefContent } = created;
  await writeFile(join(temporaryRoot, "publication-brief.json"), `${JSON.stringify(briefContent, null, 2)}\n`);
  await writeFile(join(temporaryRoot, "publication-authorize.json"), `${JSON.stringify({
    baseRevision,
    authorizedPaths: ["review-artifact.md"],
    permittedEffects: ["review.comment.publish"],
  }, null, 2)}\n`);

  const begun = run(root, ["mission", "begin", "--profile-aware", "--brief", ".shield/tmp/publication-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const authorizedMission = run(
    root,
    ["mission", "authorize", "--mission-id", missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "publication-passcode\n" },
  );
  assert.equal(authorizedMission.status, 0, authorizedMission.stderr);

  await writeFile(join(temporaryRoot, "publication-colon-path.json"), `${JSON.stringify({
    baseRevision,
    authorizedPaths: [":AGENTS.md", "review-artifact.md"],
    permittedEffects: ["review.comment.publish"],
  }, null, 2)}\n`);
  const beforeColonPath = await readFile(journalPath(root, missionId), "utf8");
  const colonPath = run(
    root,
    ["mission", "publication-authorize", "--mission-id", missionId, "--input", ".shield/tmp/publication-colon-path.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "publication-passcode\n" },
  );
  assert.equal(colonPath.status, 1);
  assert.match(colonPath.stderr, /symlink_path_denied/u);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), beforeColonPath);
  await unlink(join(root, ":AGENTS.md"));
  runGit(root, ["add", "--all"]);
  runGit(root, ["commit", "-qm", "remove colon path"]);

  const publicationAuthorized = run(
    root,
    ["mission", "publication-authorize", "--mission-id", missionId, "--input", ".shield/tmp/publication-authorize.json", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "publication-passcode\n" },
  );
  assert.equal(publicationAuthorized.status, 0, publicationAuthorized.stderr);
  let projection = JSON.parse(publicationAuthorized.stdout);
  const authorizationId = `authorization:${missionId}:review-publish:2`;
  assert.equal(projection.publicationAuthorizations[0].authorization.authorizationId, authorizationId);
  assert.equal(projection.publicationAuthorizations[0].authority.authorityRef, authorizationId);
  assert.equal(projection.publicationAuthorizations[0].authorization.sourceRef, "cli:publication-authorize:2");

  const bytesAfterPublicationAuthorization = await readFile(journalPath(root, missionId), "utf8");
  const publicationRetry = run(
    root,
    ["mission", "publication-authorize", "--mission-id", missionId, "--input", ".shield/tmp/publication-authorize.json", "--json"],
    { env: { HOME: homeRoot }, nodeArgs: fixedClockNodeArgs("2026-08-13T00:03:00Z") },
  );
  assert.equal(publicationRetry.status, 0, publicationRetry.stderr);
  assert.deepEqual(JSON.parse(publicationRetry.stdout), {
    schemaVersion: 1,
    state: "publication_already_authorized",
    missionId,
    missionRevisionId: created.revisionId,
    authorizationId,
    authorityDigest: projection.publicationAuthorizations[0].authorization.authorityDigest,
    journalSequence: 2,
  });
  assert.doesNotMatch(`${publicationRetry.stdout}${publicationRetry.stderr}`, /Passcode:|passcode|privateKey|signing material/iu);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), bytesAfterPublicationAuthorization);

  const humanPublicationRetry = run(
    root,
    ["mission", "publication-authorize", "--mission-id", missionId, "--input", ".shield/tmp/publication-authorize.json"],
    { env: { HOME: homeRoot } },
  );
  assert.equal(humanPublicationRetry.status, 0, humanPublicationRetry.stderr);
  assert.match(humanPublicationRetry.stdout, /^ALREADY AUTHORIZED — nothing repeated\.\n/u);
  assert.doesNotMatch(`${humanPublicationRetry.stdout}${humanPublicationRetry.stderr}`, /Passcode:/u);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), bytesAfterPublicationAuthorization);

  await writeFile(join(temporaryRoot, "publication-request.json"), `${JSON.stringify({
    authorizationId,
    operation: "publish_status",
    targetRef: "github:issue:149",
    requestedEffects: ["review.comment.publish"],
  }, null, 2)}\n`);
  const repositoryConfigPath = join(root, ".shield", "config.json");
  const repositoryConfig = JSON.parse(await readFile(repositoryConfigPath, "utf8"));
  repositoryConfig.adapterIds = ["atlassian"];
  await writeFile(repositoryConfigPath, `${JSON.stringify(repositoryConfig, null, 2)}\n`);
  const beforeMissingGitHub = await readFile(journalPath(root, missionId), "utf8");
  const missingGitHub = run(root, [
    "mission", "publication-request", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-request.json", "--json",
  ]);
  assert.equal(missingGitHub.status, 1);
  assert.match(missingGitHub.stderr, /requires github/iu);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), beforeMissingGitHub);

  repositoryConfig.adapterIds = ["github", "atlassian"];
  await writeFile(repositoryConfigPath, `${JSON.stringify(repositoryConfig, null, 2)}\n`);
  const requested = run(root, [
    "mission", "publication-request", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-request.json", "--json",
  ]);
  assert.equal(requested.status, 0, requested.stderr);
  projection = JSON.parse(requested.stdout);
  const request = projection.communication.requests[0];
  assert.equal(request.requestId, `request:${missionId}:review-publish:3`);
  assert.equal(request.adapterId, "github");
  assert.equal(request.state, "queued");

  const authority = projection.publicationAuthorizations[0].authority;
  const scope = evaluateReviewPublicationV1(authority, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId,
    subjectId: created.subjectId,
    missionRevisionId: created.revisionId,
    repositoryId: authority.repositoryId,
    canonicalRepositoryRoot: authority.canonicalRepositoryRoot,
    branch: authority.branch,
    baseRevisionId: authority.baseRevisionId,
    headRevisionId: authority.headRevisionId,
    proposedChangedPaths: ["review-artifact.md"],
    observedChangedPaths: ["review-artifact.md"],
    requestedEffects: ["review.comment.publish"],
    observedSymlinkPaths: [],
    observedGitlinkPaths: [],
    workspaceClean: true,
  });
  assert.equal(scope.state, "allowed");
  const candidate = {
    adapterContractVersion: 2,
    adapterId: "github",
    candidateKind: "communication_result",
    candidateId: "candidate:cli:schema9:publication:4",
    missionId,
    subjectId: created.subjectId,
    revisionId: created.revisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: "github:issue:149:readback",
    capturedAt: { value: new Date().toISOString(), provenance: "hostTrusted" },
    payload: {
      requestId: request.requestId,
      outcome: "delivered",
      failureReason: null,
      receiptRef: "github:issue:149:comment:1",
      operation: request.operation,
      targetRef: request.targetRef,
      scopeDigest: scope.scopeDigest,
      publicationBinding: scope.binding,
    },
  };
  await writeFile(join(temporaryRoot, "publication-delivered.json"), `${JSON.stringify(candidate, null, 2)}\n`);
  const beforeForgedDelivered = await readFile(journalPath(root, missionId), "utf8");
  const forgedDelivered = run(root, [
    "mission", "publication-result", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-delivered.json", "--json",
  ]);
  assert.equal(forgedDelivered.status, 1);
  assert.match(forgedDelivered.stderr, /File-supplied delivered publication results are forbidden/u);
  assert.equal(await readFile(journalPath(root, missionId), "utf8"), beforeForgedDelivered);

  candidate.payload.outcome = "failed";
  candidate.payload.failureReason = "host_rejected";
  candidate.payload.receiptRef = null;
  await writeFile(join(temporaryRoot, "publication-failed.json"), `${JSON.stringify(candidate, null, 2)}\n`);
  const failed = run(root, [
    "mission", "publication-result", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-failed.json", "--json",
  ]);
  assert.equal(failed.status, 0, failed.stderr);
  projection = JSON.parse(failed.stdout);
  assert.equal(projection.communication.state, "failed");
  assert.equal(projection.communication.requests[0].state, "failed");

  const requestedAgain = run(root, [
    "mission", "publication-request", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-request.json", "--json",
  ]);
  assert.equal(requestedAgain.status, 0, requestedAgain.stderr);
  projection = JSON.parse(requestedAgain.stdout);
  const secondRequest = projection.communication.requests[1];
  assert.equal(secondRequest.requestId, `request:${missionId}:review-publish:5`);
  const unknownCandidate = structuredClone(candidate);
  unknownCandidate.candidateId = "candidate:cli:schema9:publication:6";
  unknownCandidate.payload.requestId = secondRequest.requestId;
  unknownCandidate.payload.outcome = "unknown";
  unknownCandidate.payload.failureReason = "unknown";
  unknownCandidate.payload.receiptRef = null;
  unknownCandidate.capturedAt = { value: new Date().toISOString(), provenance: "hostTrusted" };
  await writeFile(join(temporaryRoot, "publication-unknown.json"), `${JSON.stringify(unknownCandidate, null, 2)}\n`);
  const unknown = run(root, [
    "mission", "publication-result", "--mission-id", missionId,
    "--input", ".shield/tmp/publication-unknown.json", "--json",
  ]);
  assert.equal(unknown.status, 0, unknown.stderr);
  projection = JSON.parse(unknown.stdout);
  assert.equal(projection.communication.requests[1].state, "unknown");

  const entries = await readJournalEntries(root, missionId);
  assert.deepEqual(entries.slice(2).map(({ type }) => type), [
    "review.publication_authorized", "communication.requested", "communication.result_recorded",
    "communication.requested", "communication.result_recorded",
  ]);
  assert.equal(entries[2].entryId, `entry:${missionId}:2`);
  assert.equal(entries[3].entryId, `entry:${missionId}:3`);
  const restarted = run(root, ["mission", "status", "--mission-id", missionId, "--json"]);
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), projection);
});

test("schema-9 publication freshness rejects every post-passcode repository and journal drift class", () => {
  const observation = {
    configuredRepositoryId: "RanSolo/fixture",
    originUrl: "https://github.com/RanSolo/fixture.git",
    remoteRepositoryId: "RanSolo/fixture",
    canonicalRoot: "/tmp/fixture",
    gitTopLevel: "/tmp/fixture",
    branch: "agent/issue-149",
    baseRevision: "a".repeat(40),
    headRevision: "b".repeat(40),
    baseAncestor: true,
    statusEntries: [],
    changedPaths: ["review-artifact.md"],
    baseTreeEntries: [],
    headTreeEntries: [{ mode: "100644", type: "blob", path: "review-artifact.md" }],
  };
  const cases = [
    ["repository configuration", { configurationIdentity: "config:changed" }],
    ["configured repository ID", { configuredRepositoryId: "RanSolo/other" }],
    ["origin URL", { originUrl: "https://github.com/RanSolo/other.git" }],
    ["remote repository ID", { remoteRepositoryId: "RanSolo/other" }],
    ["canonical root", { canonicalRoot: "/tmp/other" }],
    ["Git top level", { gitTopLevel: "/tmp/other" }],
    ["branch", { branch: "agent/other" }],
    ["base revision", { baseRevision: "c".repeat(40) }],
    ["HEAD revision", { headRevision: "d".repeat(40) }],
    ["ancestry", { baseAncestor: false }],
    ["status", { statusEntries: ["?? untracked"] }],
    ["changed paths", { changedPaths: ["other.md"] }],
    ["tree path", { headTreeEntries: [{ mode: "100644", type: "blob", path: "other.md" }] }],
    ["symlink mode", { headTreeEntries: [{ mode: "120000", type: "blob", path: "review-artifact.md" }] }],
    ["gitlink mode", { headTreeEntries: [{ mode: "160000", type: "commit", path: "review-artifact.md" }] }],
    ["journal sequence", { journalSequence: 3 }],
  ];
  for (const [label, drift] of cases) {
    const freshObservation = structuredClone(observation);
    const { configurationIdentity, journalSequence, ...observationDrift } = drift;
    Object.assign(freshObservation, observationDrift);
    assert.throws(
      () => assertPublicationAuthorizationFreshness({
        initialConfigurationIdentity: "config:initial",
        freshConfigurationIdentity: configurationIdentity ?? "config:initial",
        initialObservation: observation,
        freshObservation,
        initialJournalSequence: 2,
        freshJournalSequence: journalSequence ?? 2,
      }),
      /changed while authorization was being signed/u,
      label,
    );
  }
});

test("GitHub publication config freshness rejects byte, identity, meaning, and membership drift", () => {
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    adapterIds: ["github", "atlassian"],
    coulsonBindingRef: "ed25519:sha256:coulson",
    fitzBindingRef: "ed25519:sha256:fitz",
  });
  const initial = { config, bytes: formatShieldConfig(config), identity: "1:2:420" };
  assert.doesNotThrow(() => assertRepositoryConfigFresh(initial, structuredClone(initial)));
  assert.throws(() => assertRepositoryConfigFresh(initial, { ...structuredClone(initial), bytes: `${initial.bytes}\n` }), /drifted/iu);
  assert.throws(() => assertRepositoryConfigFresh(initial, { ...structuredClone(initial), identity: "1:3:420" }), /drifted/iu);
  const changed = structuredClone(initial);
  changed.config.paths.reports = ".shield/other-reports";
  changed.bytes = formatShieldConfig(changed.config);
  assert.throws(() => assertRepositoryConfigFresh(initial, changed), /drifted/iu);
  const withoutGitHub = structuredClone(initial);
  withoutGitHub.config.adapterIds = ["atlassian"];
  withoutGitHub.bytes = formatShieldConfig(withoutGitHub.config);
  assert.throws(() => assertRepositoryConfigFresh(initial, withoutGitHub), /requires github/iu);
});

test("packed CLI rejects mixed schema 9 and legacy entries without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const mixed = `${JSON.stringify(entry)}\n${JSON.stringify({ ...entry, schemaVersion: 8 })}\n`;
  await writeFile(journalPath, mixed);
  const result = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /schema_mixed/u);
  assert.equal(await readFile(journalPath, "utf8"), mixed);
});

test("packed CLI rejects an unknown journal schema without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const unknown = `${JSON.stringify({ ...entry, schemaVersion: 10 })}\n`;
  await writeFile(journalPath, unknown);
  const result = run(root, ["mission", "status", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /unsupported_schema/u);
  assert.equal(await readFile(journalPath, "utf8"), unknown);
});

test("packed CLI status rejects a profile-aware journal stored for another mission", async () => {
  const { root, journalPath: sourcePath } = await profileAwareFixture();
  const requestedMissionId = "mission:cli-profile-aware-alias";
  const bytes = await readFile(sourcePath, "utf8");
  const mismatchedPath = journalPath(root, requestedMissionId);
  await writeFile(mismatchedPath, bytes);
  const result = run(root, ["mission", "status", "--mission-id", requestedMissionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mission_mismatch/u);
  assert.equal(await readFile(mismatchedPath, "utf8"), bytes);
});

test("packed CLI report rejects a legacy journal stored for another mission", async () => {
  const { root, brief } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const bytes = await readFile(journalPath(root, brief.missionId), "utf8");
  const requestedMissionId = "mission:cli-alias";
  const mismatchedPath = journalPath(root, requestedMissionId);
  await writeFile(mismatchedPath, bytes);
  const result = run(root, ["mission", "report", "--mission-id", requestedMissionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /mission_mismatch/u);
  assert.equal(await readFile(mismatchedPath, "utf8"), bytes);
});

test("packed CLI rejects malformed profile-aware JSON without changing journal bytes", async () => {
  const { root, brief, entry, journalPath } = await profileAwareFixture();
  const malformed = `${JSON.stringify(entry)}\n{not-json}\n`;
  await writeFile(journalPath, malformed);
  const result = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /recovery_required/u);
  assert.equal(await readFile(journalPath, "utf8"), malformed);
});

test("unsigned, tampered, stale-revision, and wrong-sequence evidence writes nothing", async () => {
  const { root, brief, coulson } = await fixture();
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  const projection = JSON.parse(begun.stdout).projection;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
  const before = await readFile(journalPath, "utf8");
  const cases = [];

  const unsigned = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  unsigned.signatureBase64 = "";
  cases.push(unsigned);
  const tampered = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  tampered.payload.sourceRef = "fixture-signature:tampered";
  cases.push(tampered);
  const stale = signedEvidence(coulson, projection, requirement, "approved", 1, "2020-01-01T00:01:00Z");
  stale.payload.revisionId = "sha256:stale";
  stale.signatureBase64 = sign(null, Buffer.from(canonicalJson(stale.payload)), coulson.privateKey).toString("base64");
  cases.push(stale);
  cases.push(signedEvidence(coulson, projection, requirement, "approved", 2, "2020-01-01T00:01:00Z"));

  for (let index = 0; index < cases.length; index += 1) {
    const path = await writeEvidence(root, `invalid-${index}.json`, cases[index]);
    const result = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", path, "--json"]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(await readFile(journalPath, "utf8"), before);
  }
});

test("pause, resume, and cancel are signed append-only governance commands", async () => {
  const { root, brief, coulson } = await fixture();
  let projection = JSON.parse(run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]).stdout).projection;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  for (const [command, decision, sequence, timestamp, extra] of [
    ["approve", "approved", 1, "2020-01-01T00:01:00Z", []],
    ["pause", "paused", 2, "2020-01-01T00:02:00Z", []],
    ["resume", "resumed", 3, "2020-01-01T00:03:00Z", ["--resume-state", "approved"]],
    ["cancel", "cancelled", 4, "2020-01-01T00:04:00Z", []],
  ]) {
    const path = await writeEvidence(root, `${command}.json`, signedEvidence(coulson, projection, requirement, decision, sequence, timestamp));
    if (command === "resume") {
      const journalPath = join(root, ".shield", "journals", `${Buffer.from(brief.missionId).toString("base64url")}.jsonl`);
      const beforeMismatchedResume = await readFile(journalPath, "utf8");
      const mismatched = run(root, ["mission", "resume", "--mission-id", brief.missionId, "--evidence", path, "--resume-state", "proposed", "--json"]);
      assert.equal(mismatched.status, 1, mismatched.stderr);
      assert.match(mismatched.stderr, /decision_mismatch/);
      assert.equal(await readFile(journalPath, "utf8"), beforeMismatchedResume);
    }
    const result = run(root, ["mission", command, "--mission-id", brief.missionId, "--evidence", path, ...extra, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    projection = JSON.parse(result.stdout);
  }
  assert.equal(projection.governance.state, "cancelled");
  const blocked = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]);
  assert.equal(blocked.status, 1);
});

test("conditional Simmons is waiting only when declared by the immutable brief", async () => {
  const { root, brief } = await fixture(true);
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const projection = JSON.parse(begun.stdout).projection;
  assert.deepEqual(projection.readiness.accept.requirementStatuses.map(({ requiredSeatId }) => requiredSeatId), ["fitz", "simmons"]);
  assert.equal(projection.requirements.filter(({ requiredSeatId }) => requiredSeatId === "simmons").length, 1);
  assert.equal(projection.missionId, brief.missionId);
});

test("readInteractivePasscode resolves interactive input and preserves setup lifecycle", async () => {
  const fixture = createInteractivePromptFixture();
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("dummy-passcode\n"));
  assert.equal(await attempt, "dummy-passcode");
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
  assert.equal(fixture.output.some((chunk) => chunk === "dummy-passcode"), false);
});

test("readInteractivePasscode handles cancellation and empty input", async () => {
  const cancelled = createInteractivePromptFixture();
  const cancellation = readInteractivePasscode(cancelled.inputStream, cancelled.outputStream);
  cancelled.inputStream.emitData(Buffer.from([3]));
  await assert.rejects(cancellation, /Passcode prompt cancelled\./u);
  assert.equal(cancelled.calls.on, 1);
  assert.equal(cancelled.calls.off, 1);
  assert.equal(cancelled.calls.setRawMode, 2);
  assert.equal(cancelled.calls.resume, 1);
  assert.equal(cancelled.calls.pause, 1);
  assert.equal(cancelled.output.join(""), "Passcode: \n");

  const empty = createInteractivePromptFixture();
  const emptyAttempt = readInteractivePasscode(empty.inputStream, empty.outputStream);
  empty.inputStream.emitData(Buffer.from("\n"));
  await assert.rejects(emptyAttempt, /Passcode input was empty\./u);
  assert.equal(empty.calls.on, 1);
  assert.equal(empty.calls.off, 1);
  assert.equal(empty.calls.setRawMode, 2);
  assert.equal(empty.calls.resume, 1);
  assert.equal(empty.calls.pause, 1);
  assert.equal(empty.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode resolves once and ignores post-settlement data for CRLF", async () => {
  const fixture = createInteractivePromptFixture();
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("ready\r\nignored"));
  assert.equal(await attempt, "ready");
  fixture.inputStream.emitData(Buffer.from("and-more"));
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode prefers setup failures over interactive outcomes", async () => {
  const fixture = createInteractivePromptFixture({
    syncData: Buffer.from("interactive-passcode\n"),
    failResume: true,
  });
  await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE, "u"),
  );
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
  assert.equal(fixture.output.some((chunk) => chunk.includes("interactive-passcode")), false);
});

test("readInteractivePasscode prefers cleanup failures over setup outcomes when sync settle races resume failure", async () => {
  const fixture = createInteractivePromptFixture({
    syncData: Buffer.from("interactive-passcode\n"),
    failResume: true,
    failPause: true,
  });
  const error = await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE, "u"),
  );
  const message = error instanceof Error ? error.message : `${error}`;
  assert.equal(message.includes("interactive-passcode"), false);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.calls.write, 2);
});

test("readInteractivePasscode fails if prompt write fails during setup", async () => {
  const fixture = createInteractivePromptFixture({ failPromptWrite: true });
  await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE, "u"),
  );
  assert.equal(fixture.calls.setRawMode, 0);
  assert.equal(fixture.calls.on, 0);
  assert.equal(fixture.calls.off, 0);
  assert.equal(fixture.calls.resume, 0);
  assert.equal(fixture.calls.pause, 0);
  assert.equal(fixture.calls.write, 2);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode fails if raw-mode enablement fails", async () => {
  const fixture = createInteractivePromptFixture({ failSetRawMode: true });
  await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE, "u"),
  );
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 0);
  assert.equal(fixture.calls.off, 0);
  assert.equal(fixture.calls.resume, 0);
  assert.equal(fixture.calls.pause, 0);
  assert.equal(fixture.calls.write, 2);
});

test("readInteractivePasscode fails if listener registration fails", async () => {
  const fixture = createInteractivePromptFixture({ failOnDataRegistration: true });
  await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE, "u"),
  );
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 0);
  assert.equal(fixture.calls.pause, 0);
});

test("readInteractivePasscode fails if resume fails", async () => {
  const fixture = createInteractivePromptFixture({ failResume: true });
  await assert.rejects(
    readInteractivePasscode(fixture.inputStream, fixture.outputStream),
    new RegExp(PASSCODE_PROMPT_SETUP_FAILURE_MESSAGE, "u"),
  );
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.on, 1);
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.resume, 1);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if listener removal fails and still tears down", async () => {
  const fixture = createInteractivePromptFixture({ failOff: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.output.join(""), "Passcode: \n");
});

test("readInteractivePasscode fails if raw-mode restoration fails", async () => {
  const fixture = createInteractivePromptFixture({ failSetRawModeRestore: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
});

test("readInteractivePasscode fails if pause fails", async () => {
  const fixture = createInteractivePromptFixture({ failPause: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
  assert.equal(fixture.calls.write, 2);
});

test("readInteractivePasscode fails if newline fails", async () => {
  const fixture = createInteractivePromptFixture({ failNewline: true });
  const attempt = readInteractivePasscode(fixture.inputStream, fixture.outputStream);
  fixture.inputStream.emitData(Buffer.from("authorized\n"));
  await assert.rejects(attempt, new RegExp(PASSCODE_PROMPT_CLEANUP_FAILURE_MESSAGE, "u"));
  assert.equal(fixture.calls.off, 1);
  assert.equal(fixture.calls.setRawMode, 2);
  assert.equal(fixture.calls.pause, 1);
});

test("pre-init signer bootstrap emits only a credential-free packet and creates fresh protected candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-bootstrap-empty-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-home-"));
  await writeFile(join(root, "before.txt"), "repository-free working directory\n");

  const first = run(root, BOOTSTRAP_ARGS, {
    env: { HOME: homeRoot }, unsetEnv: BOOTSTRAP_COLOR_ENVIRONMENT, input: "bootstrap-passcode\n",
  });
  assert.equal(first.status, 0, first.stderr);
  const firstPacket = JSON.parse(first.stdout);
  assert.deepEqual(Object.keys(firstPacket), [
    "schemaVersion", "seatId", "bindingId", "humanPrincipalId", "signingKeyRef", "publicKeySpkiBase64",
  ]);
  assert.deepEqual({
    schemaVersion: firstPacket.schemaVersion,
    seatId: firstPacket.seatId,
    bindingId: firstPacket.bindingId,
    humanPrincipalId: firstPacket.humanPrincipalId,
  }, {
    schemaVersion: 1,
    seatId: "coulson",
    bindingId: "binding:coulson",
    humanPrincipalId: "human:maintainer-1",
  });
  assert.equal(firstPacket.signingKeyRef, recomputeKeyRef(firstPacket.publicKeySpkiBase64));
  assert.equal(first.stdout.includes(homeRoot), false);
  assert.doesNotMatch(first.stdout, /signerPath|privateKey|ciphertext|saltBase64|ivBase64|tagBase64|passcode/iu);
  assert.equal(first.stderr, "");

  const shieldDirectory = join(homeRoot, ".shield");
  const signersDirectory = join(shieldDirectory, "signers");
  assert.equal(fileMode(await lstat(shieldDirectory)), 0o700);
  assert.equal(fileMode(await lstat(signersDirectory)), 0o700);
  const firstFiles = await readdir(signersDirectory);
  assert.equal(firstFiles.length, 1);
  const firstPath = join(signersDirectory, firstFiles[0]);
  const firstBytes = await readFile(firstPath);
  const stored = JSON.parse(firstBytes.toString("utf8"));
  assert.deepEqual(Object.keys(stored), [
    "schemaVersion", "signingKeyRef", "saltBase64", "ivBase64", "tagBase64", "ciphertextBase64",
  ]);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.signingKeyRef, firstPacket.signingKeyRef);
  assert.doesNotMatch(firstBytes.toString("utf8"), /BEGIN PRIVATE KEY/u);
  assert.equal(fileMode(await lstat(firstPath)), 0o600);

  const second = run(root, BOOTSTRAP_ARGS, {
    env: { HOME: homeRoot }, unsetEnv: BOOTSTRAP_COLOR_ENVIRONMENT, input: "bootstrap-passcode\n",
  });
  assert.equal(second.status, 0, second.stderr);
  const secondPacket = JSON.parse(second.stdout);
  assert.notEqual(secondPacket.signingKeyRef, firstPacket.signingKeyRef);
  assert.equal((await readdir(signersDirectory)).length, 2);
  assert.deepEqual(await readFile(firstPath), firstBytes);
  assert.equal(fileMode(await lstat(firstPath)), 0o600);

  const human = run(root, BOOTSTRAP_ARGS.filter((argument) => argument !== "--json"), {
    env: { HOME: homeRoot }, unsetEnv: BOOTSTRAP_COLOR_ENVIRONMENT, input: "bootstrap-passcode\n",
  });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /created in protected host storage/u);
  assert.match(human.stdout, /"publicKeySpkiBase64"/u);
  assert.equal(human.stdout.includes(homeRoot), false);
  assert.doesNotMatch(human.stdout, /signerPath|privateKey|ciphertext|saltBase64|ivBase64|tagBase64|passcode/iu);

  assert.equal(await readFile(join(root, "before.txt"), "utf8"), "repository-free working directory\n");
  await assert.rejects(lstat(join(root, ".shield")), (error) => error?.code === "ENOENT");
});

test("bootstrap CLI rejects non-Coulson, malformed, colliding, missing, root, and unknown inputs before signer creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-bootstrap-invalid-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-invalid-home-"));
  const common = ["mission", "signer", "bootstrap", "--passcode-stdin"];
  const cases = [
    [...common, "--seat", "fitz"],
    [...common, "--seat", "coulson", "--binding-id", "bad value", "--human-principal-id", "human:one"],
    [...common, "--seat", "coulson", "--binding-id", "binding:one", "--human-principal-id", "bad value"],
    [...common, "--seat", "coulson", "--binding-id", "a".repeat(257), "--human-principal-id", "human:one"],
    [...common, "--seat", "coulson", "--binding-id", "same:id", "--human-principal-id", "same:id"],
    [...common, "--seat", "coulson", "--binding-id", "binding:one"],
    [...common, "--seat", "coulson", "--binding-id", "binding:one", "--human-principal-id", "human:one", "--root", root],
    [...common, "--seat", "coulson", "--binding-id", "binding:one", "--human-principal-id", "human:one", "--unexpected"],
  ];
  for (const args of cases) {
    const rejected = run(root, args, { env: { HOME: homeRoot }, input: "must-not-appear\n" });
    assert.notEqual(rejected.status, 0, `${args.join(" ")}\n${rejected.stderr}`);
    assert.equal(rejected.stdout, "");
    assert.equal(rejected.stderr.includes("must-not-appear"), false);
    assert.equal(rejected.stderr.includes(homeRoot), false);
    await assert.rejects(lstat(join(homeRoot, ".shield")), (error) => error?.code === "ENOENT");
  }

  const short = run(root, BOOTSTRAP_ARGS, { env: { HOME: homeRoot }, input: "short\n" });
  assert.equal(short.status, 1);
  assert.match(short.stderr, /at least 8 characters/u);
  assert.equal(short.stderr.includes("short"), false);
  await assert.rejects(lstat(join(homeRoot, ".shield")), (error) => error?.code === "ENOENT");
});

test("signer creation rejects hostile closed-object inputs before key generation", async () => {
  const accessor = {};
  Object.defineProperties(accessor, {
    seatId: { enumerable: true, get() { throw new Error("accessor material"); } },
    bindingId: { enumerable: true, value: SIGNER_INPUT.bindingId },
    humanPrincipalId: { enumerable: true, value: SIGNER_INPUT.humanPrincipalId },
  });
  const inherited = Object.create(SIGNER_INPUT);
  const symbolicField = { ...SIGNER_INPUT, [Symbol("hidden")]: "value" };
  const nonEnumerable = { ...SIGNER_INPUT };
  Object.defineProperty(nonEnumerable, "bindingId", { enumerable: false });
  const candidates = [
    null,
    [],
    new Proxy({ ...SIGNER_INPUT }, {}),
    accessor,
    inherited,
    symbolicField,
    nonEnumerable,
    { ...SIGNER_INPUT, extra: "field" },
    { seatId: "coulson", bindingId: SIGNER_INPUT.bindingId },
    { ...SIGNER_INPUT, seatId: "fitz" },
    { ...SIGNER_INPUT, bindingId: "" },
    { ...SIGNER_INPUT, bindingId: "a".repeat(257) },
    { ...SIGNER_INPUT, bindingId: Symbol("binding") },
    { ...SIGNER_INPUT, humanPrincipalId: SIGNER_INPUT.bindingId },
  ];
  let keyGenerationCount = 0;
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-hostile-"));
  const dependencies = deterministicSignerDependencies(homeRoot, generateKeyPairSync("ed25519"), {
    generateKeyPair() {
      keyGenerationCount += 1;
      return generateKeyPairSync("ed25519");
    },
  });
  for (const candidate of candidates) {
    await assert.rejects(
      signerTestOnly.createSigner(candidate, "bootstrap-passcode", dependencies),
      /Signer creation input is invalid\./u,
    );
  }
  assert.equal(keyGenerationCount, 0);
  await assert.rejects(lstat(join(homeRoot, ".shield")), (error) => error?.code === "ENOENT");
});

test("bootstrap rejects static symlink and non-directory host components before key generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-bootstrap-storage-"));
  const shieldLinkHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-shield-link-"));
  const shieldTarget = await mkdtemp(join(tmpdir(), "shield-bootstrap-shield-target-"));
  await writeFile(join(shieldTarget, "sentinel"), "unchanged\n");
  await symlink(shieldTarget, join(shieldLinkHome, ".shield"));

  const shieldFileHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-shield-file-"));
  await writeFile(join(shieldFileHome, ".shield"), "not a directory\n");

  const signersLinkHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-signers-link-"));
  const signersTarget = await mkdtemp(join(tmpdir(), "shield-bootstrap-signers-target-"));
  await writeFile(join(signersTarget, "sentinel"), "unchanged\n");
  await mkdir(join(signersLinkHome, ".shield"), { mode: 0o700 });
  await symlink(signersTarget, join(signersLinkHome, ".shield", "signers"));

  const signersFileHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-signers-file-"));
  await mkdir(join(signersFileHome, ".shield"), { mode: 0o700 });
  await writeFile(join(signersFileHome, ".shield", "signers"), "not a directory\n");

  let keyGenerationCount = 0;
  for (const homeRoot of [shieldLinkHome, shieldFileHome, signersLinkHome, signersFileHome]) {
    const rejected = run(root, BOOTSTRAP_ARGS, { env: { HOME: homeRoot }, input: "bootstrap-passcode\n" });
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.equal(rejected.stdout, "");
    assert.match(rejected.stderr, /creation_failed: Signer creation failed\./u);
    assert.equal(rejected.stderr.includes(homeRoot), false);
    assert.doesNotMatch(rejected.stderr, /privateKey|ciphertext|saltBase64|ivBase64|tagBase64|bootstrap-passcode/iu);
    await assert.rejects(
      signerTestOnly.createSigner(SIGNER_INPUT, "bootstrap-passcode", deterministicSignerDependencies(
        homeRoot,
        generateKeyPairSync("ed25519"),
        { generateKeyPair() { keyGenerationCount += 1; return generateKeyPairSync("ed25519"); } },
      )),
      (error) => error?.message === CREATION_FAILED,
    );
  }
  assert.equal(keyGenerationCount, 0);
  assert.deepEqual(await readdir(shieldTarget), ["sentinel"]);
  assert.deepEqual(await readdir(signersTarget), ["sentinel"]);
  assert.equal(await readFile(join(shieldTarget, "sentinel"), "utf8"), "unchanged\n");
  assert.equal(await readFile(join(signersTarget, "sentinel"), "utf8"), "unchanged\n");
});

test("cryptographic failures use the fixed path-free creation classification", async () => {
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-crypto-"));
  const protectedDetail = `${homeRoot} ciphertextBase64 private material`;
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(homeRoot, generateKeyPairSync("ed25519"), {
        generateKeyPair() { throw new Error(protectedDetail); },
      }),
    ),
    (error) => error?.message === CREATION_FAILED && !error.message.includes(protectedDetail),
  );
  assert.deepEqual(await readdir(join(homeRoot, ".shield", "signers")), []);
});

test("deterministic signer collision and final symlink preserve original targets", async () => {
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-collision-"));
  const keyPair = generateKeyPairSync("ed25519");
  const dependencies = deterministicSignerDependencies(homeRoot, keyPair);
  const created = await signerTestOnly.createSigner(SIGNER_INPUT, "bootstrap-passcode", dependencies);
  assert.equal(Object.isFrozen(created), true);
  const originalBytes = await readFile(created.signerPath);
  const originalMode = fileMode(await lstat(created.signerPath));
  assert.equal(originalMode, 0o600);
  await assert.rejects(
    signerTestOnly.createSigner(SIGNER_INPUT, "bootstrap-passcode", dependencies),
    (error) => error?.message === CREATION_FAILED && !error.message.includes(homeRoot),
  );
  assert.deepEqual(await readFile(created.signerPath), originalBytes);
  assert.equal(fileMode(await lstat(created.signerPath)), originalMode);

  const symlinkHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-final-link-"));
  const signersDirectory = join(symlinkHome, ".shield", "signers");
  await mkdir(signersDirectory, { recursive: true, mode: 0o700 });
  const symlinkKeyPair = generateKeyPairSync("ed25519");
  const target = join(symlinkHome, "foreign-target");
  await writeFile(target, "foreign bytes\n", { mode: 0o600 });
  const candidate = join(signersDirectory, expectedSignerFilename(symlinkKeyPair));
  await symlink(target, candidate);
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(symlinkHome, symlinkKeyPair),
    ),
    (error) => error?.message === CREATION_FAILED,
  );
  assert.equal((await lstat(candidate)).isSymbolicLink(), true);
  assert.equal(await readFile(target, "utf8"), "foreign bytes\n");
});

test("retained signer handle corrects restrictive umask and persists a verified 0600 record", async () => {
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-umask-"));
  await mkdir(join(homeRoot, ".shield", "signers"), { recursive: true, mode: 0o700 });
  const priorUmask = process.umask(0o777);
  let created;
  try {
    created = await signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(homeRoot),
    );
  } finally {
    process.umask(priorUmask);
  }
  assert.equal(fileMode(await lstat(created.signerPath)), 0o600);
  const record = JSON.parse(await readFile(created.signerPath, "utf8"));
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.signingKeyRef, created.signingKeyRef);
});

test("write, partial write, fchmod, fsync, final fstat, and post-verify failures clean the same inode", async () => {
  const cases = [
    ["write", () => ({
      write: async () => { throw new Error("write protected detail"); },
    })],
    ["partial write", () => ({
      write: async (handle, content) => {
        await handle.write(content.subarray(0, 17));
        throw new Error("partial write protected detail");
      },
    })],
    ["fchmod", () => ({
      chmod: async () => { throw new Error("fchmod protected detail"); },
    })],
    ["fsync", () => ({
      sync: async () => { throw new Error("fsync protected detail"); },
    })],
    ["final fstat", () => {
      let calls = 0;
      return {
        stat: async (handle) => {
          calls += 1;
          if (calls === 2) throw new Error("fstat protected detail");
          return handle.stat();
        },
      };
    }],
    ["post verify", () => ({
      stage: async (stage) => {
        if (stage === "verified") throw new Error("post-verify protected detail");
      },
    })],
  ];

  for (const [label, overrides] of cases) {
    const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-cleanup-"));
    const protectedDetail = `${homeRoot} ${label}`;
    await assert.rejects(
      signerTestOnly.createSigner(
        SIGNER_INPUT,
        "bootstrap-passcode",
        deterministicSignerDependencies(homeRoot, generateKeyPairSync("ed25519"), overrides()),
      ),
      (error) => error?.code === "creation_failed" && error.message === CREATION_FAILED && !error.message.includes(protectedDetail),
      label,
    );
    assert.deepEqual(await readdir(join(homeRoot, ".shield", "signers")), [], label);
  }
});

test("uncertain initial identity and close failure return recovery-required without success", async () => {
  const identityHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-identity-"));
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(identityHome, generateKeyPairSync("ed25519"), {
        stat: async () => { throw new Error(`${identityHome} fstat material`); },
      }),
    ),
    (error) => error?.code === "recovery_required" && error.message === RECOVERY_REQUIRED && !error.message.includes(identityHome),
  );
  assert.equal((await readdir(join(identityHome, ".shield", "signers"))).length, 1);

  const closeHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-close-"));
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(closeHome, generateKeyPairSync("ed25519"), {
        close: async (handle) => {
          await handle.close();
          throw new Error(`${closeHome} close material`);
        },
      }),
    ),
    (error) => error?.code === "recovery_required" && error.message === RECOVERY_REQUIRED && !error.message.includes(closeHome),
  );
  assert.deepEqual(await readdir(join(closeHome, ".shield", "signers")), []);
});

test("pathname identity mismatch preserves the foreign target and returns recovery-required", async () => {
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-path-mismatch-"));
  let foreignPath;
  let displacedPath;
  const dependencies = deterministicSignerDependencies(homeRoot, generateKeyPairSync("ed25519"), {
    stage: async (stage, context) => {
      if (stage !== "before_path_identity") return;
      foreignPath = context.signerPath;
      displacedPath = `${context.signerPath}.displaced`;
      await rename(context.signerPath, displacedPath);
      await writeFile(context.signerPath, "foreign replacement\n", { mode: 0o600, flag: "wx" });
    },
  });
  await assert.rejects(
    signerTestOnly.createSigner(SIGNER_INPUT, "bootstrap-passcode", dependencies),
    (error) => error?.message === RECOVERY_REQUIRED && !error.message.includes(homeRoot),
  );
  assert.equal(await readFile(foreignPath, "utf8"), "foreign replacement\n");
  assert.equal((await lstat(displacedPath)).isFile(), true);
  assert.equal((await readdir(join(homeRoot, ".shield", "signers"))).length, 2);
});

test("unlink and cleanup-confirmation failures return recovery-required without false cleanup claims", async () => {
  const unlinkHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-unlink-"));
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(unlinkHome, generateKeyPairSync("ed25519"), {
        stage: async (stage) => {
          if (stage === "verified") throw new Error("force cleanup");
        },
        pathUnlink: async () => { throw new Error(`${unlinkHome} unlink material`); },
      }),
    ),
    (error) => error?.message === RECOVERY_REQUIRED && !error.message.includes(unlinkHome),
  );
  assert.equal((await readdir(join(unlinkHome, ".shield", "signers"))).length, 1);

  const confirmationHome = await mkdtemp(join(tmpdir(), "shield-bootstrap-confirmation-"));
  let lstatCalls = 0;
  await assert.rejects(
    signerTestOnly.createSigner(
      SIGNER_INPUT,
      "bootstrap-passcode",
      deterministicSignerDependencies(confirmationHome, generateKeyPairSync("ed25519"), {
        stage: async (stage) => {
          if (stage === "verified") throw new Error("force cleanup");
        },
        pathLstat: async (path) => {
          lstatCalls += 1;
          if (lstatCalls === 2) throw Object.assign(new Error(`${confirmationHome} confirmation material`), { code: "EIO" });
          return lstat(path);
        },
      }),
    ),
    (error) => error?.message === RECOVERY_REQUIRED && !error.message.includes(confirmationHome),
  );
  assert.deepEqual(await readdir(join(confirmationHome, ".shield", "signers")), []);
});

test("bootstrap leaves an existing Git worktree and repository bytes unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-bootstrap-repository-"));
  const homeRoot = await mkdtemp(join(tmpdir(), "shield-bootstrap-repository-home-"));
  await writeFile(join(root, "tracked.txt"), "tracked bytes\n");
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "shield@example.invalid"]);
  runGit(root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(root, ["add", "tracked.txt"]);
  runGit(root, ["commit", "-qm", "bootstrap fixture"]);
  const beforeHead = runGit(root, ["rev-parse", "HEAD"]);
  const beforeStatus = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const beforeBytes = await readFile(join(root, "tracked.txt"));

  const result = run(root, BOOTSTRAP_ARGS, { env: { HOME: homeRoot }, input: "bootstrap-passcode\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(runGit(root, ["rev-parse", "HEAD"]), beforeHead);
  assert.equal(runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]), beforeStatus);
  assert.deepEqual(await readFile(join(root, "tracked.txt")), beforeBytes);
  await assert.rejects(lstat(join(root, ".shield")), (error) => error?.code === "ENOENT");
});

test("help and supervised mission docs state the authority and signer-storage threat boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-bootstrap-help-"));
  const help = run(root, ["help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /mission signer bootstrap --seat coulson --binding-id <id> --human-principal-id <id>/u);
  const documentation = await readFile(join(packageRoot, "SUPERVISED_MISSION.md"), "utf8");
  assert.match(documentation, /Pre-initialization Coulson signer bootstrap/u);
  assert.match(documentation, /does not emit or store plaintext\s+private key material/u);
  assert.match(documentation, /encrypted schema-1 signer record is stored only in\s+host-local protected signer storage/u);
  assert.match(documentation, /no other process running as the same OS user\s+concurrently mutates/u);
  assert.match(documentation, /does not claim race-free ancestor confinement/u);
  assert.match(documentation, /authority-neutral/u);
  assert.match(documentation, /Issue #216 owns/u);
  assert.match(documentation, /Fitz remains GitHub platform review/u);
  assert.match(documentation, /conditional\s+Simmons feedback remains external evidence/u);
});

test("passcode signer setup is one-time host setup and authorize appends Coulson approval", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const setupOutput = JSON.parse(setup.stdout);
  assert.match(setupOutput.signerPath, /\/\.shield\/signers\//);
  assert.match(setupOutput.signingKeyRef, /^ed25519:sha256:/);

  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.governance.state, "proposed");

  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 0, authorized.stderr);
  projection = JSON.parse(authorized.stdout);
  assert.equal(projection.governance.state, "approved");
  assert.equal(projection.authorization.state, "authorized");
  assert.equal(projection.evidence[0].sourceRef, `passcode-signer:${brief.missionId}`);
});

test("Coulson signer setup uses the fixed Coulson operation rule under the Coulson-only profile", async () => {
  const { root } = await fixture(false, "coulson_only_platform_review");
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });
  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "coulson-only-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const config = JSON.parse(await readFile(join(root, ".shield", "config.json"), "utf8"));
  assert.equal(config.repositoryTrustProfileId, "coulson_only_platform_review");
  assert.deepEqual(config.trustedHumanBindingRefs.map(({ seatId }) => seatId), ["coulson"]);
});

test("passcode authorization persists durable approval entry and rejects retries", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const setup = run(
    root,
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 0, authorized.stderr);

  const journalEntries = await readJournalEntries(root, brief.missionId);
  const governanceApprovals = journalEntries.filter(({ type, payload }) => type === "governance.decided" && payload.decision === "approve");
  assert.equal(governanceApprovals.length, 1);
  const governanceEvidence = governanceApprovals[0].payload.evidence.payload;
  assert.equal(governanceEvidence.evidenceKind, "mission_authorization");
  assert.equal(governanceEvidence.seatId, "coulson");
  assert.equal(governanceEvidence.revisionId, brief.revisionId);
  assert.equal(governanceApprovals[0].payload.evidence.payload.sourceRef, `passcode-signer:${brief.missionId}`);

  const journalBytes = await readFile(journalPath(root, brief.missionId), "utf8");
  const retry = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /governance_denied: Cannot approve from approved/u);
  const retryBytes = await readFile(journalPath(root, brief.missionId), "utf8");
  assert.equal(retryBytes, journalBytes);
  const retryEntries = await readJournalEntries(root, brief.missionId);
  const retryApprovals = retryEntries.filter(({ type, payload }) => type === "governance.decided" && payload.decision === "approve");
  assert.equal(retryApprovals.length, 1);
});

test("authorize explains when the local signer has not been provisioned", async () => {
  const { root, brief } = await fixture();
  const homeRoot = join(root, "home");
  await mkdir(homeRoot, { recursive: true });

  const begun = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);

  const authorized = run(
    root,
    ["mission", "authorize", "--mission-id", brief.missionId, "--passcode-stdin", "--json"],
    { env: { HOME: homeRoot }, input: "routine-passcode\n" },
  );
  assert.equal(authorized.status, 1);
  assert.match(
    authorized.stderr,
    /No local Coulson signer was found for this mission binding/,
  );
  assert.match(
    authorized.stderr,
    /shield mission signer setup --seat coulson/,
  );
});

test("supervised begin preserves malformed-brief precedence over a malformed binding registry", async () => {
  const { root } = await fixture();
  await writeFile(join(root, "mission-brief.json"), "{}\n");
  await writeFile(join(root, ".shield", "trusted-human-bindings.json"), "{}\n");
  const result = run(root, ["mission", "begin", "--brief", "mission-brief.json", "--json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Mission brief/u);
  assert.doesNotMatch(result.stderr, /Trusted binding registry/u);
});

test("Wheels Off grants, delegates begin deterministically, reports source, and invalidates fail closed", async () => {
  const { root, brief, coulson } = await fixture();
  const grant = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:cli", previousRevisionId: null, repositoryId: "RanSolo/fixture", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, issuedAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const envelope = { payload: grant, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(grant)), coulson.privateKey).toString("base64") };
  await writeEvidence(root, "delegation.json", envelope);
  const granted = run(root, ["delegation", "grant", "--evidence", "delegation.json", "--json"]);
  assert.equal(granted.status, 0, granted.stderr);
  const eligibility = createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:cli", missionId: brief.missionId, missionRevisionId: brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: "RanSolo/fixture", issueId: "issue:39", issueRevisionId: "sha256:issue39", issueSourceRef: "github:issue:39", scopeItems: ["Bounded Wheels Off implementation"], acceptanceChecks: ["Delegated begin is replayable"], dependencies: [], architecturalDecisions: [], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false });
  await writeFile(join(root, "eligibility.json"), `${JSON.stringify(eligibility, null, 2)}\n`);
  const begun = run(root, ["mission", "begin", "--authorization", "delegated", "--brief", "mission-brief.json", "--delegation", grant.revisionId, "--eligibility", "eligibility.json", "--json"]);
  assert.equal(begun.status, 0, begun.stderr);
  let projection = JSON.parse(begun.stdout).projection;
  assert.equal(projection.journalSchemaVersion, 3); assert.equal(projection.governance.state, "approved"); assert.equal(projection.authorization.source, "delegated"); assert.equal(projection.authorization.state, "authorized"); assert.equal(projection.evidence.length, 0);
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]); assert.equal(report.status, 0, report.stderr); assert.equal(JSON.parse(report.stdout).entries.length, 2);
  const invalidated = run(root, ["mission", "invalidate", "--mission-id", brief.missionId, "--reason", "scope_changed", "--json"]); assert.equal(invalidated.status, 0, invalidated.stderr);
  projection = JSON.parse(invalidated.stdout); assert.equal(projection.governance.state, "proposed"); assert.equal(projection.authorization.state, "invalidated");
  const blocked = run(root, ["mission", "step", "--mission-id", brief.missionId, "--json"]); assert.equal(blocked.status, 1);
});

test("revoked delegation begins ineligible and falls back to signed supervised approval", async () => {
  const { root, brief, coulson } = await fixture();
  const grant = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:revoked", previousRevisionId: null, repositoryId: "RanSolo/fixture", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, issuedAt: { value: "2020-01-01T00:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const grantEnvelope = { payload: grant, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(grant)), coulson.privateKey).toString("base64") }; await writeEvidence(root, "grant.json", grantEnvelope);
  assert.equal(run(root, ["delegation", "grant", "--evidence", "grant.json", "--json"]).status, 0);
  const revocation = { schemaVersion: 1, revocationId: "revocation:cli", delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, reason: "maintainer_requested", humanPrincipalId: coulson.binding.humanPrincipalId, bindingId: coulson.binding.bindingId, signingKeyRef: coulson.binding.signingKeyRef, revokedAt: { value: "2020-01-01T00:01:00Z", provenance: "humanRecorded" }, logSequence: 1 };
  const revokeEnvelope = { payload: revocation, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(revocation)), coulson.privateKey).toString("base64") }; await writeEvidence(root, "revoke.json", revokeEnvelope);
  const revoked = run(root, ["delegation", "revoke", "--evidence", "revoke.json", "--json"]); assert.equal(revoked.status, 0, revoked.stderr);
  const eligibility = createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:revoked", missionId: brief.missionId, missionRevisionId: brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, issueId: "issue:39", issueRevisionId: "sha256:issue39", issueSourceRef: "github:issue:39", scopeItems: ["Bounded work"], acceptanceChecks: ["Fail closed"], dependencies: [], architecturalDecisions: [], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false }); await writeFile(join(root, "eligibility.json"), `${JSON.stringify(eligibility)}\n`);
  const begun = run(root, ["mission", "begin", "--authorization", "delegated", "--brief", "mission-brief.json", "--delegation", grant.revisionId, "--eligibility", "eligibility.json", "--json"]);
  assert.equal(begun.status, 1, begun.stderr); let projection = JSON.parse(begun.stdout).projection; assert.equal(projection.authorization.state, "ineligible"); assert.ok(projection.authorization.reasons.includes("delegation_revoked"));
  const report = run(root, ["mission", "report", "--mission-id", brief.missionId, "--json"]); assert.equal(report.status, 0, report.stderr);
  const evaluatedAt = JSON.parse(report.stdout).entries[1].timestamp.value;
  const approvalAt = new Date(Date.parse(evaluatedAt) + 1_000).toISOString();
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization"); const approval = signedEvidence(coulson, projection, requirement, "approved", 2, approvalAt); await writeEvidence(root, "approval.json", approval);
  const approved = run(root, ["mission", "approve", "--mission-id", brief.missionId, "--evidence", "approval.json", "--json"]); assert.equal(approved.status, 0, approved.stderr); projection = JSON.parse(approved.stdout); assert.equal(projection.authorization.source, "supervised"); assert.equal(projection.governance.state, "approved");
});

test("Copilot Fury dispatch CLI materializes the exact reviewed transition and replays it", async () => {
  const current = await profileAwareFixture();
  await mkdir(join(current.root, ".github", "agents"), { recursive: true });
  await mkdir(join(current.root, "docs", "missions"), { recursive: true });
  await writeFile(join(current.root, ".github", "agents", "fury.agent.md"), COPILOT_FURY_CARD);
  const parentPlanPath = "docs/missions/issue-319-cli-plan.md";
  const parentPlanBytes = "# Parent plan for the CLI exact-read fixture.\n";
  await writeFile(join(current.root, parentPlanPath), parentPlanBytes);
  runGit(current.root, ["init", "-q", "-b", "main"]);
  runGit(current.root, ["config", "user.email", "shield@example.invalid"]);
  runGit(current.root, ["config", "user.name", "SHIELD Fixture"]);
  runGit(current.root, ["add", "package.json", "mission-brief.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore", ".github/agents/fury.agent.md", parentPlanPath]);
  runGit(current.root, ["commit", "-qm", "Copilot Fury dispatch base"]);
  const baseRevision = runGit(current.root, ["rev-parse", "HEAD"]);
  const built = buildMissionTransitionPlanV1({
    missionId: current.brief.missionId,
    subjectId: current.brief.subjectId,
    repositoryId: "RanSolo/fixture",
    planningBaseRevision: baseRevision,
    parentPlanCommit: baseRevision,
    parentPlanPath,
    parentPlanRawSha256: createHash("sha256").update(parentPlanBytes).digest("hex"),
    transitionKind: "fresh_authorize_wheels_up",
    boundedOutcome: "Exercise the exact Copilot Fury CLI handoff.",
    approvedRelativePaths: ["implementation.md"],
    publicationPaths: ["implementation.md"],
    approvedActionIds: ["action:issue-319:cli"],
    approvedEffectClasses: ["behavioral_implementation"],
    approvedEffectKeys: ["effect:issue-319:cli"],
    approvedCapabilities: ["capability:edit"],
    validationCommandIds: ["validation:issue-319:cli"],
    modelId: "model:may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "executor:may",
    exclusions: [
      "review.comment.publish", "review.pull_request.update_draft", "review.pull_request.mark_ready",
      "merge", "deployment", "release", "final_acceptance",
    ],
  });
  assert.equal(built.state, "built", JSON.stringify(built));
  const planPath = "docs/missions/issue-319-cli-transition.json";
  const planBytes = `${JSON.stringify(built.plan)}\n`;
  await writeFile(join(current.root, planPath), planBytes);
  runGit(current.root, ["add", planPath]);
  runGit(current.root, ["commit", "-qm", "Copilot Fury dispatch plan"]);
  const headRevision = runGit(current.root, ["rev-parse", "HEAD"]);
  const request = {
    schemaVersion: 2,
    contractVersion: COPILOT_FURY_PLAN_DISPATCH_REQUEST_CONTRACT_VERSION_V2,
    authority: "none",
    repositoryRoot: current.root,
    repositoryId: "RanSolo/fixture",
    repositoryWorkspaceId: "workspace:issue-319-cli",
    branch: "main",
    planningBaseRevision: baseRevision,
    headRevision,
    missionId: current.brief.missionId,
    missionRevision: current.brief.revisionId,
    subjectId: current.brief.subjectId,
    subjectRevision: built.plan.digest,
    parentSessionId: "session:hill:issue-319-cli",
    transitionPlanPath: planPath,
    transitionPlanRawSha256: createHash("sha256").update(planBytes).digest("hex"),
    cardSelection: { kind: "repository_default" },
    requestedModel: "model:fury",
    requestedRuntime: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
    requestedExecutor: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
    allowedTools: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_TOOLS],
    allowedEffects: [...COPILOT_FURY_PLAN_DISPATCH_ALLOWED_EFFECTS],
    repairLimit: 1,
    stopConditions: [...COPILOT_FURY_PLAN_DISPATCH_STOP_CONDITIONS],
    timestamp: { value: "2026-08-18T12:01:00.000Z", provenance: "hostTrusted" },
    reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
  };
  await writeFile(join(current.root, "fury-dispatch-request.json"), `${JSON.stringify(request, null, 2)}\n`);
  const calls = { preflight: 0, execute: 0 };
  const executor = {
    async preflight() {
      calls.preflight += 1;
      return { state: "ready", packageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION, runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID, executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID };
    },
    async execute(input) {
      calls.execute += 1;
      return {
        state: "completed",
        outputText: JSON.stringify({
          schemaVersion: 2,
          contractVersion: COPILOT_FURY_PLAN_RESULT_CONTRACT_VERSION_V2,
          authority: "none",
          reviewerSeatId: "fury",
          reviewedArtifactId: built.plan.id,
          reviewedArtifactRevision: built.plan.digest,
          verdict: "PASS",
          findings: [],
          reviewPhase: COPILOT_FURY_PLAN_REVIEW_PHASE_V2,
          repositoryRevision: input.configuration.repositoryRevision,
        }),
        observations: {
          sessionStartObserved: true,
          sessionId: input.configuration.sessionId,
          selectedAgent: "fury",
          model: input.configuration.model,
          assistantModel: input.configuration.model,
          runtimeId: COPILOT_FURY_PLAN_DISPATCH_RUNTIME_ID,
          executorId: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
          loadedSdkPackageVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
          sessionProducer: COPILOT_FURY_PLAN_DISPATCH_EXECUTOR_ID,
          sessionProducerVersion: "1.0.79",
          modelChangeObserved: false,
          agentSubstitutionObserved: false,
          unauthorizedToolOrEffectObserved: false,
          policyDecisions: [],
          executionObservation: {
            version: "shield.copilot-fury.execution-observation.v1",
            sdkVersion: COPILOT_FURY_PLAN_DISPATCH_SDK_VERSION,
            registeredToolNames: ["read", "search"],
            sessionAvailableTools: ["custom:read", "custom:search"],
            sessionExcludedTools: [...input.toolBinding.sessionExcludedTools],
            customAgentTools: ["read", "search"],
            modelFacingToolNames: ["read", "search"],
            runtimeMetadataNames: ["read", "search"],
            runtimeMetadataDigest: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            artifactMapDigest: input.reviewArtifactMap.digest,
          },
        },
      };
    },
  };
  const output = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output.push(String(chunk)); return true; };
  try {
    assert.equal(await runMissionCli([
      "mission", "dispatch-fury-plan-review", "--request", "fury-dispatch-request.json", "--root", current.root, "--json",
    ], { copilotFuryPlanDispatch: { executor, userCopilotHome: join(current.root, "copilot-home") } }), 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  const dispatched = JSON.parse(output.join(""));
  assert.equal(dispatched.state, "completed", JSON.stringify(dispatched));
  assert.equal(dispatched.disposition, "PASS");
  assert.equal(calls.preflight, 1);
  assert.equal(calls.execute, 1);
  const recordArgs = [
    "mission", "record-reviewed-transition",
    "--transition-plan", dispatched.handoff.transitionPlanPath,
    "--review-artifact", dispatched.handoff.reviewArtifactPath,
    "--dispatch-receipt-id", dispatched.handoff.dispatchReceiptId,
    "--mission-id", current.brief.missionId,
    "--root", current.root,
  ];
  const materialized = run(current.root, recordArgs);
  assert.equal(materialized.status, 0, materialized.stderr);
  assert.equal(JSON.parse(materialized.stdout).state, "materialized");
  const replayed = run(current.root, recordArgs);
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.equal(JSON.parse(replayed.stdout).state, "already_materialized");
});
