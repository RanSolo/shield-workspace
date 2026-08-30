import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPreparedTrail, resolvePublicPath } from "../scripts/server.mjs";

test("local server rejects traversal paths", () => {
  const root = "/tmp/document-trail/dist";
  assert.equal(resolvePublicPath(root, "/../package.json"), null);
  assert.equal(resolvePublicPath(root, "/%2e%2e/package.json"), null);
  assert.equal(resolvePublicPath(root, "/index.html"), `${root}/index.html`);
  assert.equal(resolvePublicPath(root, "/trails/mission-rail-v1"), `${root}/index.html`);
  assert.equal(resolvePublicPath(root, "/package.json"), null);
});

test("prepared trail manifest loads one closed local packet", async () => {
  const root = await mkdtemp(join(tmpdir(), "document-trail-packet-"));
  try {
    await writeFile(join(root, "document.md"), "# Prepared\n");
    await writeFile(join(root, "checkpoints.json"), "[]\n");
    await writeFile(join(root, "prepared.trail.json"), JSON.stringify({
      schemaVersion: 1,
      slug: "prepared",
      title: "Prepared trail",
      reviewerName: "Randy Russell",
      documentPath: "document.md",
      checkpointPath: "checkpoints.json",
    }));
    const packet = await loadPreparedTrail(root, "prepared");
    assert.equal(packet.documentText, "# Prepared\n");
    assert.deepEqual(packet.checkpoints, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
