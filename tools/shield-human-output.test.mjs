import assert from "node:assert/strict";
import test from "node:test";

import {
  extractPendingHumanEvidence,
  extractWheelsUpManifests,
  renderHumanActions,
} from "./shield-human-output.mjs";

const MANIFEST_BEGIN = "SHIELD_WHEELS_UP_MANIFEST_BEGIN";
const MANIFEST_END = "SHIELD_WHEELS_UP_MANIFEST_END";

const manifest = {
  schemaId: "shield.wheels-up-authorization-manifest.v1",
  missionId: "mission:issue-242-corrective",
  implementationAuthority: {
    seatId: "may",
    approvedActionIds: ["action:issue-242.corrective-implementation", "action:issue-242.validation"],
    approvedCapabilities: ["filesystem_write", "process_execute"],
    approvedRelativePaths: ["a", "b"],
  },
  publicationAuthority: { permittedEffects: ["review.branch.push", "review.pull_request.create_draft"] },
  exclusions: ["merge", "deployment", "release", "final_acceptance"],
  remainingHumanGates: ["coulson.final_acceptance", "fitz.technical_review"],
};

test("extracts both framed and human-readable Wheels Up manifests from noisy transcripts", () => {
  const human = `noise\nAuthorize Wheels Up manifest:\n${JSON.stringify(manifest, null, 2)}\nPasscode: `;
  const framed = `${MANIFEST_BEGIN}\n${JSON.stringify(manifest)}\n${MANIFEST_END}`;
  assert.deepEqual(extractWheelsUpManifests(`${human}\n${framed}`), [manifest, manifest]);
});

test("renders duplicate previews for one mission only once", () => {
  const framed = `${MANIFEST_BEGIN}\n${JSON.stringify(manifest)}\n${MANIFEST_END}`;
  const human = `Authorize Wheels Up manifest:\n${JSON.stringify(manifest, null, 2)}\nPasscode: `;
  const rendered = renderHumanActions(`${framed}\n${human}`);
  assert.equal(rendered.match(/APPROVAL NEEDED/gmu)?.length, 1);
});

test("extracts explicit pending human evidence and ignores status noise", () => {
  const text = `Mission: mission:example\nReadiness (accept): blocked\nPending human evidence: coulson:pending:req:mission:issue-29:sha256:abc:final_acceptance\nNext journal sequence: 2\n`;
  assert.deepEqual(extractPendingHumanEvidence(text), [{
    seat: "coulson",
    missionId: "mission:issue-29",
    revision: "sha256:abc",
    kind: "final_acceptance",
  }]);
});

test("renders only approval scope, exclusions, and remaining human decisions", () => {
  const transcript = `SHIELD: approvedRelativePaths must be sorted.\nAuthorize Wheels Up manifest:\n${JSON.stringify(manifest, null, 2)}\nPasscode: `;
  const rendered = renderHumanActions(transcript);
  assert.match(rendered, /APPROVAL NEEDED — mission:issue-242-corrective/u);
  assert.match(rendered, /Change 2 approved paths/u);
  assert.match(rendered, /Not authorized:\n- merge, deployment, release, final acceptance/u);
  assert.match(rendered, /Coulson: final acceptance/u);
  assert.match(rendered, /Fitz: technical review/u);
  assert.doesNotMatch(rendered, /approvedRelativePaths must be sorted|journal sequence|sha256/u);
});

test("reports pending human decisions when no authorization manifest is present", () => {
  const rendered = renderHumanActions("Pending human evidence: coulson:pending:req:mission:issue-29:sha256:abc:final_acceptance\n");
  assert.equal(rendered, "PENDING HUMAN DECISIONS\n- mission:issue-29 — Coulson: final acceptance\n");
});

test("reports no action for machine-only noise", () => {
  assert.equal(renderHumanActions("Execution: not-started\nNext journal sequence: 2\n"), "No human action required.\n");
});
