import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_PUBLICATION_EFFECTS,
  computeReviewPublicationAuthorityDigest,
  computeReviewPublicationAuthoritySemanticIdentityV1,
  evaluateReviewPublicationV1,
  isSensitiveReviewPublicationPath,
} from "../dist/review-publication-v1.mjs";

const base = "1111111111111111111111111111111111111111";
const head = "2222222222222222222222222222222222222222";
const paths = [
  "docs/missions/issue-113-agent-handoff.md",
  "docs/missions/issue-113-review.md",
];

function authority(overrides = {}) {
  return {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    authorityRef: "authorization:issue-113:review-publish",
    missionId: "mission:issue-113",
    subjectId: "issue:113",
    missionRevisionId: "sha256:mission-issue-113",
    repositoryId: "RanSolo/shield-workspace",
    canonicalRepositoryRoot: "/workspace/shield-workspace",
    branch: "codex/issue-113-review-publish-scope",
    baseRevisionId: base,
    headRevisionId: head,
    authorizedPaths: paths,
    permittedEffects: [
      "review.branch.push",
      "review.pull_request.create_draft",
    ],
    ...overrides,
  };
}

function proposal(overrides = {}) {
  return {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    missionId: "mission:issue-113",
    subjectId: "issue:113",
    missionRevisionId: "sha256:mission-issue-113",
    repositoryId: "RanSolo/shield-workspace",
    canonicalRepositoryRoot: "/workspace/shield-workspace",
    branch: "codex/issue-113-review-publish-scope",
    baseRevisionId: base,
    headRevisionId: head,
    proposedChangedPaths: paths,
    observedChangedPaths: paths,
    requestedEffects: [
      "review.branch.push",
      "review.pull_request.create_draft",
    ],
    observedSymlinkPaths: [],
    observedGitlinkPaths: [],
    workspaceClean: true,
    ...overrides,
  };
}

test("semantic identity excludes only authorityRef and retains every authority meaning field", () => {
  const original = authority();
  const equivalent = authority({ authorityRef: "authorization:issue-113:review-publish:retry" });
  const first = computeReviewPublicationAuthoritySemanticIdentityV1(original);
  const retry = computeReviewPublicationAuthoritySemanticIdentityV1(equivalent);

  assert.equal(first.state, "valid");
  assert.equal(retry.state, "valid");
  assert.equal(first.semanticIdentity, retry.semanticIdentity);
  assert.notEqual(
    computeReviewPublicationAuthorityDigest(original),
    computeReviewPublicationAuthorityDigest(equivalent),
  );
  assert.deepEqual(first.material, {
    publicationScopeSchemaVersion: 1,
    contractVersion: "review-publication.v1",
    authorityKind: "review.publish",
    missionId: original.missionId,
    subjectId: original.subjectId,
    missionRevisionId: original.missionRevisionId,
    repositoryId: original.repositoryId,
    canonicalRepositoryRoot: original.canonicalRepositoryRoot,
    branch: original.branch,
    baseRevisionId: original.baseRevisionId,
    headRevisionId: original.headRevisionId,
    authorizedPaths: original.authorizedPaths,
    permittedEffects: original.permittedEffects,
  });
  assert.equal(Object.isFrozen(first.material), true);
  assert.equal(Object.isFrozen(first.material.authorizedPaths), true);
  assert.equal(Object.isFrozen(first.material.permittedEffects), true);

  const meaningChanges = [
    { authorityKind: "wheels_up" },
    { missionId: "mission:issue-114" },
    { subjectId: "issue:114" },
    { missionRevisionId: "sha256:mission-issue-114" },
    { repositoryId: "RanSolo/other-workspace" },
    { canonicalRepositoryRoot: "/workspace/other-workspace" },
    { branch: "codex/issue-114-review-publish-scope" },
    { baseRevisionId: "3".repeat(40) },
    { headRevisionId: "4".repeat(40) },
    { authorizedPaths: [paths[0]] },
    { permittedEffects: ["review.branch.push"] },
  ];
  for (const change of meaningChanges) {
    const changed = computeReviewPublicationAuthoritySemanticIdentityV1(authority(change));
    assert.equal(changed.state, "valid", JSON.stringify(change));
    assert.notEqual(changed.semanticIdentity, first.semanticIdentity, JSON.stringify(change));
  }
});

test("semantic identity fails closed on malformed and hostile authority inputs", () => {
  const sparsePaths = [];
  sparsePaths.length = 1;
  const aliasedPaths = ["Docs/review.md", "docs/review.md"];
  const duplicatePaths = [paths[0], paths[0]];
  const reorderedPaths = [...paths].reverse();
  for (const input of [
    null,
    { ...authority(), extra: true },
    authority({ authorizedPaths: sparsePaths }),
    authority({ authorizedPaths: aliasedPaths }),
    authority({ authorizedPaths: duplicatePaths }),
    authority({ authorizedPaths: reorderedPaths }),
    authority({ permittedEffects: [...authority().permittedEffects].reverse() }),
    new Proxy(authority(), {}),
  ]) {
    assert.equal(computeReviewPublicationAuthoritySemanticIdentityV1(input).state, "blocked");
  }

  let touched = 0;
  const accessor = authority();
  Object.defineProperty(accessor, "missionId", {
    enumerable: true,
    get() {
      touched += 1;
      return "mission:hostile";
    },
  });
  assert.equal(computeReviewPublicationAuthoritySemanticIdentityV1(accessor).state, "blocked");
  assert.equal(touched, 0);
});

