import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeMayExecutableIdentityV1,
  computeMayPlannedOperationsDigestV1,
  computeMayPlannedToolEffectKeyV1,
  computeMayRegularFileIdentityV1,
  MAY_TOOL_MAPPINGS_V1,
  normalizeMayPlannedToolOperationsV1,
} from "../dist/may-tool-effect-v1.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function operations() {
  return [
    {
      toolName: "writeFile",
      path: "src/output.txt",
      content: "after\n",
      precondition: {
        kind: "present",
        regularFileIdentity: "1:2:33188:7:1000:1001",
        sha256: digest("before\n"),
      },
    },
    {
      toolName: "runValidation",
      commandId: "focused",
      executable: "/usr/bin/node",
      args: ["--test", "tests/focused.test.mjs"],
      timeoutMs: 2_000,
      executableIdentity: "1:3:33261:100:2000",
    },
  ];
}

test("normalizes and deeply freezes the exact write-then-validation sequence", () => {
  const normalized = normalizeMayPlannedToolOperationsV1(operations());
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized[0]), true);
  assert.equal(Object.isFrozen(normalized[0].precondition), true);
  assert.equal(Object.isFrozen(normalized[1]), true);
  assert.equal(Object.isFrozen(normalized[1].args), true);
  assert.deepEqual(MAY_TOOL_MAPPINGS_V1.writeFile, {
    actionId: "repository.write_file", effectClass: "behavioral_implementation", capability: "filesystem_write",
  });
  assert.deepEqual(MAY_TOOL_MAPPINGS_V1.runValidation, {
    actionId: "repository.run_validation", effectClass: "verification", capability: "process_execute",
  });
});

test("derives byte-compatible existing May write and validation effect keys", () => {
  const normalized = normalizeMayPlannedToolOperationsV1(operations());
  const expectedWrite = {
    contentSha256: digest("after\n"), expectedSha256: digest("before\n"), path: "src/output.txt", toolName: "writeFile",
  };
  const expectedValidation = {
    args: ["--test", "tests/focused.test.mjs"], commandId: "focused", executable: "/usr/bin/node",
    executableIdentity: "1:3:33261:100:2000", timeoutMs: 2_000, toolName: "runValidation",
  };
  assert.equal(computeMayPlannedToolEffectKeyV1(normalized[0]), `effect:may:sha256:${digest(JSON.stringify(expectedWrite))}`);
  assert.equal(computeMayPlannedToolEffectKeyV1(normalized[1]), `effect:may:sha256:${digest(JSON.stringify(expectedValidation))}`);
  assert.match(computeMayPlannedOperationsDigestV1(normalized), /^sha256:[A-Za-z0-9_-]{43}$/u);
});

test("projects executable and regular-file identities with existing field order", () => {
  const info = { dev: 1, ino: 2, mode: 33_188, size: 7, mtimeMs: 1000.5, ctimeMs: 1001.5 };
  assert.equal(computeMayExecutableIdentityV1(info), "1:2:33188:7:1000.5");
  assert.equal(computeMayRegularFileIdentityV1(info), "1:2:33188:7:1000.5:1001.5");
});

test("rejects missing, extra, inherited, accessor-backed, sparse, duplicate, and reordered descriptors", () => {
  const missing = operations();
  delete missing[0].content;
  assert.throws(() => normalizeMayPlannedToolOperationsV1(missing), /may_planned_operations_malformed/u);

  const extra = operations();
  extra[0].extra = true;
  assert.throws(() => normalizeMayPlannedToolOperationsV1(extra), /may_planned_operations_malformed/u);

  const inherited = operations();
  inherited[0] = Object.assign(Object.create({ extra: true }), inherited[0]);
  assert.throws(() => normalizeMayPlannedToolOperationsV1(inherited), /may_planned_operations_malformed/u);

  const accessor = operations();
  Object.defineProperty(accessor[0], "content", { enumerable: true, get: () => "after\n" });
  assert.throws(() => normalizeMayPlannedToolOperationsV1(accessor), /may_planned_operations_malformed/u);

  const sparse = operations();
  delete sparse[0];
  assert.throws(() => normalizeMayPlannedToolOperationsV1(sparse), /may_planned_operations_malformed/u);

  assert.throws(() => normalizeMayPlannedToolOperationsV1([operations()[0], operations()[0]]), /may_planned_operations_malformed/u);
  assert.throws(() => normalizeMayPlannedToolOperationsV1(operations().reverse()), /may_planned_operations_malformed/u);

  let accessed = false;
  const hostileOperation = {};
  Object.defineProperty(hostileOperation, "toolName", {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error("executed");
    },
  });
  assert.throws(() => computeMayPlannedToolEffectKeyV1(hostileOperation), /may_planned_operations_malformed/u);
  assert.equal(accessed, false);
});

test("rejects malformed paths, preconditions, commands, and sequence shape", () => {
  for (const path of ["", "/absolute", "../escape", "src/../escape", "src\\file", "src//file", "./src/file"]) {
    const value = operations();
    value[0].path = path;
    assert.throws(() => normalizeMayPlannedToolOperationsV1(value), /may_planned_operations_malformed/u);
  }
  const badDigest = operations();
  badDigest[0].precondition.sha256 = "A".repeat(64);
  assert.throws(() => normalizeMayPlannedToolOperationsV1(badDigest), /may_planned_operations_malformed/u);

  const badExecutable = operations();
  badExecutable[1].executable = "node";
  assert.throws(() => normalizeMayPlannedToolOperationsV1(badExecutable), /may_planned_operations_malformed/u);

  assert.throws(() => normalizeMayPlannedToolOperationsV1([operations()[0]]), /may_planned_operations_malformed/u);
});
