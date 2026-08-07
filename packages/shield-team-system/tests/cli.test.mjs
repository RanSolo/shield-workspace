import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, mkdir, open, readFile, readdir, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");
const { migrateConfigFile } = await import("../dist/cli.mjs");
const { createShieldConfig, formatShieldConfig } = await import("../dist/config.mjs");
const initArgs = [
  "init",
  "--repository-id", "RanSolo/fixture",
  "--coulson-binding-ref", "github:user:coulson",
  "--fitz-binding-ref", "github:user:fitz",
];

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

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
  assert.equal(await readFile(state.path, "utf8"), state.legacyBytes);
  assert.equal((await stat(state.path)).mode & 0o7777, 0o640);
  assert.equal((await readdir(join(state.root, ".shield"))).some((name) => name.includes("migrate")), false);
  await migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
    nonce: () => "fedcba9876543210",
  });
  assert.equal(await readFile(state.path, "utf8"), formatShieldConfig(state.candidate));
});

test("pre-rename sync and identity substitution preserve exact legacy state", async () => {
  for (const fault of ["mode-sync", "temp-identity", "directory-sync"]) {
    const state = await migrationFixture();
    let tempSyncs = 0;
    let tempLstats = 0;
    let directorySyncs = 0;
    await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
      nonce: () => "0123456789abcdef",
      operations: {
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path.includes(".config.json.migrate-") && path.endsWith(".tmp") && fault === "mode-sync") {
            return migrationHandle(handle, {
              sync: async () => {
                tempSyncs += 1;
                if (tempSyncs === 2) throw new Error("mode sync fault");
                await handle.sync();
              },
            });
          }
          if (path === join(state.root, ".shield") && fault === "directory-sync") {
            return migrationHandle(handle, {
              sync: async () => {
                directorySyncs += 1;
                if (directorySyncs === 1) throw new Error("directory sync fault");
                await handle.sync();
              },
            });
          }
          return handle;
        },
        async lstat(path) {
          const stats = await lstat(path);
          if (path.includes(".config.json.migrate-") && path.endsWith(".tmp") && fault === "temp-identity") {
            tempLstats += 1;
            if (tempLstats === 1) {
              return new Proxy(stats, { get: (target, key) => key === "ino" ? target.ino + 1 : Reflect.get(target, key, target) });
            }
          }
          return stats;
        },
      },
    }), /failed before rename/iu, fault);
    assert.equal(await readFile(state.path, "utf8"), state.legacyBytes, fault);
    assert.equal((await stat(state.path)).mode & 0o7777, 0o640, fault);
    assert.equal((await readdir(join(state.root, ".shield"))).some((name) => name.includes("migrate")), false, fault);
  }
});

test("ambiguous rename and installed bound-readback failures require recovery", async () => {
  for (const fault of ["ambiguous-rename", "installed-identity", "bound-readback", "installed-close", "post-rename-directory-sync"]) {
    const state = await migrationFixture();
    let configOpens = 0;
    let directorySyncs = 0;
    await assert.rejects(migrateConfigFile(state.path, state.legacyBytes, state.legacy, state.candidate, {
      nonce: () => "0123456789abcdef",
      operations: {
        async rename(source, destination) {
          await rename(source, destination);
          if (fault === "ambiguous-rename") throw new Error("ambiguous rename fault");
        },
        async open(path, flags, mode) {
          const handle = await open(path, flags, mode);
          if (path === state.path) {
            configOpens += 1;
            if (configOpens === 2 && fault === "installed-identity") {
              return migrationHandle(handle, {
                stat: async () => {
                  const stats = await handle.stat();
                  return new Proxy(stats, { get: (target, key) => key === "ino" ? target.ino + 1 : Reflect.get(target, key, target) });
                },
              });
            }
            if (configOpens === 2 && fault === "bound-readback") {
              return migrationHandle(handle, {
                read: async (buffer, offset, length, position) => {
                  const result = await handle.read(buffer, offset, length, position);
                  if (result.bytesRead > 0) buffer[offset] ^= 1;
                  return result;
                },
              });
            }
            if (configOpens === 2 && fault === "installed-close") {
              return migrationHandle(handle, {
                close: async () => { await handle.close(); throw new Error("close fault"); },
              });
            }
          }
          if (path === join(state.root, ".shield") && fault === "post-rename-directory-sync") {
            return migrationHandle(handle, {
              sync: async () => {
                directorySyncs += 1;
                if (directorySyncs === 2) throw new Error("post-rename directory sync fault");
                await handle.sync();
              },
            });
          }
          return handle;
        },
      },
    }), /recovery_required/iu, fault);
    assert.equal(await readFile(state.path, "utf8"), formatShieldConfig(state.candidate), fault);
  }
});

test("cleanup close and unlink uncertainty require recovery without changing legacy bytes", async () => {
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
    }), /recovery_required/iu, fault);
    assert.equal(await readFile(state.path, "utf8"), state.legacyBytes, fault);
    assert.equal((await stat(state.path)).mode & 0o7777, 0o640, fault);
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
