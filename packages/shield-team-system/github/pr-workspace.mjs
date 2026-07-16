import { execFileSync } from "node:child_process";

import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";

export function defaultRun(executable, args, options = {}) {
  try {
    const stdout = execFileSync(executable, args, {
      cwd: options.cwd,
      encoding: "utf8",
      input: options.input,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      timeout: options.timeoutMs ?? 30_000,
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error?.status) ? error.status : -1,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? error?.message ?? error).trim(),
    };
  }
}

function blocked(reason, commands) {
  return { state: "blocked", reason, commands };
}

function call(run, commands, executable, args, options) {
  let result;
  try {
    result = run(executable, args, options);
  } catch (error) {
    result = {
      exitCode: -1,
      stdout: "",
      stderr: String(error?.message ?? error),
    };
  }
  if (!result || typeof result !== "object" || Number.isInteger(result.exitCode) === false) {
    return { exitCode: -1, stdout: "", stderr: "Runner returned an invalid result." };
  }
  commands.push({ executable, args: [...args], exitCode: result.exitCode });
  return result;
}

function readMatchingPRs(run, commands, plan, cwd) {
  const result = call(
    run,
    commands,
    "gh",
    [
      "pr", "list", "--repo", `${plan.repositoryOwner}/${plan.repositoryName}`,
      "--head", plan.branchSlug, "--state", "all",
      "--json", "number,title,url,isDraft,state,headRefName,baseRefName",
    ],
    { cwd },
  );
  if (result.exitCode !== 0) return { state: "error", reason: "pr_lookup_failed" };

  let values;
  try {
    values = JSON.parse(result.stdout);
  } catch {
    return { state: "error", reason: "pr_lookup_invalid_json" };
  }
  if (!Array.isArray(values)) return { state: "error", reason: "pr_lookup_invalid_shape" };

  const matches = values.filter(
    (value) =>
      value &&
      Number.isInteger(value.number) &&
      typeof value.url === "string" &&
      value.headRefName === plan.branchSlug &&
      value.baseRefName === plan.baseBranch,
  );
  if (matches.length > 1) return { state: "error", reason: "multiple_matching_prs" };
  return { state: "ok", pr: matches[0] ?? null };
}

/**
 * Pushes an already committed Mission Brief and creates or refreshes its draft
 * PR. The caller supplies a validated plan and generated PR body.
 */
export function createOrUpdatePR(plan, options = {}) {
  const run = options.run ?? defaultRun;
  const cwd = options.cwd;
  const body = options.body;
  const commands = [];
  if (typeof run !== "function") return blocked("runner_required", commands);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return blocked("validated_plan_required", commands);
  if (typeof body !== "string" || body.trim().length === 0) return blocked("pr_body_required", commands);
  if (!isSafeGitHubContent([body]).safe) return blocked("unsafe_pr_body", commands);

  const current = call(run, commands, "git", ["branch", "--show-current"], { cwd });
  if (current.exitCode !== 0 || current.stdout.trim() !== plan.branchSlug) {
    return blocked("expected_branch_not_checked_out", commands);
  }

  const briefStatus = call(
    run,
    commands,
    "git",
    ["status", "--porcelain", "--", plan.missionBriefPath],
    { cwd },
  );
  if (briefStatus.exitCode !== 0 || briefStatus.stdout.trim() !== "") {
    return blocked("mission_brief_not_clean", commands);
  }
  const tracked = call(
    run,
    commands,
    "git",
    ["ls-files", "--error-unmatch", "--", plan.missionBriefPath],
    { cwd },
  );
  if (tracked.exitCode !== 0) return blocked("mission_brief_not_tracked", commands);
  const committed = call(
    run,
    commands,
    "git",
    ["log", "-1", "--format=%H", "--", plan.missionBriefPath],
    { cwd },
  );
  if (committed.exitCode !== 0 || committed.stdout.trim() === "") {
    return blocked("mission_brief_not_committed", commands);
  }

  const push = call(run, commands, "git", ["push", "-u", "origin", plan.branchSlug], { cwd });
  if (push.exitCode !== 0) return blocked("branch_push_failed", commands);

  const lookup = readMatchingPRs(run, commands, plan, cwd);
  if (lookup.state === "error") return blocked(lookup.reason, commands);

  if (lookup.pr === null) {
    const created = call(
      run,
      commands,
      "gh",
      [
        "pr", "create", "--repo", `${plan.repositoryOwner}/${plan.repositoryName}`,
        "--base", plan.baseBranch, "--head", plan.branchSlug, "--draft",
        "--title", plan.prTitle, "--body-file", "-",
      ],
      { cwd, input: body },
    );
    if (created.exitCode !== 0) return blocked("pr_create_failed", commands);

    const verified = readMatchingPRs(run, commands, plan, cwd);
    if (verified.state === "error") return blocked(verified.reason, commands);
    if (!verified.pr?.url || verified.pr.isDraft !== true || verified.pr.state !== "OPEN") {
      return blocked("created_pr_failed_readback", commands);
    }
    return {
      state: "success",
      action: "created_draft_pr",
      prNumber: verified.pr.number,
      prUrl: verified.pr.url,
      commands,
    };
  }

  if (lookup.pr.state !== "OPEN") return blocked("matching_pr_is_not_open", commands);
  if (lookup.pr.isDraft !== true) return blocked("matching_pr_is_not_draft", commands);
  const edited = call(
    run,
    commands,
    "gh",
    [
      "pr", "edit", String(lookup.pr.number),
      "--repo", `${plan.repositoryOwner}/${plan.repositoryName}`,
      "--title", plan.prTitle, "--body-file", "-",
    ],
    { cwd, input: body },
  );
  if (edited.exitCode !== 0) return blocked("pr_update_failed", commands);
  return {
    state: "reused",
    action: "updated_existing_draft_pr",
    prNumber: lookup.pr.number,
    prUrl: lookup.pr.url,
    commands,
  };
}
