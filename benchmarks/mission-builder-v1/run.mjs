import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { missionBuilderBenchmarkV1 } from "../../packages/shield-team-system/dist/mission-builder-v1.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await readFile(resolve(directory, "fixture.json"), "utf8"));

assert.equal(fixture.schemaVersion, 1);
assert.equal(fixture.contractVersion, "mission.builder.benchmark.v1");
const result = missionBuilderBenchmarkV1(fixture.before, fixture.after);
assert.equal(result.state, "valid");
assert.deepEqual(result.deltas, fixture.expectedDeltas);

process.stdout.write(`${JSON.stringify({
  contractVersion: fixture.contractVersion,
  state: result.state,
  deltas: result.deltas,
})}\n`);
