import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { harvestTools } from "../scripts/operations/tool-harvest.mjs";
import { stableJson } from "../scripts/operations/common.mjs";

test("harvest resolves portable paths and keeps unknown return explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-harvest-"));
  await writeFile(join(root, "helper.mjs"), "export const answer = 42;\n");
  const registryPath = join(root, "registry.json");
  await writeFile(
    registryPath,
    stableJson({
      schemaVersion: 1,
      tools: [
        {
          name: "helper",
          path: "./helper.mjs",
          trigger: "Repeated check",
          purpose: "Make the check deterministic",
          inputs: ["state"],
          outputs: ["report"],
          minutesInvested: null,
          minutesAvoidedPerUse: null,
          reuseCount: 3,
          errorsPrevented: ["stale state"],
          evidenceImproved: ["exact hash"],
          recommendation: "promotion-candidate",
        },
      ],
    }),
  );
  const report = await harvestTools({ registryPath });
  assert.equal(report.authority, "none");
  assert.equal(report.tools[0].artifact.path, "./helper.mjs");
  assert.equal(report.tools[0].artifact.bytes, 26);
  assert.equal(report.tools[0].observedMinutesAvoided, null);
  assert.equal(report.totals.netObservedMinutes, null);
});

test("harvest calculates only observed numeric return", async () => {
  const root = await mkdtemp(join(tmpdir(), "shield-tool-return-"));
  const toolPath = join(root, "helper.mjs");
  await writeFile(toolPath, "export {};\n");
  const registryPath = join(root, "registry.json");
  await writeFile(
    registryPath,
    stableJson({
      schemaVersion: 1,
      tools: [
        {
          name: "helper",
          path: toolPath,
          trigger: "Repeated check",
          purpose: "Automate it",
          inputs: [],
          outputs: [],
          minutesInvested: 10,
          minutesAvoidedPerUse: 4,
          reuseCount: 3,
          errorsPrevented: [],
          evidenceImproved: [],
          recommendation: "retain-local",
        },
      ],
    }),
  );
  const report = await harvestTools({ registryPath });
  assert.equal(report.tools[0].artifact.path, toolPath);
  assert.equal(report.totals.observedMinutesAvoided, 12);
  assert.equal(report.totals.netObservedMinutes, 2);
});
