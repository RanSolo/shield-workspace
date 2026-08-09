import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "scripts", "operations", "ops-cli.mjs");

test("operations CLI describes the non-authoritative evidence surface", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shield-ops evidence run/u);
  assert.match(result.stdout, /--expected-spec-sha256/u);
  assert.match(result.stdout, /--manifest/u);
  assert.match(result.stdout, /shield-ops flight status/u);
  assert.match(result.stdout, /--expected-plan-sha256/u);
  assert.match(result.stdout, /stdout-only/u);
  assert.match(result.stdout, /advisory structural consistency only/u);
  assert.match(result.stdout, /effectContainment:uncertain/u);
  assert.match(result.stdout, /gateEligible:false/u);
  assert.match(result.stdout, /pre-created/u);
});

test("operations CLI routes flight status help through the real command", () => {
  const result = spawnSync(process.execPath, [cli, "flight", "status", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shield-ops flight status/u);
  assert.match(result.stdout, /--expected-predecessor-sha256/u);
});

test("operations CLI fails closed on every flight argument class before projection", () => {
  for (const args of [
    ["flight", "status"],
    ["flight", "status", "plan.json"],
    ["flight", "status", "--unknown", "value"],
    ["flight", "status", "--plan", ""],
    ["flight", "status", "--plan", "a", "--plan", "b"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /SHIELD flight status/u);
  }
});

test("operations CLI fails closed on unknown commands", () => {
  const result = spawnSync(process.execPath, [cli, "mission", "authorize"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsupported command/u);
});
