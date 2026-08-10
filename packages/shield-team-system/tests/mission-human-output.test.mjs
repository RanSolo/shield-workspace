import assert from "node:assert/strict";
import test from "node:test";

import {
  renderAuthorizeWheelsUpHumanV1,
  renderAuthorizeWheelsUpReceiptHumanV1,
} from "../dist/mission-human-output-v1.mjs";

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

test("Wheels Up human preview contains only the operator decision surface", () => {
  const rendered = renderAuthorizeWheelsUpHumanV1(manifest);
  assert.match(rendered, /APPROVAL NEEDED — mission:issue-242-corrective/u);
  assert.match(rendered, /Change 2 approved paths/u);
  assert.match(rendered, /Use: filesystem write, process execute/u);
  assert.match(rendered, /Not authorized:\n- merge, deployment, release, final acceptance/u);
  assert.match(rendered, /Coulson: final acceptance/u);
  assert.match(rendered, /Fitz: technical review/u);
  assert.doesNotMatch(rendered, /sha256|journal|revision|binding|digest/u);
});

test("Wheels Up human receipt reports authorization and remaining gates", () => {
  const rendered = renderAuthorizeWheelsUpReceiptHumanV1({
    schemaId: "shield.wheels-up-authorization-receipt.v1",
    missionId: manifest.missionId,
    remainingHumanGates: ["coulson.final_acceptance", "simmons.product_domain_review"],
  });
  assert.match(rendered, /^AUTHORIZED — mission:issue-242-corrective/u);
  assert.match(rendered, /Coulson: final acceptance/u);
  assert.match(rendered, /Simmons: product\/domain review/u);
  assert.doesNotMatch(rendered, /receiptDigest|sequence|sha256/u);
});
