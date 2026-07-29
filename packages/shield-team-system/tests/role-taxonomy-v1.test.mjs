import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as roles from "../dist/role-taxonomy-v1.mjs";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/role-taxonomy-v1.mts");
const dispatchables = ["hill", "daisy", "fury", "may", "mack", "oracle"];
const humanGates = ["coulson", "fitz", "simmons"];
const allCanonical = [...dispatchables, ...humanGates];
const v03Enabled = ["hill", "daisy", "fury", "may"];

function resolveRelativeImport(sourceDirectory, sourceFile, specifier) {
  let normalized = specifier;
  if (normalized.endsWith(".mjs")) {
    normalized = `${normalized.slice(0, -4)}.mts`;
  }
  if (extname(normalized) === "") {
    normalized = `${normalized}.mts`;
  }
  if (!normalized.endsWith(".mts")) return null;
  const sourcePath = resolve(sourceDirectory, sourceFile);
  const resolved = resolve(dirname(sourcePath), normalized);
  if (!resolved.startsWith(sourceDirectory)) return null;
  return relative(sourceDirectory, resolved).replace(/\\/g, "/");
}

function parseRelativeImports(source) {
  const statements = source.match(/(^|\n)\s*(?:import|export)\b[\s\S]*?;/g) ?? [];
  return statements.flatMap((statement) => {
    const match = statement.match(/\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/m);
    return match ? [match[1] ?? match[2]] : [];
  });
}

function detectCycle(edges, node, visiting, visited) {
  if (visited.has(node)) return true;
  if (visiting.has(node)) return false;
  visiting.add(node);
  for (const next of edges.get(node) ?? []) {
    if (!detectCycle(edges, next, visiting, visited)) return false;
  }
  visiting.delete(node);
  visited.add(node);
  return true;
}

test("role taxonomy exports are closed, immutable, and dependency-free", async () => {
  assert.deepEqual(roles.CANONICAL_ROLE_IDS, allCanonical);
  assert.deepEqual(roles.DISPATCHABLE_ROLE_IDS, dispatchables);
  assert.deepEqual(roles.HUMAN_GATE_ROLE_IDS, humanGates);
  assert.deepEqual(roles.V03_ENABLED_ROLE_IDS, v03Enabled);
  assert.equal(roles.ROLE_TAXONOMY_SCHEMA_VERSION, 1);
  assert.equal(roles.ROLE_TAXONOMY_CONTRACT_VERSION, "roles.v1");

  assert.equal(Object.isFrozen(roles.CANONICAL_ROLE_IDS), true);
  assert.equal(Object.isFrozen(roles.DISPATCHABLE_ROLE_IDS), true);
  assert.equal(Object.isFrozen(roles.HUMAN_GATE_ROLE_IDS), true);
  assert.equal(Object.isFrozen(roles.V03_ENABLED_ROLE_IDS), true);
  assert.equal(Object.isFrozen(roles.CANONICAL_ROLE_REGISTRY_V1), true);
  for (const definition of roles.CANONICAL_ROLE_REGISTRY_V1) {
    assert.equal(Object.isFrozen(definition), true);
  }

  const source = await readFile(modulePath, "utf8");
  assert.equal(source.includes("../"), false);
  assert.equal(source.includes("./"), false);
});

test("role lookup and projection preserve canonical dispatch/human behavior", () => {
  for (const role of dispatchables) {
    const found = roles.lookupRole(role);
    assert.equal(found.state, "valid");
    assert.equal(found.value.kind, "dispatchable_seat");
    assert.equal(found.value.roleId, found.value.seatId);
    assert.equal(roles.isDispatchableRoleId(role), true);
    assert.equal(roles.isHumanGateRoleId(role), false);
    const route = roles.routingProjection(role);
    assert.equal(route.state, "valid");
    assert.equal(route.value.route, "dispatch_seat");
    assert.equal(route.value.roleId, role);
    if (v03Enabled.includes(role)) {
      assert.equal(roles.isV03EnabledRoleId(role), true);
    }
  }

  for (const role of humanGates) {
    const found = roles.lookupRole(role);
    assert.equal(found.state, "valid");
    assert.equal(found.value.kind, "human_gate");
    assert.equal(found.value.roleId, found.value.seatId);
    assert.equal(roles.isDispatchableRoleId(role), false);
    assert.equal(roles.isHumanGateRoleId(role), true);
    const route = roles.routingProjection(role);
    assert.equal(route.state, "valid");
    assert.equal(route.value.route, "wait_for_human_gate");
    assert.equal(route.value.roleId, role);
  }
});

test("lookup fails closed for malformed and unknown role identifiers", () => {
  assert.equal(roles.lookupRole("moss").state, "invalid");
  assert.equal(roles.lookupRole("moss").code, "UNKNOWN_ROLE_ID");
  assert.equal(roles.lookupRole("\n").state, "invalid");
  assert.equal(roles.lookupRole("\n").code, "INVALID_ROLE_ID");
});

