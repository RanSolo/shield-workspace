import assert from "node:assert/strict";
import test from "node:test";
import {
  observeGitHubPullRequest,
  parseGitHubPullRequestUrl,
  readGitHubPullRequestHead,
} from "../dist/index.js";

const head = "b".repeat(40);

test("GitHub adapter parses PR URLs and performs only read commands", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push([...args]);
    if (args[0] === "pr" && args.some((arg) => arg.includes("headRefOid"))) {
      return JSON.stringify({
        number: 13,
        title: "Deliver the change",
        body: "## Validation\n\nFocused tests passed.",
        url: "https://github.com/example/repo/pull/13",
        baseRefOid: "a".repeat(40),
        headRefOid: head,
        files: [{ path: "index.ts", additions: 2, deletions: 1, changeType: "MODIFIED" }],
        closingIssuesReferences: [{ number: 12 }],
        statusCheckRollup: [{ name: "checks", conclusion: "SUCCESS" }],
      });
    }
    return JSON.stringify({ number: 12, title: "Issue", body: "- [ ] Works", url: "https://github.com/example/repo/issues/12", updatedAt: "2026-08-30T00:00:00Z" });
  };
  assert.deepEqual(parseGitHubPullRequestUrl("https://github.com/example/repo/pull/13"), { repository: "example/repo", number: 13 });
  const snapshot = await observeGitHubPullRequest("https://github.com/example/repo/pull/13", { run, now: () => "2026-08-30T00:00:00Z" });
  assert.equal(snapshot.headRevision, head);
  assert.equal(snapshot.validations[0].headRevision, head);
  assert.equal(calls.every((args) => args[0] === "pr" || args[0] === "issue"), true);
  assert.equal(calls.some((args) => args.some((arg) => /comment|approve|merge|label|create|edit|close/u.test(arg))), false);
});

test("adapter reads a live head without writing", async () => {
  const calls = [];
  const live = await readGitHubPullRequestHead("example/repo", 13, {
    run: async (args) => { calls.push([...args]); return JSON.stringify({ headRefOid: head }); },
  });
  assert.equal(live, head);
  assert.deepEqual(calls[0].slice(0, 4), ["pr", "view", "13", "--repo"]);
});

test("adapter rejects non-GitHub and non-PR URLs", () => {
  assert.throws(() => parseGitHubPullRequestUrl("https://example.com/example/repo/pull/13"), /Only https/u);
  assert.throws(() => parseGitHubPullRequestUrl("https://github.com/example/repo/issues/13"), /Expected/u);
});
