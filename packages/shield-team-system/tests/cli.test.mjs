import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.mjs");
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
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.repositoryTrustProfileId, "signed_human_gates");

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
  assert.equal(config.schemaVersion, 2);
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
    [["init", "--repository-id", "RanSolo/fixture", "--repository-trust-profile", "coulson_only_platform_review", "--coulson-binding-ref", "placeholder"], /opaque credential-free identifier/iu],
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
  const { repositoryTrustProfileId: _profileId, ...common } = generated;
  const legacy = { ...common, schemaVersion: 1 };

  const equivalent = await fixture();
  await mkdir(join(equivalent, ".shield"));
  const exactBytes = `${JSON.stringify(legacy)}\n`;
  await writeFile(join(equivalent, ".shield", "config.json"), exactBytes);
  const noOp = run(initArgs, equivalent);
  assert.equal(noOp.status, 0, noOp.stderr);
  assert.match(noOp.stdout, /schema-1.*no files changed/iu);
  assert.equal(await readFile(join(equivalent, ".shield", "config.json"), "utf8"), exactBytes);
  assert.deepEqual(await readdir(join(equivalent, ".shield")), ["config.json"]);

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
  assert.match(migration.stderr, /unsupported migration/iu);
  assert.equal(await readFile(join(equivalent, ".shield", "config.json"), "utf8"), before);
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
  assert.equal(report.reportVersion, 1);
  assert.equal(report.checks[0].id, "repository-root");
  assert.equal(report.checks.at(-1).id, "paths");

  const coulsonOnlyRoot = await fixture();
  assert.equal(run([
    "init", "--repository-id", "RanSolo/fixture",
    "--repository-trust-profile", "coulson_only_platform_review",
    "--coulson-binding-ref", "ed25519:sha256:coulson",
  ], coulsonOnlyRoot).status, 0);
  const coulsonOnly = run(["doctor", "--json"], coulsonOnlyRoot);
  assert.equal(coulsonOnly.status, 0, coulsonOnly.stderr);
  assert.match(
    JSON.parse(coulsonOnly.stdout).checks.find(({ id }) => id === "bindings").message,
    /Fitz is GitHub-enforced external review.*neither is admitted as SHIELD evidence/iu,
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
  assert.match(missingReport.checks.find(({ id }) => id === "bindings").message, /missing field: repositoryTrustProfileId/iu);
  assert.doesNotMatch(missingReport.checks.find(({ id }) => id === "config-schema").message, /repositoryId|schemaVersion is missing/iu);

  const unknown = { ...config, repositoryTrustProfileId: "signed_human_gates", unrelated: true };
  await writeFile(path, `${JSON.stringify(unknown)}\n`);
  const unknownReport = JSON.parse(run(["doctor", "--json"], root).stdout);
  assert.match(unknownReport.checks.find(({ id }) => id === "config-schema").message, /unknown field: unrelated/iu);
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
  assert.match(
    malformedReport.checks.find(({ id }) => id === "config-schema").message,
    /malformed json/i,
  );

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
