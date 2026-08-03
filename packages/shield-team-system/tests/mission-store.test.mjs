import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createMissionBegunEntry,
  createSupervisedMissionBrief,
  serializeSupervisedJournalEntry,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  replayProfileAwareMissionJournal,
  MISSION_130_JOURNAL_DIGEST,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  appendProfileAwareMissionEntryV1,
  appendSupervisedMissionEntry,
  readSupervisedMissionJournal,
  resolveSupervisedMissionPaths,
} from "../dist/mission-store.mjs";

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const TEST_FILE_DIR = dirname(TEST_FILE_PATH);
const PACKAGE_DIST_DIR = resolve(TEST_FILE_DIR, "..", "dist");
const MISSION_STORE_PATH = resolve(PACKAGE_DIST_DIR, "mission-store.mjs");
const PROFILE_AWARE_MISSION_V1_PATH = resolve(PACKAGE_DIST_DIR, "profile-aware-mission-v1.mjs");
const MISSION_V2_PATH = resolve(PACKAGE_DIST_DIR, "mission-v2.mjs");

function profileAwareAuthority() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: "binding:coulson",
      humanPrincipalId: "human:coulson",
      seatId: "coulson",
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: "repository-config:coulson",
    },
  };
}

const profileRiskFlags = {
  production: false,
  destructive: false,
  migration: false,
  credentialsOrSecurity: false,
  externalCommunication: false,
  merge: false,
  deploy: false,
  release: false,
  hillHighRisk: false,
};

function profileAwareFixture() {
  const authority = profileAwareAuthority();
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: "mission:profile-store-fixture",
    objective: "Exercise schema-9 mission journal append behavior.",
    subjectId: "issue:store-profile",
    riskFlags: profileRiskFlags,
    participants: [{ seatId: "hill" }, { seatId: "may" }, { seatId: "coulson" }],
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

  const begun = createProfileAwareMissionBegunEntry(brief, [authority.binding]);
  const requirement = `req:${brief.missionId}:${brief.revisionId}:mission_authorization`;
  const decisionPayload = {
    schemaVersion: 1,
    evidenceId: "evidence:governance:1",
    requirementId: requirement,
    missionId: brief.missionId,
    revisionId: brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: authority.binding.humanPrincipalId,
    bindingId: authority.binding.bindingId,
    signingKeyRef: authority.binding.signingKeyRef,
    sourceRef: "evidence:coulson:mission_authorization:1",
    timestamp: { value: "2026-07-29T15:01:00Z", provenance: "humanRecorded" },
    journalSequence: 1,
  };
  const signature = sign(null, Buffer.from(canonicalJson(decisionPayload)), authority.privateKey);

  const governance = {
    schemaVersion: 9,
    entryId: `entry:${brief.missionId}:1`,
    missionId: brief.missionId,
    sequence: 1,
    type: "governance.decided",
    timestamp: { value: "2026-07-29T15:01:00Z", provenance: "humanRecorded" },
    payload: {
      evidence: {
        payload: decisionPayload,
        signatureBase64: signature.toString("base64"),
      },
    },
  };

  return { authority, brief, begun, governance };
}

function profileAwareTransitionEntry(fixture, sequence = 2) {
  return {
    schemaVersion: 9,
    entryId: `entry:${fixture.begun.missionId}:${sequence}`,
    missionId: fixture.begun.missionId,
    sequence,
    type: "execution.transition",
    timestamp: { value: `2026-07-29T15:0${sequence}:00Z`, provenance: "humanRecorded" },
    payload: { from: "not-started", to: "running" },
  };
}

function profileAwareJournalBytes(entries) {
  return entries.map((entry) => `${canonicalJson(entry)}\n`).join("");
}