test("allows an exact review-only two-artifact publication and binds a stable digest", () => {
  const first = evaluateReviewPublicationV1(authority(), proposal());
  const second = evaluateReviewPublicationV1(authority(), proposal());
  assert.equal(first.state, "allowed");
  assert.equal(first.reasonCode, "publication_scope_allowed");
  assert.equal(first.scopeDigest, second.scopeDigest);
  assert.deepEqual(first.binding.authorizedPaths, paths);
  assert.deepEqual(first.binding.requestedEffects, proposal().requestedEffects);
  assert.match(first.scopeDigest, /^sha256:[A-Za-z0-9_-]+$/u);
});

test("supports Wheels Up without widening its exact paths or permitted effects", () => {
  const result = evaluateReviewPublicationV1(
    authority({ authorityKind: "wheels_up" }),
    proposal(),
  );
  assert.equal(result.state, "allowed");
  assert.equal(result.binding.authorityKind, "wheels_up");

  const widened = evaluateReviewPublicationV1(
    authority({ authorityKind: "wheels_up" }),
    proposal({ proposedChangedPaths: [...paths, "packages/shield-team-system/src/runner-v1.mts"] }),
  );
  assert.deepEqual(widened, {
    state: "blocked",
    reasonCode: "path_set_mismatch",
    scopeDigest: null,
  });
});

test("rejects missing, extra, or reordered changed paths", () => {
  for (const proposedChangedPaths of [
    [paths[0]],
    [...paths, "docs/missions/third.md"],
    [...paths].reverse(),
  ]) {
    const result = evaluateReviewPublicationV1(authority(), proposal({ proposedChangedPaths }));
    assert.equal(result.state, "blocked");
    assert.ok(["path_ambiguous", "path_set_mismatch"].includes(result.reasonCode));
  }
  assert.equal(
    evaluateReviewPublicationV1(
      authority(),
      proposal({ observedChangedPaths: [paths[0]] }),
    ).reasonCode,
    "path_set_mismatch",
  );
});

test("rejects traversal, absolute, backslash, control, sensitive, and ambiguous paths", () => {
  const unsafe = [
    "../outside.md",
    "/absolute.md",
    "docs\\missions\\review.md",
    "docs/missions/review\u0000.md",
  ];
  for (const path of unsafe) {
    assert.equal(
      evaluateReviewPublicationV1(
        authority({ authorizedPaths: [path] }),
        proposal({
          proposedChangedPaths: [path],
          observedChangedPaths: [path],
        }),
      ).reasonCode,
      "path_unsafe",
    );
  }
  for (const path of [".env", "secrets/token.txt", "docs/private.pem", ".git/config"]) {
    assert.equal(isSensitiveReviewPublicationPath(path), true);
    assert.equal(
      evaluateReviewPublicationV1(
        authority({ authorizedPaths: [path] }),
        proposal({
          proposedChangedPaths: [path],
          observedChangedPaths: [path],
        }),
      ).reasonCode,
      "path_sensitive",
    );
  }
  assert.equal(
    evaluateReviewPublicationV1(
      authority({ authorizedPaths: ["Docs/review.md", "docs/review.md"] }),
      proposal({
        proposedChangedPaths: ["Docs/review.md", "docs/review.md"],
        observedChangedPaths: ["Docs/review.md", "docs/review.md"],
      }),
    ).reasonCode,
    "path_ambiguous",
  );
});

test("rejects symlinks, gitlinks, dirty workspaces, and stale identity bindings", () => {
  assert.equal(
    evaluateReviewPublicationV1(
      authority(),
      proposal({ observedSymlinkPaths: [paths[0]] }),
    ).reasonCode,
    "symlink_path_denied",
  );
  assert.equal(
    evaluateReviewPublicationV1(
      authority(),
      proposal({ observedGitlinkPaths: [paths[0]] }),
    ).reasonCode,
    "gitlink_path_denied",
  );
  assert.equal(
    evaluateReviewPublicationV1(authority(), proposal({ workspaceClean: false })).reasonCode,
    "workspace_dirty",
  );
  for (const overrides of [
    { repositoryId: "Other/repository" },
    { branch: "other-branch" },
    { baseRevisionId: "3333333333333333333333333333333333333333" },
    { headRevisionId: "4444444444444444444444444444444444444444" },
  ]) {
    assert.equal(
      evaluateReviewPublicationV1(authority(), proposal(overrides)).reasonCode,
      "binding_mismatch",
    );
  }
});

test("rejects unsupported or unpermitted publication effects", () => {
  assert.deepEqual(REVIEW_PUBLICATION_EFFECTS, [
    "review.branch.push",
    "review.comment.publish",
    "review.pull_request.create_draft",
    "review.pull_request.update_draft",
  ]);
  assert.equal(
    evaluateReviewPublicationV1(
      authority(),
      proposal({ requestedEffects: ["review.comment.publish"] }),
    ).reasonCode,
    "effect_not_permitted",
  );
  assert.equal(
    evaluateReviewPublicationV1(
      authority(),
      proposal({ requestedEffects: ["review.merge"] }),
    ).reasonCode,
    "proposal_malformed",
  );
});

test("closed shapes and hostile accessors fail without executing accessors", () => {
  let touched = 0;
  const hostile = authority();
  Object.defineProperty(hostile, "missionId", {
    enumerable: true,
    get() {
      touched += 1;
      return "mission:hostile";
    },
  });
  assert.equal(evaluateReviewPublicationV1(hostile, proposal()).reasonCode, "authority_malformed");
  assert.equal(touched, 0);
  assert.equal(
    evaluateReviewPublicationV1({ ...authority(), extra: true }, proposal()).reasonCode,
    "authority_malformed",
  );
  assert.equal(
    evaluateReviewPublicationV1(authority(), { ...proposal(), extra: true }).reasonCode,
    "proposal_malformed",
  );
});
