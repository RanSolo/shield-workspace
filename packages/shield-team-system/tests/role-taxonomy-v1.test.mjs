import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as roles from "../dist/role-taxonomy-v1.mjs";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/role-taxonomy-v1.mts");

const dispatchableRoles = ["hill", "daisy", "fury", "may", "mack", "oracle"];
const humanGateRoles = ["coulson", "fitz", "simmons"];

const expectedCanonical = [...dispatchableRoles, ...humanGateRoles];
const expectedEnabledV03 = ["hill", "daisy", "fury", "may"];


test("role taxonomy exports are closed, immutable, and dependency-free", async () => {
  assert.deepEqual(roles.CANONICAL_ROLE_IDS, expectedCanonical);
  assert.deepEqual(roles.DISPATCHABLE_ROLE_IDS, dispatchableRoles);
  assert.deepEqual(roles.HUMAN_GATE_ROLE_IDS, humanGateRoles);
  assert.deepEqual(roles.V03_ENABLED_ROLE_IDS, expectedEnabledV03);
  assert.equal(roles.ROLE_TAXONOMY_SCHEMA_VERSION, 1);
  assert.equal(roles.ROLE_TAXONOMY_CONTRACT_VERSION, "roles.v1");

  assert.equal(Object.isFrozen(roles.CANONICAL_ROLE_REGISTRY_V1), true);
  assert.equal(Object.isFrozen(roles.CANONICAL_ROLE_REGISTRY_V1[0]), true);

  const source = await readFile(modulePath, "utf8");
  assert.equal(/import\s+[^\n]*from\s+["']\.[.]{0,1}["']/u.test(source), false);
  assert.equal(/from\s+["']\.\./u.test(source), false);
});

test("each role has deterministic classification", () => {
  for (const role of dispatchableRoles) {
    const found = roles.lookupRole(role);
    assert.equal(found.state, "valid");
    assert.equal(found.value.kind, "dispatchable_seat");
    assert.equal(roles.isDispatchableRoleId(role), true);
    assert.equal(roles.isHumanGateRoleId(role), false);
    const route = roles.routingProjection(role);
    assert.equal(route.state, "valid");
    assert.equal(route.value.route, "dispatch_seat");
    assert.equal(route.value.roleId, role);
    if (role === "may") {
      assert.equal(roles.isV03EnabledRoleId(role), true);
    }
  }

  for (const role of humanGateRoles) {
    const found = roles.lookupRole(role);
    assert.equal(found.state, "valid");
    assert.equal(found.value.kind, "human_gate");
    assert.equal(roles.isDispatchableRoleId(role), false);
    assert.equal(roles.isHumanGateRoleId(role), true);
    const route = roles.routingProjection(role);
    assert.equal(route.state, "valid");
    assert.equal(route.value.route, "wait_for_human_gate");
    assert.equal(route.value.roleId, role);
  }
});

test("lookups fail closed for malformed and unknown role identifiers", () => {
  assert.equal(roles.lookupRole("moss").state, "invalid");
  assert.equal(roles.lookupRole("moss").code, "UNKNOWN_ROLE_ID");
  assert.equal(roles.lookupRole("\n").state, "invalid");
  assert.equal(roles.lookupRole("\n").code, "INVALID_ROLE_ID");
});

test("assignment validation rejects prohibited or disabled bindings", () => {
  const roleErrors = [
    ["coulson", "model", "HUMAN_GATE_NOT_ALLOWED"],
    ["coulson", "reasoning_runtime", "HUMAN_GATE_NOT_ALLOWED"],
    ["fitz", "tool", "HUMAN_GATE_NOT_ALLOWED"],
    ["simmons", "tool_executor", "HUMAN_GATE_NOT_ALLOWED"],
  ];

  for (const [roleId, scope, expectedCode] of roleErrors) {
    const result = roles.validateRoleAssignment(roleId, scope);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, expectedCode);
  }

  const mackInV03 = roles.validateRoleAssignment("mack", "dispatch", { requireV03Enabled: true });
  assert.equal(mackInV03.state, "invalid");
  assert.equal(mackInV03.code, "ROLE_NOT_ENABLED_IN_V03");

  const hillInV03 = roles.validateRoleAssignment("hill", "dispatch", { requireV03Enabled: true });
  assert.equal(hillInV03.state, "valid");
  assert.equal(hillInV03.value, "hill");

  const badScope = roles.validateRoleAssignment("hill", "tooling");
  assert.equal(badScope.state, "invalid");
  assert.equal(badScope.code, "INVALID_ROLE_ASSIGNMENT_SCOPE");
});
