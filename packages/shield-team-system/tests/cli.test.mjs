import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, mkdir, open, readFile, readdir, realpath, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const cli = join(packageRoot, "dist", "cli.mjs");
const { migrateConfigFile } = await import("../dist/cli.mjs");
const { createShieldConfig, formatShieldConfig } = await import("../dist/config.mjs");
const { missionUsage, runMissionCli, validateAuthorizeDaisyCoordinationInput } = await import("../dist/mission-cli.mjs");
const { computeEd25519SigningKeyRef } = await import("../dist/mission-v2.mjs");
const { canonicalJson } = await import("../dist/mission-v2.mjs");
const { createProfileAwareGovernanceDecisionEntryV1, createProfileAwareMissionBrief, MISSION_130_JOURNAL_DIGEST, replayProfileAwareMissionJournal } = await import("../dist/profile-aware-mission-v1.mjs");
const { computeIssueAcceptanceCriteriaDigestV1 } = await import("../dist/mission-intake-v1.mjs");
const { prepareWorktreeStateV1 } = await import("../dist/worktree-state-v1.mjs");
const initArgs = [
  "init",
  "--repository-id", "RanSolo/fixture",
  "--coulson-binding-ref", "github:user:coulson",
  "--fitz-binding-ref", "github:user:fitz",
];

function run(args, cwd, env = {}, input) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env }, input });
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

test("authorize-daisy-coordination input is closed, immutable, and fixes caller-selectable fields", () => {
  const intent = validateAuthorizeDaisyCoordinationInput({
    effectKey: "effect:test:daisy-read",
    approvedReadRoots: ["/workspace/repository"],
    durableArtifactRoot: "/workspace/daisy-artifacts",
    runtimeId: "runtime:test:daisy",
    modelId: "model:test:daisy",
    executorId: "executor:test:daisy",
  });
  assert.equal(Object.isFrozen(intent), true);
  assert.equal(Object.isFrozen(intent.approvedReadRoots), true);
  assert.equal(Object.hasOwn(intent, "validationId"), false);
  assert.match(missionUsage(), /authorize-daisy-coordination/);
  assert.throws(() => validateAuthorizeDaisyCoordinationInput({ ...intent, validationId: "validation:caller" }), /only enumerable data fields/);
  assert.throws(() => validateAuthorizeDaisyCoordinationInput(new Proxy(intent, {})), /plain closed data object/);
  const accessor = { ...intent };
  Object.defineProperty(accessor, "effectKey", { enumerable: true, get: () => intent.effectKey });
  assert.throws(() => validateAuthorizeDaisyCoordinationInput(accessor), /only enumerable data fields/);
  const originalLocaleCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error("Daisy input ordering must not consult the host locale"); };
  try {
    assert.deepEqual(validateAuthorizeDaisyCoordinationInput({
      ...intent,
      approvedReadRoots: ["/workspace/Z-read", "/workspace/a-read"],
    }).approvedReadRoots, ["/workspace/Z-read", "/workspace/a-read"]);
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});

function cliAuthority(seatId) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    schemaVersion: 1,
    bindingId: `binding:test:${seatId}`,
    humanPrincipalId: `human:test:${seatId}`,
    seatId,
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:test",
    provenanceRef: `repository-config:test:${seatId}`,
  };
}

function cliSigningAuthority(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:test:${seatId}`,
      humanPrincipalId: `human:test:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:test",
      provenanceRef: `repository-config:test:${seatId}`,
    },
  };
}

function profileJournalPath(root, missionId) {
  return join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
}