async function runProfileAwareMockedAppendScenario(scenario) {
  const scriptPath = join(await mkdtemp(join(tmpdir(), "shield-store-profile-")), "fault-profile-aware.mjs");
  const script = `
    import { constants } from "node:fs";
    import { generateKeyPairSync, sign } from "node:crypto";
    import * as realFs from "node:fs/promises";
    import { join } from "node:path";
    import { tmpdir } from "node:os";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";

    const scenario = ${JSON.stringify(scenario)};
    const missionStorePath = ${JSON.stringify(MISSION_STORE_PATH)};
    const profileAwarePath = ${JSON.stringify(PROFILE_AWARE_MISSION_V1_PATH)};
    const missionV2Path = ${JSON.stringify(MISSION_V2_PATH)};
    const missionStoreUrl = pathToFileURL(missionStorePath);
    const profileAwareUrl = pathToFileURL(profileAwarePath);
    const missionV2Url = pathToFileURL(missionV2Path);

    const missionV2Module = await import(missionV2Url.href);
    const profileAwareModule = await import(profileAwareUrl.href);
    const { canonicalJson, computeEd25519SigningKeyRef } = missionV2Module;
    const { createProfileAwareMissionBrief, createProfileAwareMissionBegunEntry } = profileAwareModule;

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const authorityBinding = {
      schemaVersion: 1,
      bindingId: "binding:coulson",
      humanPrincipalId: "human:coulson",
      seatId: "coulson",
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: "repository-config:coulson",
    };

    const brief = createProfileAwareMissionBrief({
      schemaVersion: 2,
      missionId: "mission:profile-store-fixture",
      objective: "Exercise schema-9 mission journal append behavior.",
      subjectId: "issue:store-profile",
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
      participants: [{ seatId: "hill" }, { seatId: "may" }, { seatId: "coulson" }],
      activatedModes: [],
      requireSimmons: false,
      createdAt: { value: "2026-07-29T15:00:00Z", provenance: "humanRecorded" },
      profileId: "standard",
      profileVersion: 1,
      requiredExecutionGateRoleIds: ["coulson"],
      requiredFinalAcceptanceGateRoleIds: ["coulson"],
      predecessorMissionId: "mission:issue-130",
      predecessorJournalDigest: profileAwareModule.MISSION_130_JOURNAL_DIGEST,
    });

    const begun = createProfileAwareMissionBegunEntry(brief, [authorityBinding]);
    const decisionRequirement = begun.payload.requirements.find((candidate) => candidate.evidenceKind === "mission_authorization");
    const evidencePayload = {
      schemaVersion: 1,
      evidenceId: "evidence:governance:1",
      requirementId: decisionRequirement.requirementId,
      missionId: brief.missionId,
      revisionId: brief.revisionId,
      seatId: authorityBinding.seatId,
      evidenceKind: decisionRequirement.evidenceKind,
      decision: "approved",
      humanPrincipalId: authorityBinding.humanPrincipalId,
      bindingId: authorityBinding.bindingId,
      signingKeyRef: authorityBinding.signingKeyRef,
      sourceRef: "evidence:coulson:mission_authorization:1",
      timestamp: { value: "2026-07-29T15:01:00Z", provenance: "humanRecorded" },
      journalSequence: 1,
    };

    const governance = {
      schemaVersion: 9,
      entryId: "entry:" + brief.missionId + ":1",
      missionId: brief.missionId,
      sequence: 1,
      type: "governance.decided",
      timestamp: { value: "2026-07-29T15:01:00Z", provenance: "humanRecorded" },
      payload: {
        evidence: {
          payload: evidencePayload,
          signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), privateKey).toString("base64"),
        },
      },
    };

    const candidate = {
      schemaVersion: 9,
      entryId: "entry:" + brief.missionId + ":2",
      missionId: brief.missionId,
      sequence: 2,
      type: "execution.transition",
      timestamp: { value: "2026-07-29T15:02:00Z", provenance: "humanRecorded" },
      payload: { from: "not-started", to: "running" },
    };

    const repositoryRoot = await realFs.mkdtemp(join(tmpdir(), "shield-store-profile-mock-"));
    const baselineLine = canonicalJson(begun) + "\\n" + canonicalJson(governance) + "\\n";
    const candidateLine = canonicalJson(candidate) + "\\n";

    let journalPath = null;
    let lockPath = null;
    let readCount = 0;
    let faultTriggered = false;

    mock.module("node:fs/promises", {
      exports: {
        ...realFs,
        open: async (path, flags, mode) => {
          const handle = await realFs.open(path, flags, mode);
          const isNumericFlags = typeof flags === "number";
          const isWrite = isNumericFlags && (
            (flags & constants.O_WRONLY) === constants.O_WRONLY ||
            (flags & constants.O_RDWR) === constants.O_RDWR
          );
          const isRead = isNumericFlags && !isWrite;
          const isJournal = typeof path === "string" && path === journalPath;
          const isLock = typeof path === "string" && path === lockPath;

          if (scenario === "append-short-write" && isWrite && typeof path === "string" && path.endsWith(".jsonl")) {
            const originalWrite = handle.write.bind(handle);
            handle.write = async (...args) => {
              const result = await originalWrite(...args);
              faultTriggered = true;
              return { ...result, bytesWritten: Math.max(0, result.bytesWritten - 1) };
            };
          }

          if (scenario === "append-sync-failure" && isWrite && isJournal) {
            const originalSync = handle.sync.bind(handle);
            handle.sync = async () => {
              await originalSync();
              faultTriggered = true;
              throw new Error("simulated append sync failure");
            };
          }

          if (scenario === "append-readback-mismatch" && isRead && isJournal) {
            const originalReadFile = handle.readFile.bind(handle);
            handle.readFile = async (...args) => {
              const value = await originalReadFile(...args);
              readCount += 1;
              if (readCount > 1 && typeof value === "string") {
                faultTriggered = true;
                return value + canonicalJson(candidate) + "\\n";
              }
              return value;
            };
          }

          if (scenario === "lock-release-failure" && isLock) {
            const originalSync = handle.sync?.bind(handle);
            if (typeof originalSync === "function") {
              handle.sync = async () => originalSync();
            }
          }

          return handle;
        },
        unlink: async (pathToUnlink) => {
          if (scenario === "lock-release-failure" && pathToUnlink === lockPath) {
            faultTriggered = true;
            const error = new Error("simulated lock unlink failure");
            error.code = "EIO";
            throw error;
          }
          return realFs.unlink(pathToUnlink);
        },
      },
    });

    const missionStore = await import(missionStoreUrl.href);
    const paths = missionStore.resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId);
    if (paths.state !== "valid") {
      throw new Error("paths invalid");
    }
    journalPath = paths.value.journalPath;
    lockPath = paths.value.journalPath + ".lock";

    await realFs.mkdir(paths.value.root, { recursive: true });
    await realFs.writeFile(journalPath, baselineLine, "utf8");

    const result = await missionStore.appendProfileAwareMissionEntryV1({
      repositoryRoot,
      configuredJournalPath: ".shield/journals",
      missionId: brief.missionId,
      entry: candidate,
    });

    const bytes = await realFs.readFile(journalPath, "utf8");
    console.log(JSON.stringify({
      result,
      bytes,
      baseline: baselineLine,
      expectedLine: candidateLine,
      faultTriggered,
    }));
  `;
  await writeFile(scriptPath, script, "utf8");
  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", scriptPath], {
    encoding: "utf8",
    env: process.env,
    cwd: process.cwd(),
  });
  if (child.status !== 0) {
    assert.fail(`mock scenario ${scenario} exited with ${child.status}: ${child.stdout}${child.stderr}`);
  }
  const output = child.stdout.trim();
  if (output.length === 0) {
    assert.fail(`mock scenario ${scenario} produced no output: ${child.stderr}`);
  }
  try {
    return JSON.parse(output);
  } catch {
    assert.fail(`mock scenario ${scenario} produced invalid JSON: ${output}${child.stderr}`);
  }
}

