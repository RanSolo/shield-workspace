import assert from "node:assert/strict";
import test from "node:test";
import * as adapter from "../dist/index.js";
const { observeGitHubPullRequest, parseGitHubPullRequestUrl, readGitHubPullRequestHead } = adapter;

const a = "a".repeat(40);
const b = "b".repeat(40);
const body = "## Validation\n\n- npm exec nx test guided-pr-review\n";
const clientFor = (head) => ({
  viewPullRequest: async () => ({
    number: 13, title: "Deliver", body, url: "https://github.com/example/repo/pull/13",
    baseRefOid: a, headRefOid: head, files: [], closingIssuesReferences: [{ number: 12 }],
    statusCheckRollup: [{ name: "checks", conclusion: "SUCCESS" }],
  }),
  viewIssue: async () => ({ number: 12, title: "Issue", body: "- [ ] Works", url: "https://github.com/example/repo/issues/12", updatedAt: "2026-08-30T00:00:00Z" }),
  readPullRequestHead: async () => ({ headRefOid: head }),
});

test("adapter observes PR, issue, and checks through semantic read client", async () => {
  assert.equal("createGhCommandRunner" in adapter, false);
  assert.deepEqual(parseGitHubPullRequestUrl("https://github.com/example/repo/pull/13"), { repository: "example/repo", number: 13 });
  const snapshot = await observeGitHubPullRequest("https://github.com/example/repo/pull/13", { client: clientFor(b), now: () => "2026-08-30T00:00:00Z" });
  assert.equal(snapshot.validations[0].verification, "github_check");
  assert.equal(snapshot.validations[0].headRevision, b);
  assert.equal(await readGitHubPullRequestHead("example/repo", 13, { client: clientFor(b) }), b);
});

test("unchanged PR-body validation remains unverified and revision-unbound across A to B", async () => {
  const atA = await observeGitHubPullRequest({ repository: "example/repo", number: 13 }, { client: clientFor(a) });
  const atB = await observeGitHubPullRequest({ repository: "example/repo", number: 13 }, { client: clientFor(b) });
  for (const observed of [atA, atB]) {
    const claim = observed.validations.find((item) => item.validationId === "pr-body-validation:1");
    assert.deepEqual({ verification: claim.verification, revisionBinding: claim.revisionBinding, headRevision: claim.headRevision },
      { verification: "unverified", revisionBinding: "none", headRevision: null });
  }
});

test("PR-body claim binds only when it carries one validated exact SHA", async () => {
  const client = clientFor(b);
  client.viewPullRequest = async () => ({ ...(await clientFor(b).viewPullRequest()), body: `## Validation\n\n- validated exact SHA ${a}\n` });
  const snapshot = await observeGitHubPullRequest({ repository: "example/repo", number: 13 }, { client });
  assert.equal(snapshot.validations[1].revisionBinding, "claim_exact_sha");
  assert.equal(snapshot.validations[1].headRevision, a);
});

test("adapter rejects non-GitHub and non-PR URLs", () => {
  assert.throws(() => parseGitHubPullRequestUrl("https://example.com/example/repo/pull/13"), /Only https/u);
  assert.throws(() => parseGitHubPullRequestUrl("https://github.com/example/repo/issues/13"), /Expected/u);
});