async function issueCliFixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-issue-cli-")));
  const source = join(parent, "source");
  const root = join(parent, "destination");
  await mkdir(source);
  await mkdir(join(source, ".shield"));
  await writeFile(join(source, ".gitignore"), ".shield/\n/ignored-source-canary.txt\n");
  await writeFile(join(source, "package.json"), "{\"private\":true}\n");
  await writeFile(join(source, "ignored-source-canary.txt"), "ignored source bytes\n");
  execFileSync("git", ["init", "--quiet"], { cwd: source });
  execFileSync("git", ["config", "user.email", "shield@example.invalid"], { cwd: source });
  execFileSync("git", ["config", "user.name", "SHIELD Issue Fixture"], { cwd: source });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"], { cwd: source });
  execFileSync("git", ["add", ".gitignore", "package.json"], { cwd: source });
  execFileSync("git", ["commit", "--quiet", "-m", "issue fixture"], { cwd: source });
  await writeFile(join(source, ".git", "info", "exclude"), "ignored-invoking-worktree-canary\n");
  await writeFile(join(source, "untracked-source-canary.txt"), "untracked source bytes\n");
  execFileSync("git", ["worktree", "add", "--quiet", "-b", `issue-cli-${process.pid}-${Date.now()}`, root, "HEAD"], { cwd: source });

  const coulson = cliSigningAuthority("coulson");
  const fitz = cliSigningAuthority("fitz");
  const config = createShieldConfig({ repositoryId: "RanSolo/fixture", coulsonBindingRef: coulson.binding.signingKeyRef, fitzBindingRef: fitz.binding.signingKeyRef });
  await writeFile(join(source, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(source, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({ schemaVersion: 1, bindings: [coulson.binding, fitz.binding] }, null, 2)}\n`);
  await writeFile(join(source, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");
  const prepared = await prepareWorktreeStateV1({ sourceRoot: await realpath(source), destinationRoot: await realpath(root) });
  assert.equal(prepared.state, "ready");
  await mkdir(join(root, ".shield", "tmp"), { recursive: true });

  const response = {
    data: {
      repository: {
        id: "R_repo_1",
        nameWithOwner: "RanSolo/fixture",
        issue: {
          id: "I_issue_7",
          number: 7,
          url: "https://github.com/RanSolo/fixture/issues/7",
          title: "Intake issue",
          body: "## Acceptance criteria\n- [ ] preserve the issue identity\n- [ ] remain authority-neutral\n",
          state: "OPEN",
          updatedAt: "2026-08-22T12:00:00Z",
          labels: { nodes: [{ name: "intake" }] },
        },
      },
    },
  };
  await writeFile(join(root, ".shield", "tmp", "issue-response.json"), JSON.stringify(response));
  await writeFile(join(root, ".shield", "tmp", "gh-count"), "0\n");
  await writeFile(join(root, "ignored-invoking-worktree-canary"), "preserve invoking worktree bytes\n");
  const fakeBin = join(parent, "fake-bin");
  await mkdir(fakeBin);
  const fakeGh = join(fakeBin, "gh");
  await writeFile(fakeGh, "#!/bin/sh\ncount=$(cat \"$PWD/.shield/tmp/gh-count\")\nprintf '%s\\n' $((count + 1)) > \"$PWD/.shield/tmp/gh-count\"\ncat \"$PWD/.shield/tmp/issue-response.json\"\n");
  await chmod(fakeGh, 0o755);
  return { sourceRoot: await realpath(source), root: await realpath(root), fakePath: `${fakeBin}:${process.env.PATH}`, missionId: "", coulson, preparedWorktreeReceiptDigest: prepared.receipt.receiptDigest };
}

async function completeWorktreeSnapshot(root) {
  const names = [...new Set([
    ...execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
      .toString("utf8").split("\0").filter(Boolean),
    ...execFileSync("git", ["ls-files", "--cached", "--others", "--ignored", "--exclude-standard", "-z"], { cwd: root })
      .toString("utf8").split("\0").filter(Boolean),
  ])].sort();
  return Promise.all(names.map(async (name) => ({ name, bytes: (await readFile(join(root, name))).toString("base64") })));
}

function snapshotMap(snapshot) {
  return new Map(snapshot.map(({ name, bytes }) => [name, bytes]));
}

function changedSnapshotNames(before, after) {
  const beforeMap = snapshotMap(before);
  const afterMap = snapshotMap(after);
  return [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .filter((name) => beforeMap.get(name) !== afterMap.get(name))
    .sort();
}

function outsideMissionRoot(snapshot) {
  return snapshot.filter(({ name }) => name !== ".shield" && !name.startsWith(".shield/"));
}

async function daisyCliFixture(includeDaisy = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-daisy-cli-")));
  const artifactRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-daisy-artifacts-")));
  const coulson = cliAuthority("coulson");
  const fitz = cliAuthority("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  await mkdir(join(root, ".shield", "tmp"), { recursive: true });
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  await writeFile(join(root, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");
  await writeFile(join(root, ".shield", "trusted-human-bindings.json"), `${JSON.stringify({ schemaVersion: 1, bindings: [coulson, fitz] }, null, 2)}\n`);
  const homeRoot = join(root, ".shield", "tmp", "home");
  await mkdir(homeRoot, { recursive: true });
  const passcode = "daisy-cli-passcode";
  const setup = run(
    ["mission", "signer", "setup", "--seat", "coulson", "--passcode-stdin", "--json"],
    root,
    { HOME: homeRoot },
    `${passcode}\n`,
  );
  assert.equal(setup.status, 0, setup.stderr);

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "shield@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "SHIELD Fixture"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"], { cwd: root });
  execFileSync("git", ["add", "package.json", ".shield/config.json", ".shield/trusted-human-bindings.json", ".shield/.gitignore"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "Daisy CLI fixture"], { cwd: root });

  const missionId = "mission:test:daisy-cli";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Authorize one bounded Daisy coordination lane.",
    subjectId: "issue:test:daisy-cli",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: true,
      externalCommunication: false, hillHighRisk: true, merge: false, deploy: false, release: false,
    },
    participants: ["hill", ...(includeDaisy ? ["daisy"] : []), "coulson"].map((seatId) => ({ seatId })),
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
  const briefPath = join(root, ".shield", "tmp", "daisy-brief.json");
  const inputPath = join(root, ".shield", "tmp", "daisy-input.json");
  const intent = {
    effectKey: "effect:test:daisy-read",
    approvedReadRoots: [root],
    durableArtifactRoot: artifactRoot,
    runtimeId: "runtime:test:daisy-cli",
    modelId: "model:test:daisy-cli",
    executorId: "executor:test:daisy-cli",
  };
  await writeFile(briefPath, `${JSON.stringify(briefContent, null, 2)}\n`);
  await writeFile(inputPath, `${JSON.stringify(intent, null, 2)}\n`);
  const begun = run(["mission", "begin", "--profile-aware", "--brief", briefPath, "--json"], root);
  assert.equal(begun.status, 0, begun.stderr);
  const authorized = run(
    ["mission", "authorize", "--mission-id", missionId, "--passcode-stdin", "--json"],
    root,
    { HOME: homeRoot },
    `${passcode}\n`,
  );
  assert.equal(authorized.status, 0, authorized.stderr);
  return { root, homeRoot, passcode, missionId, inputPath, intent, journalPath: profileJournalPath(root, missionId) };
}

function runDaisyAuthorization(current, stdin) {
  return run(
    ["mission", "authorize-daisy-coordination", "--mission-id", current.missionId, "--input", current.inputPath, "--passcode-stdin", "--json"],
    current.root,
    { HOME: current.homeRoot },
    stdin,
  );
}

async function runDaisyAuthorizationWithDrift(current, mutate) {
  const child = spawn(process.execPath, [cli,
    "mission", "authorize-daisy-coordination", "--mission-id", current.missionId,
    "--input", current.inputPath, "--passcode-stdin", "--json",
  ], { cwd: current.root, env: { ...process.env, HOME: current.homeRoot }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let drifted = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", async (chunk) => {
    stderr += chunk;
    if (!drifted && stderr.includes("SHIELD_DAISY_COORDINATION_MANIFEST_END")) {
      drifted = true;
      await mutate();
      child.stdin.end(`${current.passcode}\n`);
    }
  });
  const status = await new Promise((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  return { status, stdout, stderr, drifted };
}

test("authorize-daisy-coordination is one-passcode, drift-closed, and atomically appends N+1/N+2", async () => {
  const current = await daisyCliFixture();
  const baseline = await readFile(current.journalPath, "utf8");

  const empty = runDaisyAuthorization(current, "\n");
  assert.notEqual(empty.status, 0, empty.stderr);
  assert.equal(empty.stderr.match(/SHIELD_DAISY_COORDINATION_MANIFEST_BEGIN/gu)?.length, 1);
  assert.equal(empty.stderr.includes(current.passcode), false);
  assert.equal(await readFile(current.journalPath, "utf8"), baseline);

  const drifted = await runDaisyAuthorizationWithDrift(current, () => writeFile(
    current.inputPath,
    `${JSON.stringify({ ...current.intent, effectKey: "effect:test:drifted" }, null, 2)}\n`,
  ));
  assert.equal(drifted.drifted, true);
  assert.equal(drifted.status, 1, drifted.stderr);
  assert.match(drifted.stderr, /changed after display/u);
  assert.equal(await readFile(current.journalPath, "utf8"), baseline);
  await writeFile(current.inputPath, `${JSON.stringify(current.intent, null, 2)}\n`);

  const completed = runDaisyAuthorization(current, `${current.passcode}\n`);
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(completed.stderr.match(/SHIELD_DAISY_COORDINATION_MANIFEST_BEGIN/gu)?.length, 1);
  assert.equal(completed.stderr.includes(current.passcode), false);
  const receipt = JSON.parse(completed.stdout);
  assert.equal(receipt.schemaId, "shield.daisy-coordination-authorization-receipt.v1");
  assert.equal(receipt.startingJournalSequence, 1);
  assert.equal(receipt.endingJournalSequence, 3);
  const entries = (await readFile(current.journalPath, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(entries.slice(-2).map(({ sequence, type }) => ({ sequence, type })), [
    { sequence: 2, type: "coordination.authorized" },
    { sequence: 3, type: "coordination.runtime_bound" },
  ]);
  assert.equal(Object.hasOwn(entries[2].payload.authority.payload, "authorityDigest"), false);
  assert.equal(Object.hasOwn(entries[2].payload.authority.payload, "expiresAt"), false);
  assert.equal(entries[3].payload.binding.authoritySequence, 2);
  assert.equal(entries[3].payload.authorization.payload.previousJournalSequence, 2);
  assert.equal(entries[3].payload.authorization.payload.journalSequence, 3);
});

test("authorize-daisy-coordination rejects a nonparticipant Daisy before manifest, passcode, signature, or append", async () => {
  const current = await daisyCliFixture(false);
  const baseline = await readFile(current.journalPath, "utf8");
  const signerDirectory = join(current.homeRoot, ".shield", "signers");
  const [signerName] = await readdir(signerDirectory);
  const signerPath = join(signerDirectory, signerName);
  const signerBefore = await readFile(signerPath, "utf8");

  const result = runDaisyAuthorization(current, `${current.passcode}\n`);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /requires Daisy to be a mission participant/u);
  assert.doesNotMatch(result.stderr, /SHIELD_DAISY_COORDINATION_MANIFEST_BEGIN|Passcode:/u);
  assert.equal(result.stdout, "");
  assert.equal(await readFile(signerPath, "utf8"), signerBefore);
  assert.equal(await readFile(current.journalPath, "utf8"), baseline);
  assert.doesNotMatch(baseline, /coordination\.(?:authorized|runtime_bound)/u);
});

test("authorize-daisy-coordination aborts post-display journal, repository, and signer drift without appending", async () => {
  for (const scenario of ["journal", "repository", "signer"]) {
    const current = await daisyCliFixture();
    const baseline = await readFile(current.journalPath, "utf8");
    const result = await runDaisyAuthorizationWithDrift(current, async () => {
      if (scenario === "journal") {
        await writeFile(current.journalPath, baseline.replace("{", "{ "));
      } else if (scenario === "repository") {
        await writeFile(join(current.root, "post-display-drift.txt"), "drift\n");
        execFileSync("git", ["add", "post-display-drift.txt"], { cwd: current.root });
        execFileSync("git", ["commit", "--quiet", "-m", "Post-display drift"], { cwd: current.root });
      } else {
        const signerDirectory = join(current.homeRoot, ".shield", "signers");
        const [signerName] = await readdir(signerDirectory);
        const signerPath = join(signerDirectory, signerName);
        const signer = JSON.parse(await readFile(signerPath, "utf8"));
        await writeFile(signerPath, `${JSON.stringify({ ...signer, signingKeyRef: "ed25519:sha256:drifted" })}\n`);
      }
    });
    assert.equal(result.drifted, true, scenario);
    assert.equal(result.status, 1, `${scenario}: ${result.stderr}`);
    const finalBytes = await readFile(current.journalPath, "utf8");
    if (scenario === "journal") {
      assert.equal(finalBytes, baseline.replace("{", "{ "));
    } else {
      assert.equal(finalBytes, baseline, scenario);
    }
    assert.doesNotMatch(finalBytes, /coordination\.(?:authorized|runtime_bound)/u, scenario);
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shield-init-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  await writeFile(join(root, "existing.txt"), "preserve me\n");
  return root;
}

async function starterFixture() {
  const root = await fixture();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        private: true,
        scripts: {
          lint: "eslint .",
          typecheck: "tsc --noEmit",
          test: "node --test",
          build: "vite build",
        },
      },
      null,
      2,
    ) + "\n",
  );
  return root;
}

function migrationHandle(handle, overrides = {}) {
  return {
    chmod: (...args) => handle.chmod(...args),
    close: (...args) => handle.close(...args),
    read: (...args) => handle.read(...args),
    stat: (...args) => handle.stat(...args),
    sync: (...args) => handle.sync(...args),
    write: (...args) => handle.write(...args),
    ...overrides,
  };
}

async function migrationFixture() {
  const root = await fixture();
  await mkdir(join(root, ".shield"));
  await writeFile(join(root, ".shield", ".gitignore"), "/journals/\n/reports/\n/tmp/\n");
  const candidate = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: "github:user:coulson",
    fitzBindingRef: "github:user:fitz",
  });
  const { adapterIds: _adapterIds, ...common } = candidate;
  const legacy = { ...common, schemaVersion: 2, adapterId: "github" };
  const path = join(root, ".shield", "config.json");
  const legacyBytes = formatShieldConfig(legacy);
  await writeFile(path, legacyBytes, { mode: 0o640 });
  await chmod(path, 0o640);
  return { root, path, candidate, legacy, legacyBytes };
}

function driftIdentity(stats) {
  return new Proxy(stats, {
    get: (target, key) => key === "ino" ? target.ino + 1 : Reflect.get(target, key, target),
  });
}

async function migrationStateSnapshot(state) {
  const shieldPath = join(state.root, ".shield");
  const names = (await readdir(shieldPath)).sort();
  return Promise.all(names.map(async (name) => {
    const path = join(shieldPath, name);
    return {
      name,
      bytes: await readFile(path),
      mode: (await stat(path)).mode & 0o7777,
    };
  }));
}

async function assertLegacyCleanupAndRetry(state, label) {
  assert.equal(await readFile(state.path, "utf8"), state.legacyBytes, label);
  assert.equal((await stat(state.path)).mode & 0o7777, 0o640, label);
  assert.deepEqual(
    (await readdir(join(state.root, ".shield"))).filter((name) => name.includes("migrate")),
    [],
    label,
  );
  await migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
    nonce: () => "fedcba9876543210",
  });
  assert.equal(await readFile(state.path, "utf8"), formatShieldConfig(state.candidate), label);
  assert.equal((await stat(state.path)).mode & 0o7777, 0o640, label);
  assert.deepEqual(
    (await readdir(join(state.root, ".shield"))).filter((name) => name.includes("migrate")),
    [],
    label,
  );
}

async function assertDeterministicMigrationClassification(state, label) {
  const before = await migrationStateSnapshot(state);
  const migrationArtifacts = before.filter(({ name }) => name.includes("migrate"));
  if (migrationArtifacts.length > 0) {
    await assert.rejects(migrateConfigFile(
      state.path,
      state.legacyBytes,
      state.legacy,
      state.candidate,
      { nonce: () => "abcdef0123456789" },
    ), /recovery_required.*do not retry blindly/iu, label);
  } else {
    const config = JSON.parse(await readFile(state.path, "utf8"));
    const args = config.schemaVersion === 3 ? [...initArgs, "--migrate-config"] : initArgs;
    const result = run(args, state.root);
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.match(result.stdout, /no files changed/iu, label);
  }
  assert.deepEqual(await migrationStateSnapshot(state), before, label);
}

test("init creates only the deterministic SHIELD files and repeated init is a no-op", async () => {
  const root = await fixture();
  const first = run(initArgs, root);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual((await readdir(root)).sort(), [".git", ".shield", "existing.txt", "package.json"]);
  assert.deepEqual((await readdir(join(root, ".shield"))).sort(), [".gitignore", "config.json"]);
  assert.equal(await readFile(join(root, "existing.txt"), "utf8"), "preserve me\n");
  assert.equal(await readFile(join(root, ".shield", ".gitignore"), "utf8"), "/journals/\n/reports/\n/tmp/\n");
  const before = await readFile(join(root, ".shield", "config.json"), "utf8");
  const parsed = JSON.parse(before);
  assert.equal(parsed.schemaVersion, 3);
  assert.equal(parsed.repositoryTrustProfileId, "signed_human_gates");
  assert.deepEqual(parsed.adapterIds, ["github"]);

  const second = run(initArgs, root);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /no files changed/i);
  assert.equal(await readFile(join(root, ".shield", "config.json"), "utf8"), before);
});

test("Coulson-only init writes exactly one binding and repeated init is a no-op", async () => {
  const root = await fixture();
  const args = [
    "init",
    "--repository-id", "RanSolo/fixture",
    "--repository-trust-profile", "coulson_only_platform_review",
    "--coulson-binding-ref", "ed25519:sha256:coulson",
  ];
  const first = run(args, root);
  assert.equal(first.status, 0, first.stderr);
  const path = join(root, ".shield", "config.json");
  const before = await readFile(path, "utf8");
  const config = JSON.parse(before);
  assert.equal(config.schemaVersion, 3);
  assert.equal(config.repositoryTrustProfileId, "coulson_only_platform_review");
  assert.deepEqual(config.trustedHumanBindingRefs, [
    { seatId: "coulson", bindingRef: "ed25519:sha256:coulson" },
  ]);
  const second = run(args, root);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /no files changed/iu);
  assert.equal(await readFile(path, "utf8"), before);
});

test("init defaults to signed human gates and rejects invalid profile arguments before mutation", async () => {
  const cases = [
    [["init", "--repository-id", "RanSolo/fixture", "--coulson-binding-ref", "ed25519:sha256:coulson"], /fitz-binding-ref/iu],
    [["init", "--repository-id", "RanSolo/fixture", "--repository-trust-profile", "coulson_only_platform_review"], /coulson-binding-ref/iu],
    [[...initArgs, "--repository-trust-profile", "coulson_only_platform_review"], /rejects --fitz-binding-ref/iu],
    [["init", "--repository-id", "RanSolo/fixture", "--repository-trust-profile", "hostile", "--coulson-binding-ref", "ed25519:sha256:coulson"], /unsupported repository trust profile/iu],
    [["init", "--repository-id", "RanSolo/fixture", "--repository-trust-profile", "coulson_only_platform_review", "--coulson-binding-ref", "placeholder"], /configured SHIELD signing binding reference/iu],
  ];
  for (const [args, message] of cases) {
    const root = await fixture();
    const result = run(args, root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
    await assert.rejects(lstat(join(root, ".shield")), { code: "ENOENT" });
  }
});

test("legacy equivalent re-init preserves bytes while divergence and Coulson-only migration fail atomically", async () => {
  const initialized = await fixture();
  assert.equal(run(initArgs, initialized).status, 0);
  const generated = JSON.parse(await readFile(join(initialized, ".shield", "config.json"), "utf8"));
  const { repositoryTrustProfileId: _profileId, adapterIds: _adapterIds, ...common } = generated;
  const legacy = { ...common, schemaVersion: 1, adapterId: "github" };

  const equivalent = await fixture();
  await mkdir(join(equivalent, ".shield"));
  const exactBytes = `${JSON.stringify(legacy)}\n`;
  await writeFile(join(equivalent, ".shield", "config.json"), exactBytes);
  const noOp = run(initArgs, equivalent);
  assert.equal(noOp.status, 0, noOp.stderr);
  assert.match(noOp.stdout, /schema-1.*no files changed/iu);
  assert.equal(await readFile(join(equivalent, ".shield", "config.json"), "utf8"), exactBytes);
  assert.deepEqual(await readdir(join(equivalent, ".shield")), ["config.json"]);

  const reordered = await fixture();
  await mkdir(join(reordered, ".shield"));
  const reorderedLegacy = {
    paths: {
      temp: legacy.paths.temp,
      reports: legacy.paths.reports,
      artifacts: legacy.paths.artifacts,
      journals: legacy.paths.journals,
    },
    trustedHumanBindingRefs: [...legacy.trustedHumanBindingRefs].reverse().map(({ seatId, bindingRef }) => ({ bindingRef, seatId })),
    supportedModeIds: [...legacy.supportedModeIds].reverse(),
    supportedSeatIds: [...legacy.supportedSeatIds].reverse(),
    adapterId: legacy.adapterId,
    repositoryId: legacy.repositoryId,
    schemaVersion: legacy.schemaVersion,
  };
  const reorderedBytes = `${JSON.stringify(reorderedLegacy, null, 4)}\n`;
  await writeFile(join(reordered, ".shield", "config.json"), reorderedBytes);
  const reorderedNoOp = run(initArgs, reordered);
  assert.equal(reorderedNoOp.status, 0, reorderedNoOp.stderr);
  assert.equal(await readFile(join(reordered, ".shield", "config.json"), "utf8"), reorderedBytes);
  assert.deepEqual(await readdir(join(reordered, ".shield")), ["config.json"]);

  const legacyPlaceholders = await fixture();
  await mkdir(join(legacyPlaceholders, ".shield"));
  const compatibleLegacy = structuredClone(legacy);
  compatibleLegacy.trustedHumanBindingRefs = [
    { seatId: "coulson", bindingRef: "placeholder" },
    { seatId: "fitz", bindingRef: "github:user:fitz-todo" },
  ];
  const compatibleBytes = `${JSON.stringify(compatibleLegacy, null, 3)}\n`;
  await writeFile(join(legacyPlaceholders, ".shield", "config.json"), compatibleBytes);
  const compatibleNoOp = run([
    "init", "--repository-id", "RanSolo/fixture",
    "--coulson-binding-ref", "placeholder",
    "--fitz-binding-ref", "github:user:fitz-todo",
  ], legacyPlaceholders);
  assert.equal(compatibleNoOp.status, 0, compatibleNoOp.stderr);
  assert.equal(await readFile(join(legacyPlaceholders, ".shield", "config.json"), "utf8"), compatibleBytes);
  assert.deepEqual(await readdir(join(legacyPlaceholders, ".shield")), ["config.json"]);

  const before = await readFile(join(equivalent, ".shield", "config.json"), "utf8");
  const divergent = run([...initArgs.slice(0, -1), "github:user:different-fitz"], equivalent);
  assert.equal(divergent.status, 2);
  assert.match(divergent.stderr, /schema-1 configuration differs/iu);
  assert.equal(await readFile(join(equivalent, ".shield", "config.json"), "utf8"), before);

  const migration = run([
    "init", "--repository-id", "RanSolo/fixture",
    "--repository-trust-profile", "coulson_only_platform_review",
    "--coulson-binding-ref", "github:user:coulson",
  ], equivalent);
  assert.equal(migration.status, 2);
  assert.match(migration.stderr, /differs from the requested migration/iu);
  assert.equal(await readFile(join(equivalent, ".shield", "config.json"), "utf8"), before);
});

test("init accepts only normalized registry-ordered adapter selections", async () => {
  const root = await fixture();
  const dual = run([...initArgs, "--adapters", "github,atlassian"], root);
  assert.equal(dual.status, 0, dual.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(root, ".shield", "config.json"), "utf8")).adapterIds, ["github", "atlassian"]);

  for (const [value, message] of [
    ["", /non-empty normalized/iu],
    ["github, github", /normalized/iu],
    ["github,github", /unique/iu],
    ["atlassian,github", /registry/iu],
    ["gitlab", /unsupported/iu],
  ]) {
    const invalidRoot = await fixture();
    const result = run([...initArgs, "--adapters", value], invalidRoot);
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
    await assert.rejects(lstat(join(invalidRoot, ".shield")), { code: "ENOENT" });
  }
});

test("explicit schema-1 and schema-2 migration is mode-preserving, exact, and repeatable", async () => {
  const current = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: "github:user:coulson",
    fitzBindingRef: "github:user:fitz",
  });
  const { adapterIds: _adapterIds, ...v2Common } = current;
  const v2 = { ...v2Common, schemaVersion: 2, adapterId: "github" };
  const { repositoryTrustProfileId: _profileId, ...v1Common } = v2;
  const v1 = { ...v1Common, schemaVersion: 1 };

  for (const legacy of [v1, v2]) {
    const root = await fixture();
    await mkdir(join(root, ".shield"));
    const path = join(root, ".shield", "config.json");
    const originalBytes = `${JSON.stringify(legacy)}\n`;
    await writeFile(path, originalBytes);
    await chmod(path, 0o640);

    const preserved = run(initArgs, root);
    assert.equal(preserved.status, 0, preserved.stderr);
    assert.match(preserved.stdout, new RegExp(`schema-${legacy.schemaVersion}.*no files changed`, "iu"));
    assert.equal(await readFile(path, "utf8"), originalBytes);

    const migrated = run([...initArgs, "--migrate-config"], root);
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), current);
    assert.equal((await stat(path)).mode & 0o7777, 0o640);
    assert.equal((await readdir(join(root, ".shield"))).some((name) => name.includes("migrate")), false);

    const repeated = run([...initArgs, "--migrate-config"], root);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /no files changed/iu);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), current);
  }
});

test("migration rejects adapter expansion and orphaned state without touching legacy bytes", async () => {
  const root = await fixture();
  await mkdir(join(root, ".shield"));
  const current = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: "github:user:coulson",
    fitzBindingRef: "github:user:fitz",
  });
  const { adapterIds: _adapterIds, ...common } = current;
  const legacy = { ...common, schemaVersion: 2, adapterId: "github" };
  const path = join(root, ".shield", "config.json");
  const bytes = formatShieldConfig(legacy);
  await writeFile(path, bytes);

  const expansion = run([...initArgs, "--adapters", "github,atlassian", "--migrate-config"], root);
  assert.equal(expansion.status, 2);
  assert.match(expansion.stderr, /differs from the requested migration/iu);
  assert.equal(await readFile(path, "utf8"), bytes);

  await writeFile(join(root, ".shield", ".config.json.migrate-deadbeefdeadbeef.tmp"), "orphan\n", { mode: 0o600 });
  const orphan = run([...initArgs, "--migrate-config"], root);
  assert.equal(orphan.status, 2);
  assert.match(orphan.stderr, /recovery_required.*orphaned/iu);
  assert.equal(await readFile(path, "utf8"), bytes);
});

test("migration syncs restored mode and orders retained-handle reads before final path identity", async () => {
  const state = await migrationFixture();
  let configOpenCount = 0;
  let sourceReads = 0;
  let lockReads = 0;
  let installedRead = false;
  let tempSyncs = 0;
  let modeRestored = false;
  let syncedAfterMode = false;
  let sourcePathChecks = 0;
  let lockPathChecks = 0;
  const operations = {
    async open(path, flags, mode) {
      const handle = await open(path, flags, mode);
      if (path.endsWith("config.json.migrate.lock")) {
        return migrationHandle(handle, {
          read: async (...args) => { lockReads += 1; return handle.read(...args); },
        });
      }
      if (path.includes(".config.json.migrate-") && path.endsWith(".tmp")) {
        return migrationHandle(handle, {
          chmod: async (nextMode) => { await handle.chmod(nextMode); if (nextMode === 0o640) modeRestored = true; },
          sync: async () => { tempSyncs += 1; await handle.sync(); if (modeRestored) syncedAfterMode = true; },
        });
      }
      if (path === state.path) {
        configOpenCount += 1;
        if (configOpenCount === 1) {
          return migrationHandle(handle, {
            read: async (...args) => { sourceReads += 1; return handle.read(...args); },
          });
        }
        assert.notEqual(flags & constants.O_NOFOLLOW, 0);
        return migrationHandle(handle, {
          read: async (...args) => { installedRead = true; return handle.read(...args); },
        });
      }
      return handle;
    },
    async lstat(path) {
      const stats = await lstat(path);
      if (path === state.path) {
        sourcePathChecks += 1;
        if (sourcePathChecks === 2) assert.equal(sourceReads >= 2, true);
        if (sourcePathChecks === 3) assert.equal(installedRead, true);
      }
      if (path.endsWith("config.json.migrate.lock")) {
        lockPathChecks += 1;
        if (lockPathChecks === 2) assert.equal(lockReads >= 2, true);
      }
      return stats;
    },
  };
  await migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
    nonce: () => "0123456789abcdef",
    operations,
  });
  assert.equal(tempSyncs, 2);
  assert.equal(syncedAfterMode, true);
  assert.equal(sourcePathChecks >= 3, true);
  assert.equal(lockPathChecks >= 2, true);
  assert.equal(await readFile(state.path, "utf8"), formatShieldConfig(state.candidate));
  assert.equal((await stat(state.path)).mode & 0o7777, 0o640);
});

test("short migration write proves cleanup and permits a successful retry", async () => {
  const state = await migrationFixture();
  await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
    nonce: () => "0123456789abcdef",
    operations: {
      async open(path, flags, mode) {
        const handle = await open(path, flags, mode);
        if (!path.includes(".config.json.migrate-") || !path.endsWith(".tmp")) return handle;
        return migrationHandle(handle, {
          write: async (buffer, offset, length, position) => handle.write(buffer, offset, length - 1, position),
        });
      },
    },
  }), /failed before rename/iu);
  await assertLegacyCleanupAndRetry(state, "short temporary write");
});

test("migration pre-rename operation faults prove exact cleanup and permit a successful retry", async () => {
  const cases = [
    {
      name: "lock create",
      operations: (state) => ({
        async open(path, flags, mode) {
          if (path === `${state.path}.migrate.lock`) throw new Error("lock create fault");
          return open(path, flags, mode);
        },
      }),
    },
    {
      name: "lock write",
      operations: (state) => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path !== `${state.path}.migrate.lock`) return handle;
          return migrationHandle(handle, {
            write: async () => { throw new Error("lock write fault"); },
          });
        },
      }),
    },
    {
      name: "lock sync",
      operations: (state) => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path !== `${state.path}.migrate.lock`) return handle;
          return migrationHandle(handle, {
            sync: async () => { throw new Error("lock sync fault"); },
          });
        },
      }),
    },
    {
      name: "lock marker identity",
      operations: (state) => {
        let lockLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path === `${state.path}.migrate.lock` && ++lockLstats === 1) return driftIdentity(stats);
            return stats;
          },
        };
      },
    },
    {
      name: "source open",
      operations: (state) => ({
        async open(path, flags, mode) {
          if (path === state.path) throw new Error("source open fault");
          return open(path, flags, mode);
        },
      }),
    },
    {
      name: "source read",
      operations: (state) => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path !== state.path) return handle;
          return migrationHandle(handle, {
            read: async () => { throw new Error("source read fault"); },
          });
        },
      }),
    },
    {
      name: "source initial path identity",
      operations: (state) => {
        let sourceLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path === state.path && ++sourceLstats === 1) return driftIdentity(stats);
            return stats;
          },
        };
      },
    },
    {
      name: "source final revalidation drift",
      operations: (state) => {
        let sourceLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path === state.path && ++sourceLstats === 2) return driftIdentity(stats);
            return stats;
          },
        };
      },
    },
    {
      name: "temporary creation",
      operations: () => ({
        async open(path, flags, mode) {
          if (path.includes(".config.json.migrate-") && path.endsWith(".tmp")) {
            throw new Error("temporary creation fault");
          }
          return open(path, flags, mode);
        },
      }),
    },
    {
      name: "initial temporary sync",
      operations: () => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (!path.includes(".config.json.migrate-") || !path.endsWith(".tmp")) return handle;
          let tempSyncs = 0;
          return migrationHandle(handle, {
            sync: async () => {
              tempSyncs += 1;
              if (tempSyncs === 1) throw new Error("initial temporary sync fault");
              await handle.sync();
            },
          });
        },
      }),
    },
    {
      name: "temporary readback",
      operations: () => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (!path.includes(".config.json.migrate-") || !path.endsWith(".tmp")) return handle;
          return migrationHandle(handle, {
            read: async (buffer, offset, length, position) => {
              const result = await handle.read(buffer, offset, length, position);
              if (result.bytesRead > 0) buffer[offset] ^= 1;
              return result;
            },
          });
        },
      }),
    },
    {
      name: "mode restoration sync",
      operations: () => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (!path.includes(".config.json.migrate-") || !path.endsWith(".tmp")) return handle;
          let tempSyncs = 0;
          return migrationHandle(handle, {
            sync: async () => {
              tempSyncs += 1;
              if (tempSyncs === 2) throw new Error("mode restoration sync fault");
              await handle.sync();
            },
          });
        },
      }),
    },
    {
      name: "temporary identity",
      operations: () => {
        let tempLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path.includes(".config.json.migrate-") && path.endsWith(".tmp") && ++tempLstats === 1) {
              return driftIdentity(stats);
            }
            return stats;
          },
        };
      },
    },
    {
      name: "initial directory sync",
      operations: (state) => {
        let directorySyncs = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== join(state.root, ".shield")) return handle;
            return migrationHandle(handle, {
              sync: async () => {
                directorySyncs += 1;
                if (directorySyncs === 1) throw new Error("initial directory sync fault");
                await handle.sync();
              },
            });
          },
        };
      },
    },
    {
      name: "lock final revalidation",
      operations: (state) => {
        let lockLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path === `${state.path}.migrate.lock` && ++lockLstats === 2) return driftIdentity(stats);
            return stats;
          },
        };
      },
    },
  ];

  for (const fault of cases) {
    const state = await migrationFixture();
    await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
      nonce: () => "0123456789abcdef",
      operations: fault.operations(state),
    }), /failed before rename/iu, fault.name);
    await assertLegacyCleanupAndRetry(state, fault.name);
  }
});

test("migration rename, installed-readback, and lock-release uncertainty require recovery and stable classification", async () => {
  const cases = [
    {
      name: "short lock write",
      expected: "legacy",
      operations: (state) => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path !== `${state.path}.migrate.lock`) return handle;
          return migrationHandle(handle, {
            write: async (buffer, offset, length, position) => handle.write(buffer, offset, length - 1, position),
          });
        },
      }),
    },
    {
      name: "rename before effect",
      expected: "legacy",
      operations: () => ({
        async rename() {
          throw new Error("rename before effect fault");
        },
      }),
    },
    {
      name: "ambiguous rename",
      expected: "candidate",
      operations: () => ({
        async rename(source, destination) {
          await rename(source, destination);
          throw new Error("ambiguous rename fault");
        },
      }),
    },
    {
      name: "installed open",
      expected: "candidate",
      operations: (state) => {
        let configOpens = 0;
        return {
          async open(path, flags, mode) {
            if (path === state.path && ++configOpens === 2) throw new Error("installed open fault");
            return open(path, flags, mode);
          },
        };
      },
    },
    {
      name: "installed identity",
      expected: "candidate",
      operations: (state) => {
        let configOpens = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== state.path || ++configOpens !== 2) return handle;
            return migrationHandle(handle, {
              stat: async () => driftIdentity(await handle.stat()),
            });
          },
        };
      },
    },
    {
      name: "installed bound readback",
      expected: "candidate",
      operations: (state) => {
        let configOpens = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== state.path || ++configOpens !== 2) return handle;
            return migrationHandle(handle, {
              read: async (buffer, offset, length, position) => {
                const result = await handle.read(buffer, offset, length, position);
                if (result.bytesRead > 0) buffer[offset] ^= 1;
                return result;
              },
            });
          },
        };
      },
    },
    {
      name: "installed close",
      expected: "candidate",
      operations: (state) => {
        let configOpens = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== state.path || ++configOpens !== 2) return handle;
            return migrationHandle(handle, {
              close: async () => { await handle.close(); throw new Error("installed close fault"); },
            });
          },
        };
      },
    },
    {
      name: "post-rename directory sync",
      expected: "candidate",
      operations: (state) => {
        let directorySyncs = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== join(state.root, ".shield")) return handle;
            return migrationHandle(handle, {
              sync: async () => {
                directorySyncs += 1;
                if (directorySyncs === 2) throw new Error("post-rename directory sync fault");
                await handle.sync();
              },
            });
          },
        };
      },
    },
    {
      name: "lock release identity",
      expected: "candidate",
      operations: (state) => {
        let lockLstats = 0;
        return {
          async lstat(path) {
            const stats = await lstat(path);
            if (path === `${state.path}.migrate.lock` && ++lockLstats === 3) return driftIdentity(stats);
            return stats;
          },
        };
      },
    },
    {
      name: "lock release close",
      expected: "candidate",
      operations: (state) => ({
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path !== `${state.path}.migrate.lock`) return handle;
          return migrationHandle(handle, {
            close: async () => { await handle.close(); throw new Error("lock release close fault"); },
          });
        },
      }),
    },
    {
      name: "lock release unlink",
      expected: "candidate",
      operations: (state) => ({
        async unlink(path) {
          if (path === `${state.path}.migrate.lock`) throw new Error("lock release unlink fault");
          await unlink(path);
        },
      }),
    },
    {
      name: "lock release absence",
      expected: "candidate",
      operations: (state) => {
        let successfulLockLstats = 0;
        let priorLockStats;
        return {
          async lstat(path) {
            try {
              const stats = await lstat(path);
              if (path === `${state.path}.migrate.lock`) {
                successfulLockLstats += 1;
                priorLockStats = stats;
              }
              return stats;
            } catch (error) {
              if (path === `${state.path}.migrate.lock` && successfulLockLstats === 4) return priorLockStats;
              throw error;
            }
          },
        };
      },
    },
    {
      name: "lock release final directory sync",
      expected: "candidate",
      operations: (state) => {
        let directorySyncs = 0;
        return {
          async open(path, flags, mode) {
            const handle = await open(path, flags, mode);
            if (path !== join(state.root, ".shield")) return handle;
            return migrationHandle(handle, {
              sync: async () => {
                directorySyncs += 1;
                await handle.sync();
                if (directorySyncs === 3) throw new Error("lock release directory sync fault");
              },
            });
          },
        };
      },
    },
  ];

  for (const fault of cases) {
    const state = await migrationFixture();
    await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
      nonce: () => "0123456789abcdef",
      operations: fault.operations(state),
    }), /recovery_required.*do not retry blindly/iu, fault.name);
    assert.equal(
      await readFile(state.path, "utf8"),
      fault.expected === "legacy" ? state.legacyBytes : formatShieldConfig(state.candidate),
      fault.name,
    );
    assert.equal((await stat(state.path)).mode & 0o7777, 0o640, fault.name);
    await assertDeterministicMigrationClassification(state, fault.name);
  }
});

test("migration cleanup close and unlink uncertainty require recovery without changing legacy bytes", async () => {
  for (const fault of ["close", "unlink"]) {
    const state = await migrationFixture();
    await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
      nonce: () => "0123456789abcdef",
      operations: {
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (!path.includes(".config.json.migrate-") || !path.endsWith(".tmp")) return handle;
          return migrationHandle(handle, {
            write: async (buffer, offset, length, position) => handle.write(buffer, offset, length - 1, position),
            ...(fault === "close" ? { close: async () => { await handle.close(); throw new Error("close fault"); } } : {}),
          });
        },
        async unlink(path) {
          if (fault === "unlink" && path.includes(".config.json.migrate-") && path.endsWith(".tmp")) {
            throw new Error("unlink fault");
          }
          await unlink(path);
        },
      },
    }), /recovery_required.*do not retry blindly/iu, fault);
    assert.equal(await readFile(state.path, "utf8"), state.legacyBytes, fault);
    assert.equal((await stat(state.path)).mode & 0o7777, 0o640, fault);
    await assertDeterministicMigrationClassification(state, `temporary cleanup ${fault}`);
  }
});

test("init can select a starter pipeline and records a deterministic pipeline profile", async () => {
  const root = await starterFixture();
  const args = [...initArgs, "--starter-pipeline", "minimal"];

  const first = run(args, root);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual((await readdir(join(root, ".shield"))).sort(), [".gitignore", "config.json", "pipeline-profile.json"]);

  const profile = JSON.parse(await readFile(join(root, ".shield", "pipeline-profile.json"), "utf8"));
  assert.equal(profile.contractVersion, "pipeline.profile.v1");
  assert.equal(profile.profileId, "pipeline:starter:minimal");
  assert.equal(profile.repository, "RanSolo/fixture");
  assert.deepEqual(profile.defaultModes, ["lint", "typecheck", "unit-test"]);
  assert.deepEqual(profile.supported.map(({ modeId }) => modeId), ["lint", "typecheck", "unit-test"]);
  assert.deepEqual(profile.unavailable, []);
  assert.equal(profile.supported.find(({ modeId }) => modeId === "lint").command.executable, "npm");
  assert.deepEqual(profile.supported.find(({ modeId }) => modeId === "lint").command.args, ["run", "lint"]);
  assert.match(profile.artifactRevisionId, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(profile.staleWhenChanged, [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
  ]);

  const second = run(args, root);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /no files changed/i);
  assert.equal(
    await readFile(join(root, ".shield", "pipeline-profile.json"), "utf8"),
    `${JSON.stringify(profile, null, 2)}\n`,
  );
});

test("starter selection records all lanes unavailable when package.json is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-starter-no-package-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const result = run([...initArgs, "--starter-pipeline", "minimal"], root);
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(await readFile(join(root, ".shield", "pipeline-profile.json"), "utf8"));
  assert.deepEqual(profile.supported, []);
  assert.deepEqual(profile.defaultModes, []);
  assert.deepEqual(profile.unavailable.map(({ modeId }) => modeId), ["lint", "typecheck", "unit-test"]);
});

test("init refuses divergent targets without overwriting them", async () => {
  const root = await fixture();
  await mkdir(join(root, ".shield"));
  await writeFile(join(root, ".shield", "config.json"), "{\"owned\":true}\n");
  const result = run(initArgs, root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to overwrite/i);
  assert.equal(await readFile(join(root, ".shield", "config.json"), "utf8"), "{\"owned\":true}\n");
  await assert.rejects(lstat(join(root, ".shield", ".gitignore")), { code: "ENOENT" });
});

test("starter selection is fail-atomic when .shield/.gitignore diverges", async () => {
  const root = await starterFixture();
  await mkdir(join(root, ".shield"));
  await writeFile(join(root, ".shield", ".gitignore"), "different\n");
  const result = run([...initArgs, "--starter-pipeline", "minimal"], root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ignore file differs/i);
  await assert.rejects(lstat(join(root, ".shield", "pipeline-profile.json")), { code: "ENOENT" });
  await assert.rejects(lstat(join(root, ".shield", "config.json")), { code: "ENOENT" });
  assert.equal(await readFile(join(root, ".shield", ".gitignore"), "utf8"), "different\n");
});

test("starter-profile divergence is preflighted before legacy migration", async () => {
  const root = await starterFixture();
  await mkdir(join(root, ".shield"));
  const current = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: "github:user:coulson",
    fitzBindingRef: "github:user:fitz",
  });
  const { adapterIds: _adapterIds, ...common } = current;
  const legacy = { ...common, schemaVersion: 2, adapterId: "github" };
  const configPath = join(root, ".shield", "config.json");
  const legacyBytes = `${JSON.stringify(legacy)}\n`;
  await writeFile(configPath, legacyBytes);
  await chmod(configPath, 0o640);
  await writeFile(join(root, ".shield", "pipeline-profile.json"), "{\"owned\":true}\n");

  const result = run([...initArgs, "--starter-pipeline", "minimal", "--migrate-config"], root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /starter pipeline profile differs/iu);
  assert.equal(await readFile(configPath, "utf8"), legacyBytes);
  assert.equal((await stat(configPath)).mode & 0o7777, 0o640);
  assert.equal((await readdir(join(root, ".shield"))).some((name) => name.includes("migrate")), false);
});

test("init rejects a symlinked SHIELD directory", async () => {
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "shield-outside-"));
  await symlink(outside, join(root, ".shield"));
  const result = run(initArgs, root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /symlink/i);
  assert.deepEqual(await readdir(outside), []);
});

test("doctor provides deterministic human and JSON results", async () => {
  const root = await fixture();
  assert.equal(run(initArgs, root).status, 0);

  const human = run(["doctor"], root);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^PASS repository-root:/);
  assert.match(human.stdout, /SHIELD doctor: healthy\./);

  const json = run(["doctor", "--json"], root);
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.reportVersion, 2);
  assert.deepEqual(report.checks.filter(({ id }) => id === "adapter").map(({ adapterId }) => adapterId), ["github"]);
  assert.equal(report.checks[0].id, "repository-root");
  assert.equal(report.checks.at(-1).id, "paths");
  assert.equal(
    report.checks.find(({ id }) => id === "bindings").message,
    "Repository trust profile signed_human_gates configures Coulson and Fitz binding references as required cryptographic seats; Simmons remains optional for product-sensitive missions.",
  );

  const coulsonOnlyRoot = await fixture();
  assert.equal(run([
    "init", "--repository-id", "RanSolo/fixture",
    "--repository-trust-profile", "coulson_only_platform_review",
    "--coulson-binding-ref", "ed25519:sha256:coulson",
  ], coulsonOnlyRoot).status, 0);
  const coulsonOnly = run(["doctor", "--json"], coulsonOnlyRoot);
  assert.equal(coulsonOnly.status, 0, coulsonOnly.stderr);
  assert.equal(
    JSON.parse(coulsonOnly.stdout).checks.find(({ id }) => id === "bindings").message,
    "Repository trust profile coulson_only_platform_review configures Coulson as the only required cryptographic seat. Fitz is GitHub-enforced external review; Simmons is conditional external feedback; neither is admitted as SHIELD evidence.",
  );
});

test("doctor host selection returns a separate Copilot capability report and rejects invalid hosts before probing", async () => {
  const root = await fixture();
  assert.equal(run(initArgs, root).status, 0);
  await mkdir(join(root, ".github", "agents"), { recursive: true });
  for (const seat of ["hill", "daisy", "fury", "may", "mack"]) {
    await writeFile(
      join(root, ".github", "agents", `${seat}.agent.md`),
      await readFile(join(workspaceRoot, ".github", "agents", `${seat}.agent.md`)),
    );
  }
  execFileSync("git", ["config", "user.email", "shield@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "SHIELD Doctor Fixture"], { cwd: root });
  execFileSync("git", ["add", "package.json", "existing.txt", ".shield", ".github/agents"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "doctor host fixture"], { cwd: root });
  const isolatedHome = await mkdtemp(join(tmpdir(), "shield-doctor-home-"));

  const selected = run(["doctor", "--host", "github-copilot", "--json"], root, { HOME: isolatedHome, COPILOT_HOME: isolatedHome });
  assert.equal(selected.status, 0, selected.stderr);
  const report = JSON.parse(selected.stdout);
  assert.equal(report.contractVersion, "shield.doctor.host-selected.v1");
  assert.equal(report.authority, "none");
  assert.equal(report.host, "github-copilot");
  assert.equal(report.ok, true);
  assert.equal(report.doctor.reportVersion, 2);
  assert.equal(report.hostCapability.reasonCode, "ready");
  assert.equal(report.hostCapability.disposition, "ready");

  await writeFile(join(root, ".shield", "dispatch-receipts.jsonl.lock"), "held\n");
  execFileSync("git", ["add", "-f", ".shield/dispatch-receipts.jsonl.lock"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "unsafe receipt lock"], { cwd: root });
  const unavailable = run(["doctor", "--host", "github-copilot", "--json"], root, { HOME: isolatedHome, COPILOT_HOME: isolatedHome });
  assert.equal(unavailable.status, 1, unavailable.stderr);
  const unavailableReport = JSON.parse(unavailable.stdout);
  assert.equal(unavailableReport.doctor.ok, true);
  assert.equal(unavailableReport.hostCapability.reasonCode, "dispatch_receipt_path_unsafe");
  assert.equal(unavailableReport.ok, false);

  const invalid = run(["doctor", "--host", "unsupported", "--root", join(root, "missing"), "--json"], root);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unsupported doctor host: unsupported/u);
  assert.doesNotMatch(invalid.stderr, /does not exist/u);
});

test("doctor preserves raw invalid configuration and gives binding profile errors precedence", async () => {
  const root = await fixture();
  assert.equal(run(initArgs, root).status, 0);
  const path = join(root, ".shield", "config.json");
  const config = JSON.parse(await readFile(path, "utf8"));

  delete config.repositoryTrustProfileId;
  await writeFile(path, `${JSON.stringify(config)}\n`);
  const missingProfile = run(["doctor", "--json"], root);
  assert.equal(missingProfile.status, 1, missingProfile.stderr);
  const missingReport = JSON.parse(missingProfile.stdout);
  assert.deepEqual(missingReport.checks.find(({ id }) => id === "config-schema"), {
    id: "config-schema", ok: true, message: "Configuration schema and repository identity are valid.",
  });
  assert.deepEqual(missingReport.checks.find(({ id }) => id === "bindings"), {
    id: "bindings", ok: false, message: "config is missing field: repositoryTrustProfileId.",
  });

  for (const repositoryTrustProfileId of [false, "hostile"]) {
    await writeFile(path, `${JSON.stringify({ ...config, repositoryTrustProfileId })}\n`);
    const result = run(["doctor", "--json"], root);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.checks.find(({ id }) => id === "config-schema"), {
      id: "config-schema", ok: true, message: "Configuration schema and repository identity are valid.",
    });
    assert.deepEqual(report.checks.find(({ id }) => id === "bindings"), {
      id: "bindings", ok: false,
      message: "config.repositoryTrustProfileId must be signed_human_gates or coulson_only_platform_review.",
    });
  }

  const contradictory = { ...config, repositoryTrustProfileId: "coulson_only_platform_review" };
  await writeFile(path, `${JSON.stringify(contradictory)}\n`);
  const contradictoryReport = JSON.parse(run(["doctor", "--json"], root).stdout);
  assert.deepEqual(contradictoryReport.checks.find(({ id }) => id === "config-schema"), {
    id: "config-schema", ok: true, message: "Configuration schema and repository identity are valid.",
  });
  assert.deepEqual(contradictoryReport.checks.find(({ id }) => id === "bindings"), {
    id: "bindings", ok: false,
    message: "Repository trust profile coulson_only_platform_review does not admit a fitz SHIELD binding reference.",
  });

  const unknown = { ...config, repositoryTrustProfileId: "signed_human_gates", unrelated: true };
  await writeFile(path, `${JSON.stringify(unknown)}\n`);
  const unknownReport = JSON.parse(run(["doctor", "--json"], root).stdout);
  assert.deepEqual(unknownReport.checks.find(({ id }) => id === "config-schema"), {
    id: "config-schema", ok: false, message: "config has unknown field: unrelated.",
  });

  await writeFile(path, `${JSON.stringify({ ...config, repositoryTrustProfileId: "signed_human_gates", schemaVersion: 4 })}\n`);
  const unsupportedReport = JSON.parse(run(["doctor", "--json"], root).stdout);
  assert.deepEqual(unsupportedReport.checks.find(({ id }) => id === "config-schema"), {
    id: "config-schema", ok: false, message: "Config schemaVersion must be one of: 1, 2, 3.",
  });
  assert.equal(unsupportedReport.checks.find(({ id }) => id === "bindings").ok, true);
});

test("doctor returns one for an unhealthy repository and usage errors return two", async () => {
  const root = await fixture();
  const unhealthy = run(["doctor", "--json"], root);
  assert.equal(unhealthy.status, 1, unhealthy.stderr);
  assert.equal(JSON.parse(unhealthy.stdout).ok, false);

  await mkdir(join(root, ".shield"));
  await writeFile(join(root, ".shield", "config.json"), "{ malformed\n");
  const malformed = run(["doctor", "--json"], root);
  assert.equal(malformed.status, 1, malformed.stderr);
  const malformedReport = JSON.parse(malformed.stdout);
  assert.equal(malformedReport.ok, false);
  assert.deepEqual(malformedReport.checks.find(({ id }) => id === "config-schema"), {
    id: "config-schema", ok: false, message: "Config contains malformed JSON.",
  });

  const unsupported = run(["mission", "launch"], root);
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /unsupported .*command/i);
});

test("init and doctor require the exact Git package root without ancestor search", async () => {
  const bare = await mkdtemp(join(tmpdir(), "shield-bare-"));
  const bareDoctor = run(["doctor", "--json"], bare);
  assert.equal(bareDoctor.status, 1, bareDoctor.stderr);
  assert.match(
    JSON.parse(bareDoctor.stdout).checks.find(({ id }) => id === "repository-root").message,
    /Git worktree/i,
  );
  const bareInit = run(initArgs, bare);
  assert.equal(bareInit.status, 2);
  assert.match(bareInit.stderr, /Git worktree/i);

  execFileSync("git", ["init", "--quiet"], { cwd: bare });
  const missingPackage = run(["doctor", "--json"], bare);
  assert.equal(missingPackage.status, 1, missingPackage.stderr);
  assert.match(
    JSON.parse(missingPackage.stdout).checks.find(({ id }) => id === "repository-root").message,
    /package\.json/i,
  );

  await writeFile(join(bare, "package.json"), "not json\n");
  const malformedPackage = run(["doctor", "--json"], bare);
  assert.equal(malformedPackage.status, 1, malformedPackage.stderr);
  assert.match(
    JSON.parse(malformedPackage.stdout).checks.find(({ id }) => id === "repository-root").message,
    /parseable package\.json/i,
  );

  await writeFile(join(bare, "package.json"), "{\"private\":true}\n");
  const nested = join(bare, "nested");
  await mkdir(nested);
  await writeFile(join(nested, "package.json"), "{\"private\":true}\n");
  const wrongRoot = run(["doctor", "--root", nested, "--json"], bare);
  assert.equal(wrongRoot.status, 1, wrongRoot.stderr);
  assert.match(
    JSON.parse(wrongRoot.stdout).checks.find(({ id }) => id === "repository-root").message,
    /not the Git worktree root/i,
  );
});

test("worktree prepare exposes closed JSON, concise replay output, and prepared doctor state", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-cli-worktree-")));
  const sourceRoot = join(parent, "source");
  const destinationRoot = join(parent, "destination");
  await mkdir(sourceRoot);
  execFileSync("git", ["init", "--quiet"], { cwd: sourceRoot });
  execFileSync("git", ["config", "user.email", "shield@example.invalid"], { cwd: sourceRoot });
  execFileSync("git", ["config", "user.name", "SHIELD CLI Worktree"], { cwd: sourceRoot });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/RanSolo/fixture.git"], { cwd: sourceRoot });
  await writeFile(join(sourceRoot, ".gitignore"), ".shield/\n");
  await writeFile(join(sourceRoot, "package.json"), "{\"private\":true}\n");
  execFileSync("git", ["add", ".gitignore", "package.json"], { cwd: sourceRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "CLI worktree fixture"], { cwd: sourceRoot });
  execFileSync("git", ["worktree", "add", "--quiet", "-b", `cli-lane-${process.pid}-${Date.now()}`, destinationRoot, "HEAD"], { cwd: sourceRoot });

  const coulson = cliAuthority("coulson");
  const fitz = cliAuthority("fitz");
  const config = createShieldConfig({
    repositoryId: "RanSolo/fixture",
    coulsonBindingRef: coulson.signingKeyRef,
    fitzBindingRef: fitz.signingKeyRef,
  });
  await mkdir(join(sourceRoot, ".shield"));
  await writeFile(join(sourceRoot, ".shield", "config.json"), formatShieldConfig(config));
  await writeFile(
    join(sourceRoot, ".shield", "trusted-human-bindings.json"),
    `${JSON.stringify({ schemaVersion: 1, bindings: [coulson, fitz] }, null, 2)}\n`,
  );

  const prepared = run([
    "worktree", "prepare", "--source-root", await realpath(sourceRoot),
    "--root", await realpath(destinationRoot), "--json",
  ], destinationRoot);
  assert.equal(prepared.status, 0, prepared.stderr);
  const receipt = JSON.parse(prepared.stdout);
  assert.equal(receipt.state, "ready");
  assert.equal(receipt.authority, "none");
  assert.equal(receipt.receipt.repositoryId, "RanSolo/fixture");

  const missionId = "mission:test:prepared-worktree-cli";
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId,
    objective: "Exercise the real prepared-worktree mission lifecycle.",
    subjectId: "issue:test:prepared-worktree-cli",
    riskFlags: {
      production: false, destructive: false, migration: false, credentialsOrSecurity: false,
      externalCommunication: false, hillHighRisk: false, merge: false, deploy: false, release: false,
    },
    participants: ["hill", "may", "coulson", "fitz"].map((seatId) => ({ seatId })),
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-19T12:00:00Z", provenance: "humanRecorded" },
    profileId: "standard",
    profileVersion: 1,
    requiredExecutionGateRoleIds: ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const { revisionId: _revisionId, ...briefContent } = brief;
  const briefPath = join(destinationRoot, ".shield", "tmp", "worktree-brief.json");
  await mkdir(dirname(briefPath), { recursive: true });
  await writeFile(briefPath, `${JSON.stringify(briefContent, null, 2)}\n`);
  const begun = run(["mission", "begin", "--profile-aware", "--brief", briefPath, "--json"], destinationRoot);
  assert.equal(begun.status, 0, begun.stderr);
  const journalPath = profileJournalPath(destinationRoot, missionId);
  const identity = async (path) => {
    const observed = await lstat(path);
    return { dev: observed.dev, ino: observed.ino, mode: observed.mode, uid: observed.uid, gid: observed.gid };
  };
  const missionBefore = {
    briefBytes: await readFile(briefPath),
    briefIdentity: await identity(briefPath),
    journalBytes: await readFile(journalPath),
    journalIdentity: await identity(journalPath),
    journalsIdentity: await identity(dirname(journalPath)),
    tempIdentity: await identity(dirname(briefPath)),
  };

  const status = run(["mission", "status", "--mission-id", missionId, "--json"], destinationRoot);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).schemaVersion, 9);

  const doctor = run(["doctor", "--root", await realpath(destinationRoot), "--json"], destinationRoot);
  assert.equal(doctor.status, 0, doctor.stderr);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.worktreeState.classification, "prepared_worktree");
  assert.equal(report.worktreeState.receiptDigest, receipt.receipt.receiptDigest);
  assert.match(report.worktreeState.message, /mission-local state directories are present/u);

  const replay = run([
    "worktree", "prepare", "--source-root", await realpath(sourceRoot),
    "--root", await realpath(destinationRoot),
  ], destinationRoot);
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /^ALREADY PREPARED\n/u);
  assert.match(replay.stdout, /Repository: RanSolo\/fixture/u);
  assert.doesNotMatch(replay.stdout + replay.stderr, /PIN|passcode/iu);
  assert.deepEqual(await readFile(briefPath), missionBefore.briefBytes);
  assert.deepEqual(await identity(briefPath), missionBefore.briefIdentity);
  assert.deepEqual(await readFile(journalPath), missionBefore.journalBytes);
  assert.deepEqual(await identity(journalPath), missionBefore.journalIdentity);
  assert.deepEqual(await identity(dirname(journalPath)), missionBefore.journalsIdentity);
  assert.deepEqual(await identity(dirname(briefPath)), missionBefore.tempIdentity);

  await writeFile(join(destinationRoot, "package.json"), "{\"private\":true,\"advanced\":true}\n");
  execFileSync("git", ["add", "package.json"], { cwd: destinationRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "advance prepared CLI lane"], { cwd: destinationRoot });
  const refreshed = run([
    "worktree", "prepare", "--source-root", await realpath(sourceRoot),
    "--root", await realpath(destinationRoot), "--json",
  ], destinationRoot);
  assert.equal(refreshed.status, 0, refreshed.stderr);
  const refreshedResult = JSON.parse(refreshed.stdout);
  assert.equal(refreshedResult.contractVersion, "worktree.state.v2");
  assert.equal(refreshedResult.state, "refreshed");
  assert.equal(refreshedResult.receipt.supersedes.receiptDigest, receipt.receipt.receiptDigest);
  const refreshedReplay = run([
    "worktree", "prepare", "--source-root", await realpath(sourceRoot),
    "--root", await realpath(destinationRoot),
  ], destinationRoot);
  assert.equal(refreshedReplay.status, 0, refreshedReplay.stderr);
  assert.match(refreshedReplay.stdout, /^ALREADY REFRESHED\n/u);
  assert.match(refreshedReplay.stdout, new RegExp(`Active receipt: ${refreshedResult.receipt.receiptDigest}`, "u"));
  assert.match(refreshedReplay.stdout, new RegExp(`Predecessor receipt: ${receipt.receipt.receiptDigest}`, "u"));
  assert.deepEqual(await readFile(briefPath), missionBefore.briefBytes);
  assert.deepEqual(await identity(briefPath), missionBefore.briefIdentity);
  assert.deepEqual(await readFile(journalPath), missionBefore.journalBytes);
  assert.deepEqual(await identity(journalPath), missionBefore.journalIdentity);
});

test("worktree prepare renders root filesystem failures as closed blocked results", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-cli-worktree-blocked-")));
  const missingSource = join(parent, "missing-source");
  const missingDestination = join(parent, "missing-destination");
  const json = run([
    "worktree", "prepare", "--source-root", missingSource, "--root", missingDestination, "--json",
  ], parent);
  assert.equal(json.status, 1, json.stderr);
  assert.doesNotMatch(json.stderr, /SHIELD:/u);
  const result = JSON.parse(json.stdout);
  assert.equal(result.state, "blocked");
  assert.equal(result.reasonCode, "root_invalid");
  assert.equal(result.authority, "none");

  const human = run([
    "worktree", "prepare", "--source-root", missingSource, "--root", missingDestination,
  ], parent);
  assert.equal(human.status, 1, human.stderr);
  assert.doesNotMatch(human.stderr, /SHIELD:/u);
  assert.match(human.stdout, /^BLOCKED: root_invalid\n/u);

  const usageFailure = run(["worktree", "prepare", "--source-root", missingSource, "--json"], parent);
  assert.equal(usageFailure.status, 2);
  assert.match(usageFailure.stderr, /Missing required option: --root/u);
});

test("doctor classifies unsafe SHIELD ancestors as stale instead of a usage failure", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shield-cli-doctor-unsafe-")));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "shield@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "SHIELD Doctor Fixture"], { cwd: root });
  await writeFile(join(root, "package.json"), "{\"private\":true}\n");
  execFileSync("git", ["add", "package.json"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "doctor fixture"], { cwd: root });
  const foreign = await realpath(await mkdtemp(join(tmpdir(), "shield-cli-doctor-foreign-")));
  await symlink(foreign, join(root, ".shield"));

  const inspected = run(["doctor", "--root", root, "--json"], root);
  assert.equal(inspected.status, 1, inspected.stderr);
  const report = JSON.parse(inspected.stdout);
  assert.equal(report.worktreeState.classification, "stale_or_malformed_worktree_state");
  assert.equal(report.worktreeState.ok, false);
});

test("profile-aware issue begin uses two hermetic GitHub reads, exact replay uses one, and exposes the prepare-next handoff", async () => {
  const current = await issueCliFixture();
  const invokingBefore = await completeWorktreeSnapshot(current.root);
  assert.equal(invokingBefore.some(({ name }) => name === "ignored-invoking-worktree-canary"), true);
  assert.equal(invokingBefore.some(({ name }) => name === ".shield/tmp/issue-response.json"), true);
  const args = ["mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root, "--json"];
  const first = run(args, current.root, { PATH: current.fakePath });
  assert.equal(first.status, 0, first.stderr);
  const created = JSON.parse(first.stdout);
  assert.equal(created.replayed, false);
  assert.equal(created.nextAction.command, "shield mission prepare-next");
  assert.equal(created.nextAction.missionId, created.projection.missionId);
  assert.equal(JSON.parse(await readFile(join(current.root, ".shield", "tmp", "gh-count"), "utf8")), 2);
  const firstAfter = await completeWorktreeSnapshot(current.root);
  assert.deepEqual(outsideMissionRoot(firstAfter), outsideMissionRoot(invokingBefore));
  assert.deepEqual(changedSnapshotNames(invokingBefore, firstAfter), [
    relative(current.root, profileJournalPath(current.root, created.projection.missionId)),
    ".shield/tmp/gh-count",
  ].sort());
  await assert.rejects(lstat(join(current.root, ".local")), { code: "ENOENT" });
  await assert.rejects(lstat(join(current.root, ".config")), { code: "ENOENT" });

  const status = run(["mission", "status", "--mission-id", created.projection.missionId, "--root", current.root, "--json"], current.root);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).missionId, created.projection.missionId);
  const nativeJournalPath = profileJournalPath(current.root, created.projection.missionId);
  const nativeJournalBeforePrepare = await readFile(nativeJournalPath, "utf8");
  const prepareNext = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"], current.root);
  assert.equal(prepareNext.status, 0, prepareNext.stderr);
  const expectedAuthorizationRoute = {
    state: "mission_authorization_ready",
    authority: "none",
    owner: "coulson",
    commandId: "mission.authorize",
    humanGate: true,
    pinRequired: true,
    missionId: created.projection.missionId,
    repositoryRoot: current.root,
  };
  assert.deepEqual(JSON.parse(prepareNext.stdout), expectedAuthorizationRoute);
  assert.equal(await readFile(nativeJournalPath, "utf8"), nativeJournalBeforePrepare);
  const prepareReplay = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"], current.root);
  assert.equal(prepareReplay.status, 0, prepareReplay.stderr);
  assert.equal(prepareReplay.stdout, prepareNext.stdout);
  const prepareHuman = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root], current.root);
  assert.equal(prepareHuman.status, 0, prepareHuman.stderr);
  assert.equal(prepareHuman.stdout, [
    "state: mission_authorization_ready",
    "authority: none",
    "owner: coulson",
    "commandId: mission.authorize",
    "humanGate: true",
    "pinRequired: true",
    `missionId: ${created.projection.missionId}`,
    `repositoryRoot: ${current.root}`,
    `Next action: shield mission authorize --mission-id '${created.projection.missionId}' --root '${current.root}'`,
    "",
  ].join("\n"));

  const journalBeforeReplay = await readFile(nativeJournalPath);
  const replay = run(args, current.root, { PATH: current.fakePath });
  assert.equal(replay.status, 0, replay.stderr);
  const replayed = JSON.parse(replay.stdout);
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.projection, created.projection);
  assert.equal(JSON.parse(await readFile(join(current.root, ".shield", "tmp", "gh-count"), "utf8")), 3);
  assert.deepEqual(await readFile(profileJournalPath(current.root, created.projection.missionId)), journalBeforeReplay);
  assert.deepEqual(outsideMissionRoot(await completeWorktreeSnapshot(current.root)), outsideMissionRoot(invokingBefore));

  const human = run(["mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root], current.root, { PATH: current.fakePath });
  assert.equal(human.status, 0, human.stderr);
  const humanLines = human.stdout.trimEnd().split("\n");
  assert.equal(humanLines[1], "Replay: exact");
  assert.deepEqual(humanLines.slice(2, 17), [
    "Acceptance criteria:",
    "  1. preserve the issue identity",
    "  2. remain authority-neutral",
    `Criteria digest: ${computeIssueAcceptanceCriteriaDigestV1(["preserve the issue identity", "remain authority-neutral"])}`,
    "Risk flags:",
    "  production: false",
    "  destructive: false",
    "  migration: false",
    "  credentialsOrSecurity: false",
    "  externalCommunication: false",
    "  merge: false",
    "  deploy: false",
    "  release: false",
    "  hillHighRisk: true",
    "WARNING: Effect-specific risk flags are unverified assumptions. Any production, destructive, migration, security, communication, merge, deploy, or release effect requires rescope before proceeding.",
  ]);
  assert.ok(human.stdout.includes(`shield mission prepare-next --mission-id '${created.projection.missionId}' --root '${current.root}'`));
  assert.equal(JSON.parse(await readFile(join(current.root, ".shield", "tmp", "gh-count"), "utf8")), 4);
  assert.deepEqual(outsideMissionRoot(await completeWorktreeSnapshot(current.root)), outsideMissionRoot(invokingBefore));
});

test("authorized issue-intake prepare-next returns the closed Hill planning packet without Fury or mutation", async () => {
  const current = await issueCliFixture();
  const begin = run([
    "mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root, "--json",
  ], current.root, { PATH: current.fakePath });
  assert.equal(begin.status, 0, begin.stderr);
  const created = JSON.parse(begin.stdout);
  const journalPath = profileJournalPath(current.root, created.projection.missionId);
  const journalBefore = await readFile(journalPath, "utf8");
  const journalEntries = journalBefore.trimEnd().split("\n").map(JSON.parse);
  const replay = replayProfileAwareMissionJournal(journalEntries);
  assert.equal(replay.state, "valid");
  const sourceBinding = journalEntries[0].payload.issueIntakeSourceBinding;
  const requirement = replay.value.requirements.find(({ requiredRoleId, evidenceKind }) => requiredRoleId === "coulson" && evidenceKind === "mission_authorization");
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: `evidence:${created.projection.missionId}:1`,
    requirementId: requirement.requirementId,
    missionId: created.projection.missionId,
    revisionId: replay.value.brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: current.coulson.binding.humanPrincipalId,
    bindingId: current.coulson.binding.bindingId,
    signingKeyRef: current.coulson.binding.signingKeyRef,
    sourceRef: `test:${created.projection.missionId}`,
    timestamp: { value: "2026-08-22T12:00:00Z", provenance: "hostTrusted" },
    journalSequence: 1,
  };
  const authorization = createProfileAwareGovernanceDecisionEntryV1({
    projection: replay.value,
    trustedBindings: [current.coulson.binding],
    evidence: {
      payload: evidencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), current.coulson.privateKey).toString("base64"),
    },
  });
  await writeFile(journalPath, `${journalBefore}${canonicalJson(authorization)}\n`);
  const journalAuthorized = await readFile(journalPath, "utf8");
  const prepared = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"], current.root, { PATH: current.fakePath });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.deepEqual(JSON.parse(prepared.stdout), {
    schemaVersion: 1,
    contractVersion: "mission.issue-intake-planning.v1",
    state: "planning_ready",
    authority: "none",
    owner: "hill",
    commandId: "hill.plan.freeze",
    humanGate: false,
    pinRequired: false,
    missionId: created.projection.missionId,
    repositoryId: "RanSolo/fixture",
    repositoryRoot: current.root,
    branch: sourceBinding.branch,
    headRevision: sourceBinding.headRevision,
    subjectId: replay.value.brief.subjectId,
    issueUrl: sourceBinding.issueUrl,
    issueRevisionId: sourceBinding.issueRevisionId,
    objective: "Intake issue",
    riskFlags: replay.value.brief.riskFlags,
    acceptanceCriteria: ["preserve the issue identity", "remain authority-neutral"],
    criteriaDigest: sourceBinding.criteriaDigest,
    instruction: "Freeze the smallest acceptance-driven implementation plan against this exact packet. The subsequent Fury and Wheels Up transition rail is unresolved; do not infer implementation scope, authority, runtime identity, or publication effects.",
  });
  assert.equal(await readFile(journalPath, "utf8"), journalAuthorized);
  assert.equal(prepared.stderr, "");
  assert.equal(JSON.parse(await readFile(join(current.root, ".shield", "tmp", "gh-count"), "utf8")), 4);
  const replayPrepared = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"], current.root, { PATH: current.fakePath });
  assert.equal(replayPrepared.status, 0, replayPrepared.stderr);
  assert.equal(replayPrepared.stdout, prepared.stdout);
  const human = run(["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root], current.root, { PATH: current.fakePath });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /No PIN is required\./u);
  assert.doesNotMatch(human.stdout, /fury-model|Next action/u);
  assert.equal(JSON.parse(await readFile(join(current.root, ".shield", "tmp", "gh-count"), "utf8")), 8);
});

test("profile-aware issue and brief forms are mutually exclusive before repository access", () => {
  const result = run(["mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--brief", "missing.json"], process.cwd());
  assert.equal(result.status, 2);
  assert.match(result.stderr, /mutually exclusive/u);
});

test("profile-aware issue begin fails closed on local configuration drift and host observation drift", async () => {
  const local = await issueCliFixture();
  const localGh = join(local.fakePath.split(":", 1)[0], "gh");
  await writeFile(localGh, "#!/bin/sh\ncount=$(cat \"$PWD/.shield/tmp/gh-count\")\nprintf '%s\\n' $((count + 1)) > \"$PWD/.shield/tmp/gh-count\"\nif [ \"$count\" -eq 0 ]; then printf '\\n' >> \"$PWD/.shield/config.json\"; fi\ncat \"$PWD/.shield/tmp/issue-response.json\"\n");
  await chmod(localGh, 0o755);
  const localResult = run(["mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", local.root, "--json"], local.root, { PATH: local.fakePath });
  assert.equal(localResult.status, 1, localResult.stderr);
  assert.match(localResult.stderr, /configuration drifted/u);
  await assert.rejects(readdir(join(local.root, ".shield", "journals")), { code: "ENOENT" });

  const host = await issueCliFixture();
  const responsePath = join(host.root, ".shield", "tmp", "issue-response.json");
  const driftPath = join(host.root, ".shield", "tmp", "issue-response-drift.json");
  const driftedResponse = JSON.parse(await readFile(responsePath, "utf8"));
  driftedResponse.data.repository.issue.title = "Host observation drift";
  await writeFile(driftPath, JSON.stringify(driftedResponse));
  const hostGh = join(host.fakePath.split(":", 1)[0], "gh");
  await writeFile(hostGh, "#!/bin/sh\ncount=$(cat \"$PWD/.shield/tmp/gh-count\")\nprintf '%s\\n' $((count + 1)) > \"$PWD/.shield/tmp/gh-count\"\nif [ \"$count\" -eq 0 ]; then cat \"$PWD/.shield/tmp/issue-response.json\"; cp \"$PWD/.shield/tmp/issue-response-drift.json\" \"$PWD/.shield/tmp/issue-response.json\"; else cat \"$PWD/.shield/tmp/issue-response.json\"; fi\n");
  await chmod(hostGh, 0o755);
  const hostResult = run(["mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", host.root, "--json"], host.root, { PATH: host.fakePath });
  assert.equal(hostResult.status, 1, hostResult.stderr);
  assert.match(hostResult.stderr, /issue_drifted/u);
  await assert.rejects(readdir(join(host.root, ".shield", "journals")), { code: "ENOENT" });
});

test("native prepare-next preserves the complete identity-wrapper diagnostic tuple and wrapper_failed reason", async () => {
  const current = await issueCliFixture();
  const begin = run([
    "mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root, "--json",
  ], current.root, { PATH: current.fakePath });
  assert.equal(begin.status, 0, begin.stderr);
  const created = JSON.parse(begin.stdout);
  const journalPath = profileJournalPath(current.root, created.projection.missionId);
  const journalBytes = await readFile(journalPath, "utf8");
  const entries = journalBytes.trimEnd().split("\n").map(JSON.parse);
  const replay = replayProfileAwareMissionJournal(entries);
  assert.equal(replay.state, "valid");
  const requirement = replay.value.requirements.find(({ requiredRoleId, evidenceKind }) => requiredRoleId === "coulson" && evidenceKind === "mission_authorization");
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: `evidence:${created.projection.missionId}:1`,
    requirementId: requirement.requirementId,
    missionId: created.projection.missionId,
    revisionId: replay.value.brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: current.coulson.binding.humanPrincipalId,
    bindingId: current.coulson.binding.bindingId,
    signingKeyRef: current.coulson.binding.signingKeyRef,
    sourceRef: `test:${created.projection.missionId}`,
    timestamp: { value: "2026-08-22T12:00:00Z", provenance: "hostTrusted" },
    journalSequence: 1,
  };
  const authorization = createProfileAwareGovernanceDecisionEntryV1({
    projection: replay.value,
    trustedBindings: [current.coulson.binding],
    evidence: {
      payload: evidencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), current.coulson.privateKey).toString("base64"),
    },
  });
  await writeFile(journalPath, `${journalBytes}${canonicalJson(authorization)}\n`);
  const binding = entries[0].payload.issueIntakeSourceBinding;
  const directObservation = {
    hostRepositoryId: binding.hostRepositoryId,
    repositoryNameWithOwner: binding.repositoryNameWithOwner,
    hostIssueId: binding.hostIssueId,
    issueNumber: binding.issueNumber,
    issueUrl: binding.issueUrl,
    issueRevisionId: binding.issueRevisionId,
    updatedAt: binding.updatedAt,
    acceptanceCriteria: { items: ["preserve the issue identity", "remain authority-neutral"], digest: binding.criteriaDigest },
  };
  const calls = [];
  const result = await runMissionCliCaptured(
    ["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"],
    {
      prepareSession: async () => { calls.push("prepareSession"); return { state: "blocked", missionId: created.projection.missionId, reasonCode: "protected_evidence_mismatch", errors: ["graph missing"] }; },
      preflightProtectedGraphAbsence: async () => { calls.push("preflight"); return { state: "absent" }; },
      issueObserver: async () => { calls.push("direct"); return { state: "observed", observation: directObservation }; },
      issueObservationWrapper: async () => { calls.push("wrapper"); return { state: "blocked", reason: "wrapper_failed" }; },
      continueLegacyReviewedTransition: async () => { calls.push("legacy"); throw new Error("legacy must not run"); },
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(calls, ["prepareSession", "preflight", "direct", "wrapper"]);
  const blocked = JSON.parse(result.stdout);
  assert.equal(blocked.code, "issue_observation_blocked");
  assert.deepEqual(blocked.errors, ["wrapper_failed"]);
  assert.deepEqual(blocked.diagnostic.events, [
    { stage: "direct_observation", callOrder: "direct:1", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "success" },
    { stage: "wrapper_observation", callOrder: "wrapper:2", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "wrapper_failed" },
    { stage: "error_mapping", callOrder: "error_mapping:3", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "wrapper_failure_after_direct_success" },
  ]);
  assert.equal(await readFile(journalPath, "utf8"), `${journalBytes}${canonicalJson(authorization)}\n`);
});

test("native prepare-next preserves the complete consistency-mismatch diagnostic tuple", async () => {
  const current = await issueCliFixture();
  const begin = run([
    "mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root, "--json",
  ], current.root, { PATH: current.fakePath });
  assert.equal(begin.status, 0, begin.stderr);
  const created = JSON.parse(begin.stdout);
  const journalPath = profileJournalPath(current.root, created.projection.missionId);
  const journalBytes = await readFile(journalPath, "utf8");
  const entries = journalBytes.trimEnd().split("\n").map(JSON.parse);
  const replay = replayProfileAwareMissionJournal(entries);
  assert.equal(replay.state, "valid");
  const requirement = replay.value.requirements.find(({ requiredRoleId, evidenceKind }) => requiredRoleId === "coulson" && evidenceKind === "mission_authorization");
  const evidencePayload = {
    schemaVersion: 1,
    evidenceId: `evidence:${created.projection.missionId}:1`,
    requirementId: requirement.requirementId,
    missionId: created.projection.missionId,
    revisionId: replay.value.brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: current.coulson.binding.humanPrincipalId,
    bindingId: current.coulson.binding.bindingId,
    signingKeyRef: current.coulson.binding.signingKeyRef,
    sourceRef: `test:${created.projection.missionId}`,
    timestamp: { value: "2026-08-22T12:00:00Z", provenance: "hostTrusted" },
    journalSequence: 1,
  };
  const authorization = createProfileAwareGovernanceDecisionEntryV1({
    projection: replay.value,
    trustedBindings: [current.coulson.binding],
    evidence: {
      payload: evidencePayload,
      signatureBase64: sign(null, Buffer.from(canonicalJson(evidencePayload)), current.coulson.privateKey).toString("base64"),
    },
  });
  await writeFile(journalPath, `${journalBytes}${canonicalJson(authorization)}\n`);
  const binding = entries[0].payload.issueIntakeSourceBinding;
  const directObservation = {
    hostRepositoryId: binding.hostRepositoryId,
    repositoryNameWithOwner: binding.repositoryNameWithOwner,
    hostIssueId: binding.hostIssueId,
    issueNumber: binding.issueNumber,
    issueUrl: binding.issueUrl,
    issueRevisionId: binding.issueRevisionId,
    updatedAt: binding.updatedAt,
    acceptanceCriteria: { items: ["preserve the issue identity", "remain authority-neutral"], digest: binding.criteriaDigest },
  };
  const calls = [];
  const result = await runMissionCliCaptured(
    ["mission", "prepare-next", "--mission-id", created.projection.missionId, "--root", current.root, "--json"],
    {
      prepareSession: async () => { calls.push("prepareSession"); return { state: "blocked", missionId: created.projection.missionId, reasonCode: "protected_evidence_mismatch", errors: ["graph missing"] }; },
      preflightProtectedGraphAbsence: async () => { calls.push("preflight"); return { state: "absent" }; },
      issueObserver: async () => { calls.push("direct"); return { state: "observed", observation: directObservation }; },
      issueObservationWrapper: async () => { calls.push("wrapper"); return { state: "observed", observation: { ...directObservation, issueRevisionId: "sha256:consistency-drift" } }; },
      continueLegacyReviewedTransition: async () => { calls.push("legacy"); throw new Error("legacy must not run"); },
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(calls, ["prepareSession", "preflight", "direct", "wrapper"]);
  const blocked = JSON.parse(result.stdout);
  assert.equal(blocked.code, "issue_observation_drifted");
  assert.deepEqual(blocked.errors, ["Bound GitHub issue identity, revision, updated time, or acceptance-criteria digest changed."]);
  assert.deepEqual(blocked.diagnostic.events, [
    { stage: "direct_observation", callOrder: "direct:1", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "success" },
    { stage: "wrapper_observation", callOrder: "wrapper:2", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "success" },
    { stage: "consistency_observation", callOrder: "consistency:3", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "consistency_failed" },
    { stage: "error_mapping", callOrder: "error_mapping:4", adapter: "github", executable: "repository_adapter", cwd: "approved_root", timeout: "bounded", outcome: "consistency_failed" },
  ]);
  assert.equal(await readFile(journalPath, "utf8"), `${journalBytes}${canonicalJson(authorization)}\n`);
});

test("profile-aware issue begin preserves an observed direct network failure without creating a journal", async () => {
  const current = await issueCliFixture();
  const fakeGh = join(current.fakePath.split(":", 1)[0], "gh");
  await writeFile(fakeGh, "#!/bin/sh\nprintf '%s\\n' 'network failure' >&2\nexit 1\n");
  await chmod(fakeGh, 0o755);
  const result = run([
    "mission", "begin", "--profile-aware", "--issue", "github:RanSolo/fixture/issues/7", "--profile", "standard", "--root", current.root, "--json",
  ], current.root, { PATH: current.fakePath });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /issue_observation_blocked: network_failed/u);
  await assert.rejects(readdir(join(current.root, ".shield", "journals")), { code: "ENOENT" });
});
