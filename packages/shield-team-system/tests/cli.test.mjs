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

test("init creates only the deterministic SHIELD files and repeated init is a no-op", async () => {
  const root = await fixture();
  const first = run(initArgs, root);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual((await readdir(root)).sort(), [".git", ".shield", "existing.txt", "package.json"]);
  assert.deepEqual((await readdir(join(root, ".shield"))).sort(), [".gitignore", "config.json"]);
  assert.equal(await readFile(join(root, "existing.txt"), "utf8"), "preserve me\n");
  assert.equal(await readFile(join(root, ".shield", ".gitignore"), "utf8"), "/journals/\n/reports/\n/tmp/\n");
  const before = await readFile(join(root, ".shield", "config.json"), "utf8");

  const second = run(initArgs, root);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /no files changed/i);
  assert.equal(await readFile(join(root, ".shield", "config.json"), "utf8"), before);
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

  const unsupported = run(["mission", "begin"], root);
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /unsupported command/i);
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