function fixtureEntry() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: "mission:store-fixture",
    objective: "Exercise the durable supervised mission journal.",
    subjectId: "mission-plan:store-fixture",
    riskFlags: {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: [{ seatId: "coulson" }, { seatId: "fitz" }],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-18T20:00:00Z", provenance: "humanRecorded" },
  });
  const binding = {
    schemaVersion: 1,
    bindingId: "binding:coulson",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef,
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  return { brief, entry: createMissionBegunEntry(brief, [binding]) };
}

test("appendProfileAwareMissionEntryV1 appends one canonical line and rereads exact durable projection", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-success-"));
  const fixture = profileAwareFixture();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", fixture.brief.missionId).value;
  await mkdir(paths.root, { recursive: true });

  const nextEntry = profileAwareTransitionEntry(fixture);
  const baselineBytes = profileAwareJournalBytes([fixture.begun, fixture.governance]);
  await writeFile(paths.journalPath, baselineBytes);

  const appendInput = {
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.brief.missionId,
    entry: nextEntry,
  };
  const result = await appendProfileAwareMissionEntryV1(appendInput);
  assert.equal(result.state, "valid", result.errors?.join(" "));

  const expectedBytes = baselineBytes + profileAwareJournalBytes([nextEntry]);
  const afterBytes = await readFile(paths.journalPath, "utf8");
  assert.equal(afterBytes, expectedBytes);
  assert.equal(afterBytes.endsWith("\n"), true);

  const replay = replayProfileAwareMissionJournal([fixture.begun, fixture.governance, nextEntry]);
  assert.equal(replay.state, "valid", replay.errors?.join(" "));
  assert.deepEqual(result.value.projection, replay.value);
});