test("assignment validation rejects invalid scopes, disallowed roles, and V0.3 constraints", () => {
  const roleMatrix = [
    ["coulson", "dispatch", "ROLE_NOT_DISPATCHABLE"],
    ["coulson", "model", "HUMAN_GATE_NOT_ALLOWED"],
    ["coulson", "reasoning_runtime", "HUMAN_GATE_NOT_ALLOWED"],
    ["coulson", "tool_executor", "HUMAN_GATE_NOT_ALLOWED"],
    ["coulson", "tool", "HUMAN_GATE_NOT_ALLOWED"],
    ["fitz", "dispatch", "ROLE_NOT_DISPATCHABLE"],
    ["fitz", "model", "HUMAN_GATE_NOT_ALLOWED"],
    ["fitz", "reasoning_runtime", "HUMAN_GATE_NOT_ALLOWED"],
    ["fitz", "tool_executor", "HUMAN_GATE_NOT_ALLOWED"],
    ["fitz", "tool", "HUMAN_GATE_NOT_ALLOWED"],
    ["simmons", "dispatch", "ROLE_NOT_DISPATCHABLE"],
    ["simmons", "model", "HUMAN_GATE_NOT_ALLOWED"],
    ["simmons", "reasoning_runtime", "HUMAN_GATE_NOT_ALLOWED"],
    ["simmons", "tool_executor", "HUMAN_GATE_NOT_ALLOWED"],
    ["simmons", "tool", "HUMAN_GATE_NOT_ALLOWED"],
  ];

  for (const [role, scope, expectedCode] of roleMatrix) {
    const result = roles.validateRoleAssignment(role, scope);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, expectedCode);
  }

  const mackInV03 = roles.validateRoleAssignment("mack", "dispatch", { requireV03Enabled: true });
  assert.equal(mackInV03.state, "invalid");
  assert.equal(mackInV03.code, "ROLE_NOT_ENABLED_IN_V03");

  const hillInV03 = roles.validateRoleAssignment("hill", "dispatch", { requireV03Enabled: true });
  assert.equal(hillInV03.state, "valid");
  assert.equal(hillInV03.value, "hill");

  const badScope = roles.validateRoleAssignment("may", "tooling");
  assert.equal(badScope.state, "invalid");
  assert.equal(badScope.code, "INVALID_ROLE_ASSIGNMENT_SCOPE");
});

test("invalid role-assignment options are rejected deterministically without invoking getters", () => {
  const malformedOptions = [
    null,
    1,
    true,
    "oops",
    ["x"],
    {},
    { requireV03Enabled: "true" },
    { requireV03Enabled: true, extra: false },
    Object.create({ requireV03Enabled: true }),
    { __proto__: { requireV03Enabled: true } },
  ];
  for (const options of malformedOptions) {
    const result = roles.validateRoleAssignment("may", "dispatch", options);
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "INVALID_ROLE_ASSIGNMENT_OPTIONS");
  }

  const proxy = new Proxy({}, {});
  const proxyResult = roles.validateRoleAssignment("may", "dispatch", proxy);
  assert.equal(proxyResult.state, "invalid");
  assert.equal(proxyResult.code, "INVALID_ROLE_ASSIGNMENT_OPTIONS");

  let touched = 0;
  const accessorOptions = Object.defineProperty({}, "requireV03Enabled", {
    enumerable: true,
    get() {
      touched += 1;
      return true;
    },
  });
  const accessorResult = roles.validateRoleAssignment("may", "dispatch", accessorOptions);
  assert.equal(accessorResult.state, "invalid");
  assert.equal(accessorResult.code, "INVALID_ROLE_ASSIGNMENT_OPTIONS");
  assert.equal(touched, 0);

  const nonEnumerable = Object.defineProperty({}, "requireV03Enabled", {
    enumerable: false,
    value: true,
  });
  const nonEnumerableResult = roles.validateRoleAssignment("may", "dispatch", nonEnumerable);
  assert.equal(nonEnumerableResult.state, "invalid");
  assert.equal(nonEnumerableResult.code, "INVALID_ROLE_ASSIGNMENT_OPTIONS");

  const proxyGetOptions = Object.assign({}, { requireV03Enabled: true });
  const backing = { requireV03Enabled: true };
  const hostileProxy = new Proxy(backing, {
    get(target, property) {
      touched += 1;
      return target[property];
    },
  });
  const proxyGetResult = roles.validateRoleAssignment("may", "dispatch", hostileProxy);
  assert.equal(proxyGetResult.state, "invalid");
  assert.equal(proxyGetResult.code, "INVALID_ROLE_ASSIGNMENT_OPTIONS");
  assert.equal(touched, 0);
});

test("src import graph is acyclic and role taxonomy has no relative dependencies", async () => {
  const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
  const files = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mts"))
    .map((entry) => entry.name)
    .sort();
  const fileSet = new Set(files);

  const edges = new Map();
  for (const file of files) {
    const source = await readFile(resolve(sourceDirectory, file), "utf8");
    const imports = parseRelativeImports(source)
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolveRelativeImport(sourceDirectory, file, specifier))
      .filter((resolved) => resolved !== null);

    const localImports = [];
    for (const resolved of imports) {
      assert.equal(fileSet.has(resolved), true, `relative import target missing: ${resolved}`);
      localImports.push(resolved);
    }
    edges.set(file, localImports);
  }

  assert.equal(edges.get("role-taxonomy-v1.mts")?.length ?? 0, 0);

  const visiting = new Set();
  const visited = new Set();
  for (const file of files) {
    assert.equal(detectCycle(edges, file, visiting, visited), true, `cycle detected at ${file}`);
  }
});
