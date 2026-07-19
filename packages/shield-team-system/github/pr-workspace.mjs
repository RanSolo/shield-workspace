import { execFileSync } from "node:child_process";

import { isSafeGitHubContent } from "../contracts/workspace-contract.mjs";

const RECEIPT_FIELDS = Object.freeze([
  "schemaVersion",
  "repositoryOwner",
  "repositoryName",
  "baseBranch",
  "branchSlug",
  "artifactRevisionId",
  "prNumber",
  "prUrl",
  "state",
  "isDraft",
]);
const IMMUTABLE_GIT_REVISION = /^[0-9a-f]{40,64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

export function validatePRWorkspaceReceipt(receipt, expected) {
  if (!isPlainObject(receipt) || !isPlainObject(expected)) {
    return { state: "invalid", reason: "receipt_and_expected_workspace_required" };
  }
  if (Object.keys(receipt).length !== RECEIPT_FIELDS.length ||
      RECEIPT_FIELDS.some((field) => !Object.hasOwn(receipt, field))) {
    return { state: "invalid", reason: "receipt_shape_mismatch" };
  }
  const expectedFields = [
    "repositoryOwner", "repositoryName", "baseBranch", "branchSlug", "artifactRevisionId",
  ];
  if (expectedFields.some((field) => typeof expected[field] !== "string" || expected[field].length === 0)) {
    return { state: "invalid", reason: "expected_workspace_invalid" };
  }
  if (receipt.schemaVersion !== 1 || receipt.state !== "OPEN" || receipt.isDraft !== true ||
      !Number.isInteger(receipt.prNumber) || receipt.prNumber < 1 ||
      typeof receipt.prUrl !== "string" || receipt.prUrl.length === 0 ||
      !IMMUTABLE_GIT_REVISION.test(receipt.artifactRevisionId)) {
    return { state: "invalid", reason: "receipt_value_invalid" };
  }
  for (const field of expectedFields) {
    if (receipt[field] !== expected[field]) {
      return { state: "invalid", reason: `receipt_${field}_mismatch` };
    }
  }
  if (Object.hasOwn(expected, "prNumber") && receipt.prNumber !== expected.prNumber) {
    return { state: "invalid", reason: "receipt_prNumber_mismatch" };
  }
  const expectedUrl = `https://github.com/${expected.repositoryOwner}/${expected.repositoryName}/pull/${receipt.prNumber}`;
  if (receipt.prUrl !== expectedUrl) {
    return { state: "invalid", reason: "receipt_prUrl_mismatch" };
  }
  return { state: "valid", receipt: Object.freeze({ ...receipt }) };
}

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
      "--json", "number,title,url,isDraft,state,headRefName,headRefOid,baseRefName",
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
  if (values.length > 0 && matches.length === 0) {
    return { state: "error", reason: "pr_lookup_mismatch" };
  }
  if (matches.length > 1) return { state: "error", reason: "multiple_matching_prs" };
  return { state: "ok", pr: matches[0] ?? null };
}

function verifiedReceipt(plan, artifactRevisionId, pr) {
  const candidate = {
    schemaVersion: 1,
    repositoryOwner: plan.repositoryOwner,
    repositoryName: plan.repositoryName,
    baseBranch: pr?.baseRefName,
    branchSlug: pr?.headRefName,
    artifactRevisionId: pr?.headRefOid,
    prNumber: pr?.number,
    prUrl: pr?.url,
    state: pr?.state,
    isDraft: pr?.isDraft,
  };
  return validatePRWorkspaceReceipt(candidate, {
    repositoryOwner: plan.repositoryOwner,
    repositoryName: plan.repositoryName,
    baseBranch: plan.baseBranch,
    branchSlug: plan.branchSlug,
    artifactRevisionId,
    ...(Number.isInteger(pr?.number) ? { prNumber: pr.number } : {}),
  });
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

  const revision = call(run, commands, "git", ["rev-parse", "HEAD"], { cwd });
  const artifactRevisionId = revision.stdout.trim();
  if (revision.exitCode !== 0 || !IMMUTABLE_GIT_REVISION.test(artifactRevisionId)) {
    return blocked("artifact_revision_unavailable", commands);
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
    const receipt = verified.state === "ok"
      ? verifiedReceipt(plan, artifactRevisionId, verified.pr)
      : { state: "invalid" };
    if (receipt.state !== "valid") {
      return blocked("created_pr_failed_readback", commands);
    }
    return {
      state: "success",
      action: "created_draft_pr",
      prNumber: receipt.receipt.prNumber,
      prUrl: receipt.receipt.prUrl,
      receipt: receipt.receipt,
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
  const verified = readMatchingPRs(run, commands, plan, cwd);
  if (verified.state === "error") return blocked(verified.reason, commands);
  const receipt = verifiedReceipt(plan, artifactRevisionId, verified.pr);
  if (receipt.state !== "valid" || receipt.receipt.prNumber !== lookup.pr.number) {
    return blocked("updated_pr_failed_readback", commands);
  }
  return {
    state: "reused",
    action: "updated_existing_draft_pr",
    prNumber: receipt.receipt.prNumber,
    prUrl: receipt.receipt.prUrl,
    receipt: receipt.receipt,
    commands,
  };
}