test("appendProfileAwareMissionEntryV1 rejects stale or out-of-order sequence", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-stale-"));
  const fixture = profileAwareFixture();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", fixture.brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.journalPath, profileAwareJournalBytes([fixture.begun, fixture.governance]));

  const stale = profileAwareTransitionEntry(fixture, 99);
  const before = await readFile(paths.journalPath, "utf8");
  const result = await appendProfileAwareMissionEntryV1({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.brief.missionId,
    entry: stale,
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "sequence_invalid");
  assert.equal(await readFile(paths.journalPath, "utf8"), before);
});

test("appendProfileAwareMissionEntryV1 rejects legacy-only and mixed journals", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-legacy-"));
  const profile = profileAwareFixture();
  const legacyBrief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: profile.brief.missionId,
    objective: "Legacy schema entry for mixed-journal rejection test.",
    subjectId: "legacy:issue:store-profile",
    riskFlags: {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    },
    participants: [{ seatId: "coulson" }, { seatId: "fitz" }],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-18T20:00:00Z", provenance: "humanRecorded" },
  });
  const legacyAuthority = profileAwareAuthority();
  const legacyBinding = {
    schemaVersion: 1,
    bindingId: "binding:legacy-coulson",
    humanPrincipalId: legacyAuthority.binding.humanPrincipalId,
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: legacyAuthority.binding.signingKeyRef,
    publicKeySpkiBase64: legacyAuthority.binding.publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const legacyEntry = createMissionBegunEntry(legacyBrief, [legacyBinding]);

  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", profile.brief.missionId).value;
  await mkdir(paths.root, { recursive: true });

  await writeFile(paths.journalPath, serializeSupervisedJournalEntry(legacyEntry));
  const legacyOnlyResult = await appendProfileAwareMissionEntryV1({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: profile.brief.missionId,
    entry: profileAwareTransitionEntry(profile),
  });
  assert.equal(legacyOnlyResult.state, "invalid");
  assert.equal(legacyOnlyResult.code, "unsupported_schema");

  await writeFile(paths.journalPath, `${profileAwareJournalBytes([profile.begun])}${serializeSupervisedJournalEntry(legacyEntry)}`);

  const mixedResult = await appendProfileAwareMissionEntryV1({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: profile.brief.missionId,
    entry: profileAwareTransitionEntry(profile),
  });
  assert.equal(mixedResult.state, "invalid");
  assert.equal(mixedResult.code, "schema_mixed");
});

test("appendProfileAwareMissionEntryV1 is linearized under concurrent appends", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-concurrency-"));
  const fixture = profileAwareFixture();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", fixture.brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.journalPath, profileAwareJournalBytes([fixture.begun, fixture.governance]));

  const payload = {
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.brief.missionId,
    entry: profileAwareTransitionEntry(fixture),
  };
  const results = await Promise.all([
    appendProfileAwareMissionEntryV1(payload),
    appendProfileAwareMissionEntryV1({ ...payload, entry: { ...payload.entry } }),
  ]);

  const valid = results.filter((result) => result.state === "valid");
  const invalid = results.filter((result) => result.state === "invalid");
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0].code === "journal_lock_held" || invalid[0].code === "sequence_invalid");
  assert.equal(valid[0].state, "valid");
  assert.deepEqual(valid[0].value.projection.lastSequence, 2);
  const journalBytes = await readFile(paths.journalPath, "utf8");
  assert.equal(journalBytes.split("\n").filter(Boolean).length, 3);
});

