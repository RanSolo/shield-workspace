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

test("operations CLI deterministically rejects bounded flight-status argument failures", async (t) => {
  const digest = "a".repeat(64);
  const predecessorDigest = "b".repeat(64);
  const base = [
    "flight", "status",
    "--plan", "/tmp/plan.json",
    "--expected-plan-sha256", digest,
    "--state", "/tmp/state.json",
    "--expected-state-sha256", digest,
  ];
  const predecessor = [
    "--predecessor-state", "/tmp/predecessor.json",
    "--expected-predecessor-sha256", predecessorDigest,
  ];
  const cases = [
    { name: "non-integer sequence", args: [...base, "--expected-state-sequence", "1.5"], pattern: /non-negative integer/u },
    { name: "negative sequence", args: [...base, "--expected-state-sequence", "-1"], pattern: /non-negative integer/u },
    { name: "unsafe sequence", args: [...base, "--expected-state-sequence", "9007199254740992"], pattern: /non-negative safe integer/u },
    { name: "malformed plan digest", args: [
      ...base.slice(0, 4), "--expected-plan-sha256", "not-a-digest", ...base.slice(6), "--expected-state-sequence", "0",
    ], pattern: /--expected-plan-sha256 must be a raw lowercase SHA-256 digest/u },
    { name: "malformed state digest", args: [
      ...base.slice(0, 8), "--expected-state-sha256", "A".repeat(64), "--expected-state-sequence", "0",
    ], pattern: /--expected-state-sha256 must be a raw lowercase SHA-256 digest/u },
    { name: "malformed predecessor digest", args: [
      ...base, "--expected-state-sequence", "1", "--predecessor-state", "/tmp/predecessor.json",
      "--expected-predecessor-sha256", "short",
    ], pattern: /--expected-predecessor-sha256 must be a raw lowercase SHA-256 digest/u },
    { name: "predecessor path only", args: [
      ...base, "--expected-state-sequence", "1", "--predecessor-state", "/tmp/predecessor.json",
    ], pattern: /Both predecessor options must be supplied together/u },
    { name: "predecessor digest only", args: [
      ...base, "--expected-state-sequence", "1", "--expected-predecessor-sha256", predecessorDigest,
    ], pattern: /Both predecessor options must be supplied together/u },
    { name: "predecessor flags at genesis", args: [
      ...base, "--expected-state-sequence", "0", ...predecessor,
    ], pattern: /Genesis sequence 0 must not supply predecessor options/u },
    { name: "missing predecessor flags after genesis", args: [
      ...base, "--expected-state-sequence", "1",
    ], pattern: /Non-genesis sequence requires both predecessor options/u },
    { name: "extra positional argument", args: [
      ...base, "--expected-state-sequence", "0", "extra",
    ], pattern: /Unexpected positional argument: extra/u },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const first = spawnSync(process.execPath, [cli, ...fixture.args], { encoding: "utf8" });
      const second = spawnSync(process.execPath, [cli, ...fixture.args], { encoding: "utf8" });
      assert.equal(first.status, 2, first.stderr);
      assert.equal(second.status, 2, second.stderr);
      assert.equal(first.stdout, "");
      assert.equal(second.stdout, "");
      assert.equal(second.stderr, first.stderr);
      assert.match(first.stderr, fixture.pattern);
    });
  }
});

test("operations CLI fails closed on unknown commands", () => {
  const result = spawnSync(process.execPath, [cli, "mission", "authorize"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsupported command/u);
});
