import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type GitHubCommandExecutor = (file: string, args: readonly string[]) => Promise<string>;

const executeFile = promisify(execFile);
const prFields = "number,title,body,url,baseRefOid,headRefOid,files,closingIssuesReferences,statusCheckRollup";
const issueFields = "number,title,body,url,updatedAt";

export async function runGitHubReadCommand(
  args: readonly string[],
  execute: GitHubCommandExecutor = async (file, commandArgs) =>
    (await executeFile(file, [...commandArgs], { maxBuffer: 10 * 1024 * 1024 })).stdout,
): Promise<string> {
  if (!isAllowed(args)) throw new TypeError("GitHub command is not an allowlisted read-only view.");
  return execute("gh", args);
}

function isAllowed(args: readonly string[]): boolean {
  if (args.length !== 7 || !/^[1-9]\d*$/u.test(args[2] ?? "") || args[3] !== "--repo" ||
      !/^[^/\s]+\/[^/\s]+$/u.test(args[4] ?? "") || args[5] !== "--json") return false;
  return (args[0] === "pr" && args[1] === "view" && [prFields, "headRefOid"].includes(args[6] ?? "")) ||
    (args[0] === "issue" && args[1] === "view" && args[6] === issueFields);
}

export const githubReadFields = Object.freeze({ pr: prFields, issue: issueFields, head: "headRefOid" });