test("appendProfileAwareMissionEntryV1 rejects profile-aware journal root symlink escapes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-root-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-profile-outside-"));
  const fixture = profileAwareFixture();
  const candidate = profileAwareTransitionEntry(fixture);

  await mkdir(join(repositoryRoot, ".shield"), { recursive: true });
  await symlink(outside, join(repositoryRoot, ".shield", "journals"));

  const result = await appendProfileAwareMissionEntryV1({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.brief.missionId,
    entry: candidate,
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("appendProfileAwareMissionEntryV1 rejects per-mission profile journal symlink", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-profile-file-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-profile-file-outside-"));
  const fixture = profileAwareFixture();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", fixture.brief.missionId).value;
  await mkdir(paths.root, { recursive: true });

  const outsideJournal = join(outside, "captured.jsonl");
  const outsideBytes = profileAwareJournalBytes([fixture.begun, fixture.governance]);
  await writeFile(outsideJournal, outsideBytes);
  await symlink(outsideJournal, paths.journalPath);

  const candidate = profileAwareTransitionEntry(fixture);
  const result = await appendProfileAwareMissionEntryV1({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.brief.missionId,
    entry: candidate,
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("appendProfileAwareMissionEntryV1 treats short writes, append sync errors, and reread mismatch as recovery_required", async () => {
  const scenarios = ["append-short-write", "append-sync-failure", "append-readback-mismatch"];
  for (const scenario of scenarios) {
    const { result, baseline, expectedLine, bytes, faultTriggered } = await runProfileAwareMockedAppendScenario(scenario);
    assert.equal(faultTriggered, true, `${scenario} fault was not injected`);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "recovery_required");
    // The injected handle performs the real full write but reports one fewer
    // byte, modeling an uncertain write result rather than truncating bytes.
    assert.equal(bytes, baseline + expectedLine);
  }
});

test("appendProfileAwareMissionEntryV1 maps lock unlink failure to recovery_required", async () => {
  const { result, baseline, expectedLine, bytes, faultTriggered } = await runProfileAwareMockedAppendScenario("lock-release-failure");
  assert.equal(faultTriggered, true, "lock-release-failure fault was not injected");
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
  assert.equal(bytes, baseline + expectedLine);
});

test("append, sync, and restart replay preserve the exact durable projection", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-"));
  const { brief, entry } = fixtureEntry();
  const input = { repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId };
  const appended = await appendSupervisedMissionEntry({ ...input, entry });
  assert.equal(appended.state, "valid", appended.errors?.join(" "));

  const firstRead = await readSupervisedMissionJournal(input);
  const restartRead = await readSupervisedMissionJournal(input);
  assert.equal(firstRead.state, "valid", firstRead.errors?.join(" "));
  assert.deepEqual(restartRead, firstRead);
  assert.equal(await readFile(appended.value.journalPath, "utf8"), serializeSupervisedJournalEntry(entry));
});

test("an existing lock fails closed without changing journal bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-lock-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.journalPath, serializeSupervisedJournalEntry(entry));
  const lock = await open(paths.lockPath, "wx");
  const before = await readFile(paths.journalPath, "utf8");
  try {
    const result = await appendSupervisedMissionEntry({ repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId, entry });
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "journal_lock_held");
    assert.equal(await readFile(paths.journalPath, "utf8"), before);
  } finally {
    await lock.close();
  }
});

test("an incomplete tail requires recovery and is never repaired implicitly", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-tail-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  const partial = `${serializeSupervisedJournalEntry(entry)}{\"schemaVersion\":2`;
  await writeFile(paths.journalPath, partial);
  const result = await readSupervisedMissionJournal({ repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "recovery_required");
  assert.equal(await readFile(paths.journalPath, "utf8"), partial);
});

test("a symlinked journal root cannot escape the repository", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-outside-"));
  const { brief, entry } = fixtureEntry();
  await mkdir(join(repositoryRoot, ".shield"), { recursive: true });
  await symlink(outside, join(repositoryRoot, ".shield", "journals"));
  const result = await appendSupervisedMissionEntry({
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: brief.missionId,
    entry,
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "unsafe_path");
});

test("a per-mission journal symlink cannot escape on read or append", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-store-file-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "shield-store-file-outside-"));
  const { brief, entry } = fixtureEntry();
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", brief.missionId).value;
  await mkdir(paths.root, { recursive: true });
  const outsideJournal = join(outside, "captured.jsonl");
  const outsideBytes = serializeSupervisedJournalEntry(entry);
  await writeFile(outsideJournal, outsideBytes);
  await symlink(outsideJournal, paths.journalPath);

  const input = { repositoryRoot, configuredJournalPath: ".shield/journals", missionId: brief.missionId };
  const readResult = await readSupervisedMissionJournal(input);
  assert.equal(readResult.state, "invalid");
  assert.equal(readResult.code, "unsafe_path");

  const appendResult = await appendSupervisedMissionEntry({ ...input, entry });
  assert.equal(appendResult.state, "invalid");
  assert.equal(appendResult.code, "unsafe_path");
  assert.equal(await readFile(outsideJournal, "utf8"), outsideBytes);
});
