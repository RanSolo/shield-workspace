import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalDelegationJson, createDelegationLogEntry, createWheelsOffDelegation } from "../dist/delegation-v1.mjs";
import { appendDelegationEntry, readDelegationLog } from "../dist/delegation-store.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const binding = { bindingId: "binding:coulson", humanPrincipalId: "human:coulson", seatId: "coulson", missionScope: "*", signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64 };
  const payload = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:store", previousRevisionId: null, repositoryId: "RanSolo/fixture", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: binding.humanPrincipalId, bindingId: binding.bindingId, signingKeyRef: binding.signingKeyRef, issuedAt: { value: "2026-07-18T22:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const envelope = { payload, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(payload)), privateKey).toString("base64") };
  return { binding, repositoryId: payload.repositoryId, entry: createDelegationLogEntry(envelope, "delegation.granted") };
}

test("delegation store appends, syncs, and replays identically after restart", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-delegation-store-")); const data = fixture();
  const appended = await appendDelegationEntry({ repositoryRoot, ...data }); assert.equal(appended.state, "valid", appended.errors?.join(" "));
  const first = await readDelegationLog({ repositoryRoot, repositoryId: data.repositoryId, binding: data.binding }); const second = await readDelegationLog({ repositoryRoot, repositoryId: data.repositoryId, binding: data.binding });
  assert.deepEqual(second, first); assert.equal(first.value.active.length, 1);
});

test("delegation store fails closed on lock contention and partial tails", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-delegation-lock-")); const data = fixture(); await mkdir(join(repositoryRoot, ".shield"));
  const lock = await open(join(repositoryRoot, ".shield", "delegations.jsonl.lock"), "wx");
  try { const result = await appendDelegationEntry({ repositoryRoot, ...data }); assert.equal(result.state, "invalid"); assert.equal(result.code, "delegation_lock_held"); } finally { await lock.close(); }
  await writeFile(join(repositoryRoot, ".shield", "delegations.jsonl"), "{\"partial\":true");
  const partial = await readDelegationLog({ repositoryRoot, repositoryId: data.repositoryId, binding: data.binding }); assert.equal(partial.state, "invalid"); assert.equal(partial.code, "recovery_required");
});

test("delegation store rejects a symlinked log without touching outside bytes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-delegation-symlink-")); const outside = await mkdtemp(join(tmpdir(), "shield-delegation-outside-")); const data = fixture();
  await mkdir(join(repositoryRoot, ".shield")); const target = join(outside, "delegations.jsonl"); await writeFile(target, "outside\n"); await symlink(target, join(repositoryRoot, ".shield", "delegations.jsonl"));
  const result = await appendDelegationEntry({ repositoryRoot, ...data }); assert.equal(result.state, "invalid"); assert.equal(result.code, "unsafe_path"); assert.equal(await readFile(target, "utf8"), "outside\n");
});
