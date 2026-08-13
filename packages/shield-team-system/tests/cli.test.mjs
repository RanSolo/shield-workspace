import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, mkdir, open, readFile, readdir, realpath, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");
const { migrateConfigFile } = await import("../dist/cli.mjs");
const { createShieldConfig, formatShieldConfig } = await import("../dist/config.mjs");
const { missionUsage, validateAuthorizeDaisyCoordinationInput } = await import("../dist/mission-cli.mjs");
const { computeEd25519SigningKeyRef } = await import("../dist/mission-v2.mjs");
const { createProfileAwareMissionBrief, MISSION_130_JOURNAL_DIGEST } = await import("../dist/profile-aware-mission-v1.mjs");
const initArgs = [
  "init",
  "--repository-id", "RanSolo/fixture",
  "--coulson-binding-ref", "github:user:coulson",
  "--fitz-binding-ref", "github:user:fitz",
];

function run(args, cwd, env = {}, input) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env }, input });
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

function profileJournalPath(root, missionId) {
  return join(root, ".shield", "journals", `${Buffer.from(missionId).toString("base64url")}.jsonl`);
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

  const replay = run([
    "worktree", "prepare", "--source-root", await realpath(sourceRoot),
    "--root", await realpath(destinationRoot),
  ], destinationRoot);
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /^ALREADY PREPARED\n/u);
  assert.match(replay.stdout, /Repository: RanSolo\/fixture/u);
  assert.doesNotMatch(replay.stdout + replay.stderr, /PIN|passcode/iu);

  const doctor = run(["doctor", "--root", await realpath(destinationRoot), "--json"], destinationRoot);
  assert.equal(doctor.status, 0, doctor.stderr);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.worktreeState.classification, "prepared_worktree");
  assert.equal(report.worktreeState.receiptDigest, receipt.receipt.receiptDigest);
});
