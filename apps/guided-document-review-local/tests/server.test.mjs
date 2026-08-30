import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
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

test("synthetic invoice proves a generic prepared Inspect Trail", async () => {
  const trailsRoot = new URL("../review-kits/", import.meta.url).pathname;
  const packet = await loadPreparedTrail(trailsRoot, "sample-invoice");

  assert.equal(packet.title, "Invoice Inspect Trail");
  assert.match(packet.documentText, /entirely synthetic/u);
  assert.match(packet.documentText, /quantity 5 × \$6\.00 = \*\*\$24\.00\*\*/u);
  assert.equal(packet.checkpoints.length, 4);
  for (const step of packet.checkpoints.flatMap((checkpoint) => checkpoint.learningSteps)) {
    assert.equal(packet.documentText.split(step.sourceQuote).length - 1, 1, step.stepId);
  }
});

test("Mission Rail learning steps use focused passages instead of heading-only anchors", async () => {
  const packetPath = new URL("../review-kits/mission-rail-v2-checkpoints.json", import.meta.url);
  const checkpoints = JSON.parse(await readFile(packetPath, "utf8"));
  const headingAnchors = checkpoints.flatMap((checkpoint) => checkpoint.learningSteps)
    .filter((step) => /^#{1,6}\s/u.test(step.sourceQuote));

  assert.deepEqual(headingAnchors, []);
});

test("trail header carries the complete learning promise inside the progress scene", async () => {
  const indexPath = new URL("../src/index.html", import.meta.url);
  const index = await readFile(indexPath, "utf8");
  const readAt = index.indexOf(">Read it<");
  const explainAt = index.indexOf(">Explain it<");
  const ownAt = index.indexOf(">Own it<");

  assert.ok(readAt >= 0);
  assert.ok(readAt < explainAt);
  assert.ok(explainAt < ownAt);
  assert.match(index, /trail-progress__stages/u);
});
