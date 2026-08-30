import assert from "node:assert/strict";
import test from "node:test";
import { githubReadFields, runGitHubReadCommand } from "../dist/github-read-runner.js";

test("execution boundary permits only exact allowlisted read-only view commands", async () => {
  const calls = [];
  const execute = async (file, args) => { calls.push([file, [...args]]); return "{}"; };
  await runGitHubReadCommand(["pr", "view", "13", "--repo", "example/repo", "--json", githubReadFields.pr], execute);
  await runGitHubReadCommand(["issue", "view", "12", "--repo", "example/repo", "--json", githubReadFields.issue], execute);
  await runGitHubReadCommand(["pr", "view", "13", "--repo", "example/repo", "--json", githubReadFields.head], execute);
  assert.equal(calls.length, 3);
  for (const args of [
    ["pr", "merge", "13", "--repo", "example/repo", "--json", githubReadFields.head],
    ["pr", "view", "13", "--repo", "example/repo", "--json", "headRefOid,title"],
    ["pr", "view", "13", "--json", "headRefOid", "--repo", "example/repo"],
  ]) await assert.rejects(() => runGitHubReadCommand(args, execute), /allowlisted read-only/u);
});
