import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const npmCache = join(tmpdir(), "shield-v0.3-2-npm-cache");

test("exports only the documented public package specifiers", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports), [
    ".",
    "./mission",
    "./journal",
    "./modes",
    "./workspace",
    "./config",
    "./supervision",
  ]);
  for (const target of Object.values(manifest.exports)) {
    assert.deepEqual(Object.keys(target), ["types", "import"]);
  }
});

test("loads every supported runtime specifier", async () => {
  const root = await import("@shield/team-system");
  const mission = await import("@shield/team-system/mission");
  const journal = await import("@shield/team-system/journal");
  const modes = await import("@shield/team-system/modes");
  const workspace = await import("@shield/team-system/workspace");
  const config = await import("@shield/team-system/config");
  const supervision = await import("@shield/team-system/supervision");

  assert.equal(root.MISSION_SCHEMA_VERSION, 2);
  assert.equal(mission.classifyMissionRisk, root.classifyMissionRisk);
  assert.equal(journal.JOURNAL_SCHEMA_VERSION, 1);
  assert.equal(modes.MODE_MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(typeof workspace.validateMissionWorkspaceInput, "function");
  assert.equal(config.CONFIG_SCHEMA_VERSION, 1);
  assert.equal(root.validateShieldConfig, config.validateShieldConfig);
  assert.equal(supervision.SUPERVISED_JOURNAL_SCHEMA_VERSION, 2);
  assert.equal(typeof supervision.createSupervisedMissionBrief, "function");
});

test("blocks undocumented deep package imports", async () => {
  await assert.rejects(
    import("@shield/team-system/contracts/mission-policy.mjs"),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
});

test("packs declarations and type-checks an external strict TypeScript consumer", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "shield-package-consumer-"));
  execFileSync("git", ["init", "--quiet"], { cwd: fixture });
  await writeFile(join(fixture, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  const packOutput = JSON.parse(execFileSync(
    "npm",
    ["pack", packageRoot, "--json", "--pack-destination", fixture, "--cache", npmCache],
    { encoding: "utf8" },
  ));
  const packed = packOutput[0];
  const packedPaths = new Set(packed.files.map(({ path }) => path));
  for (const path of [
    "public/index.mjs",
    "public/index.d.mts",
    "public/mission.d.mts",
    "public/journal.d.mts",
    "public/modes.d.mts",
    "public/workspace.d.mts",
    "dist/config.mjs",
    "dist/config.d.mts",
    "dist/mission-v2.mjs",
    "dist/mission-v2.d.mts",
    "dist/cli.mjs",
    "INSTALLATION.md",
    "PUBLIC_API.md",
    "SUPERVISED_MISSION.md",
  ]) {
    assert.ok(packedPaths.has(path), `packed artifact is missing ${path}`);
  }

  const tarball = join(fixture, packed.filename);
  execFileSync(
    "npm",
    ["install", "--save-dev", "--save-exact", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--cache", npmCache],
    { cwd: fixture, stdio: "pipe" },
  );
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
    },
    include: ["consumer.mts"],
  }));
  await writeFile(join(fixture, "consumer.mts"), `
    import { MISSION_SCHEMA_VERSION, type MissionDecisionEvent, type MissionState } from "@shield/team-system";
    import { classifyMissionRisk, type RiskFlags } from "@shield/team-system/mission";
    import { JOURNAL_SCHEMA_VERSION, type JournalEntry } from "@shield/team-system/journal";
    import { MODE_MANIFEST_SCHEMA_VERSION, type ModeManifest } from "@shield/team-system/modes";
    import { validateMissionWorkspaceInput, type MissionWorkspaceInput } from "@shield/team-system/workspace";
    import { CONFIG_SCHEMA_VERSION, type ShieldConfig } from "@shield/team-system/config";
    import { SUPERVISED_JOURNAL_SCHEMA_VERSION, createSupervisedMissionBrief, type SupervisedMissionBrief } from "@shield/team-system/supervision";

    const schema: 2 = MISSION_SCHEMA_VERSION;
    const state: MissionState = "approved";
    const flags: RiskFlags = {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    };
    const risk = classifyMissionRisk(flags);
    const journalSchema: 1 = JOURNAL_SCHEMA_VERSION;
    const modeSchema: 1 = MODE_MANIFEST_SCHEMA_VERSION;
    const entry = null as unknown as JournalEntry;
    const manifest = null as unknown as ModeManifest;
    const input = null as unknown as MissionWorkspaceInput;
    const configSchema: 1 = CONFIG_SCHEMA_VERSION;
    const config = null as unknown as ShieldConfig;
    const supervisedSchema: 2 = SUPERVISED_JOURNAL_SCHEMA_VERSION;
    const supervisedBrief = null as unknown as SupervisedMissionBrief;
    const createBrief = createSupervisedMissionBrief;
    validateMissionWorkspaceInput(input);
    const validResume: MissionDecisionEvent = {
      schemaVersion: 2, eventId: "event-1", missionId: "mission-1", sequence: 1,
      type: "mission.decision", actor: "coulson", previousState: "paused",
      resultingState: "approved", timestamp: { value: "2026-07-18T18:00:00Z", provenance: "humanRecorded" },
      decision: "resume", resumeState: "approved",
    };
    // @ts-expect-error A resume decision requires an explicit resumeState.
    const missingResumeState: MissionDecisionEvent = { ...validResume, resumeState: undefined };
    // @ts-expect-error A non-resume decision cannot carry resumeState.
    const unexpectedResumeState: MissionDecisionEvent = { ...validResume, decision: "approve" };
    void [schema, state, risk, journalSchema, modeSchema, entry, manifest, configSchema, config, supervisedSchema, supervisedBrief, createBrief, validResume, missingResumeState, unexpectedResumeState];
  `);

  const tsc = join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tsc, "--project", join(fixture, "tsconfig.json")], {
    cwd: fixture,
    stdio: "pipe",
  });

  const bin = join(fixture, "node_modules", ".bin", "shield");
  execFileSync(bin, [
    "init",
    "--repository-id", "fixture/typescript-consumer",
    "--coulson-binding-ref", "github:user:coulson",
    "--fitz-binding-ref", "github:user:fitz",
  ], { cwd: fixture, stdio: "pipe" });
  const doctor = JSON.parse(execFileSync(bin, ["doctor", "--json"], {
    cwd: fixture,
    encoding: "utf8",
  }));
  assert.equal(doctor.ok, true);

  const javascriptFixture = await mkdtemp(join(tmpdir(), "shield-js-consumer-"));
  execFileSync("git", ["init", "--quiet"], { cwd: javascriptFixture });
  await writeFile(join(javascriptFixture, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  execFileSync(
    "npm",
    ["install", "--save-dev", "--save-exact", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--cache", npmCache],
    { cwd: javascriptFixture, stdio: "pipe" },
  );
  await writeFile(join(javascriptFixture, "consumer.mjs"), `
    import { CONFIG_SCHEMA_VERSION, createShieldConfig } from "@shield/team-system/config";
    if (CONFIG_SCHEMA_VERSION !== 1) throw new Error("unexpected config schema");
    const config = createShieldConfig({
      repositoryId: "fixture/javascript-consumer",
      coulsonBindingRef: "github:user:coulson",
      fitzBindingRef: "github:user:fitz",
    });
    if (config.adapterId !== "github") throw new Error("unexpected adapter");
  `);
  execFileSync(process.execPath, [join(javascriptFixture, "consumer.mjs")], {
    cwd: javascriptFixture,
    stdio: "pipe",
  });
});
