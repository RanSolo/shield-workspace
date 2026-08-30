import assert from "node:assert/strict";
import test from "node:test";
import { decodePreparedTrailResponse, reviewerIdentityFromOperatorEntry } from "../src/prepared-trail.mjs";

const legacy = {
  schemaVersion: 1,
  slug: "mission-rail-v1",
  title: "Mission Rail",
  reviewerName: "Randy",
  documentText: "# Mission Rail\n",
  checkpoints: [],
};
const binding = {
  packetId: "pr-review:example/repo#1:0123456789abcdef",
  packetDigest: `sha256:${"a".repeat(64)}`,
  repository: "example/repo",
  pullRequestNumber: 1,
  headRevision: "b".repeat(40),
};

test("prepared-trail client accepts legacy schema 1 and requires binding for schema 2", () => {
  assert.equal(decodePreparedTrailResponse(legacy, legacy.slug).schemaVersion, 1);
  assert.throws(() => decodePreparedTrailResponse({ ...legacy, reviewBinding: binding }, legacy.slug), /malformed/u);
  assert.throws(() => decodePreparedTrailResponse({ ...legacy, schemaVersion: 2 }, legacy.slug), /malformed/u);
  assert.deepEqual(
    decodePreparedTrailResponse({ ...legacy, schemaVersion: 2, reviewBinding: binding }, legacy.slug).reviewBinding,
    binding,
  );
});

test("prepared manifest reviewerName is presentation-only and operator assertion is explicit", () => {
  const prepared = decodePreparedTrailResponse(legacy, legacy.slug);
  assert.equal(prepared.reviewerName, "Randy");
  assert.deepEqual(reviewerIdentityFromOperatorEntry(""), { kind: "unattributed", name: null });
  assert.deepEqual(reviewerIdentityFromOperatorEntry("  Randy  "), { kind: "self_asserted", name: "Randy" });
});
