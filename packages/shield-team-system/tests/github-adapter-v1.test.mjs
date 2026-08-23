import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubFollowUpCandidate,
  createGitHubHumanEvidenceCandidate,
  deliverGitHubCommunication,
  extractGitHubAcceptanceCriteriaV1,
  GITHUB_ISSUE_GRAPHQL_QUERY_V1,
  observeGitHubIssueV1,
  integrateFeatureIntegrationPullRequestV2,
  observeFeatureIntegrationCommitMethodProofV2,
  observeFeatureIntegrationPullRequestProofV2,
  observeFeatureIntegrationTargetProofV2,
} from "../public/github.mjs";
import { projectGitHubIssueObserverEnvironmentV1 } from "../github/adapter-v1.mjs";
import { publicationJournalFixture } from "./fixtures/review-publication-journal.mjs";
import { resolveJournaledPublicationRequest } from "../github/publication-gate.mjs";
import {
  createProfileAwareCommunicationResultEntryV1,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";

const head = "0123456789012345678901234567890123456789";
const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const branchSlug = "codex/issue-28-github-host-adapter";
const missionBriefPath = "docs/missions/issue-28-v0.3-5-github-adapter.md";

function publicationFixture(operation = "publish_status", action = "comment", schemaVersion = 8) {
  const permittedEffects = action === "comment"
    ? ["review.comment.publish"]
    : ["review.branch.push", "review.pull_request.create_draft"];
  const targetRef = action === "comment"
    ? "github:pr:28"
    : `github:repository:RanSolo/shield-workspace` +
      `:branch:${branchSlug}:base:main`;
  return publicationJournalFixture({
    schemaVersion,
    missionId: "mission:fixture",
    subjectId: "issue:28",
    headRevisionId: head,
    baseRevisionId: base,
    branch: branchSlug,
    authorizedPaths: [missionBriefPath],
    permittedEffects,
    operation,
    targetRef,
  });
}

function publication(overrides = {}) {
  return {
    candidateId: "candidate:publication:1",
    sourceRef: "github:pr:28",
    capturedAt: { value: "2026-07-19T06:01:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    prNumber: 28,
    body: "Human-readable mission status for the exact revision.",
    proposedChangedPaths: [missionBriefPath],
    ...overrides,
  };
}

function runner(responses) {
  const calls = [];
  const run = (executable, args, options = {}) => {
    calls.push({ executable, args, options });
    const response = responses.shift();
    assert.ok(response, `Unexpected command: ${executable} ${args.join(" ")}`);
    return response;
  };
  run.calls = calls;
  return run;
}

const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });

function assertAbsentFrom(value, canaries) {
  const serialized = JSON.stringify(value);
  for (const canary of canaries) assert.equal(serialized.includes(canary), false, `unexpected canary: ${canary}`);
}

const scopeChecks = () => [
  ok("/workspace/shield-workspace"), ok("git@github.com:RanSolo/shield-workspace.git"),
  ok(branchSlug), ok(head), ok(base), ok(), ok(`${missionBriefPath}\0`), ok(), ok(),
];
const prScopeChecks = () => [...scopeChecks(), ok(base)];

function v2Runner(responses) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return responses.shift() ?? { status: 1, stdout: "", stderr: "unexpected", errorCode: null };
  };
  run.calls = calls;
  return run;
}
const v2ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "", errorCode: null });

function issueResponse(overrides = {}) {
  const { repository: repositoryOverrides = {}, ...issueOverrides } = overrides;
  return {
    data: {
      repository: {
        id: "R_kgDOExample",
        nameWithOwner: "RanSolo/shield-workspace",
        ...repositoryOverrides,
        issue: {
          id: "I_kwDOExample",
          number: 341,
          url: "https://github.com/RanSolo/shield-workspace/issues/341",
          title: "Profile-aware issue intake",
          body: "## Acceptance criteria\n- [ ] Observe the issue once.\n- [x] Preserve the issue identity.\n",
          state: "OPEN",
          updatedAt: "2026-08-22T12:00:00Z",
          labels: { nodes: [{ name: "zeta" }, { name: "alpha" }] },
          ...issueOverrides,
        },
      },
    },
  };
}

function issueRunner(response) {
  const calls = [];
  const run = (executable, args, options) => {
    calls.push({ executable, args, options });
    return { exitCode: 0, stdout: Buffer.from(response), stderr: Buffer.alloc(0) };
  };
  run.calls = calls;
  return run;
}

const safeObserverOptions = {
  cwd: "/workspace",
  sourceEnv: { PATH: "/safe/bin", XDG_CONFIG_HOME: "/safe/config", XDG_STATE_HOME: "/safe/state" },
  platform: "linux",
  sourceRoot: "/workspace",
  missionRoot: "/mission",
  canonicalizeNoFollow: (value) => value,
  now: () => "2026-08-22T12:01:00Z",
};

test("GitHub issue observer projects only explicit credentials and selected discovery roots", () => {
  const result = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: {
      PATH: "/safe/bin",
      GH_TOKEN: "gh-secret",
      GITHUB_TOKEN: "github-secret",
      GH_HOST: "evil.example",
      GH_ENTERPRISE_TOKEN: "enterprise-secret",
      XDG_CONFIG_HOME: "/safe/config",
      XDG_STATE_HOME: "/safe/state",
      HOME: "/ambient/home",
      SHIELD_CREDENTIAL_CANARY: "ambient-canary",
    },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(result, {
    state: "ready",
    environment: {
      PATH: "/safe/bin",
      LANG: "C",
      LC_ALL: "C",
      GH_PROMPT_DISABLED: "1",
      XDG_CONFIG_HOME: "/safe/config",
      XDG_STATE_HOME: "/safe/state",
      GH_TOKEN: "gh-secret",
      GITHUB_TOKEN: "github-secret",
    },
  });
  assert.equal(Object.hasOwn(result.environment, "GH_HOST"), false);
  assert.equal(Object.hasOwn(result.environment, "SHIELD_CREDENTIAL_CANARY"), false);
});

test("GitHub issue observer blocks relative and effective in-root credential directories across suffix variants", () => {
  const variants = {
    linux: {
      sourceRoot: "/repo",
      missionRoot: "/mission",
      config: [
        ["GH_CONFIG_DIR", []],
        ["XDG_CONFIG_HOME", ["gh"]],
        ["HOME", [".config", "gh"]],
      ],
      state: [
        ["XDG_STATE_HOME", ["gh"]],
        ["HOME", [".local", "state", "gh"]],
      ],
      safeConfig: "/safe/config",
      safeState: "/safe/state",
    },
    win32: {
      sourceRoot: "C:\\repo",
      missionRoot: "C:\\mission",
      config: [
        ["GH_CONFIG_DIR", []],
        ["XDG_CONFIG_HOME", ["gh"]],
        ["APPDATA", ["GitHub CLI"]],
        ["USERPROFILE", [".config", "gh"]],
      ],
      state: [
        ["XDG_STATE_HOME", ["gh"]],
        ["LOCALAPPDATA", ["GitHub CLI"]],
        ["USERPROFILE", [".local", "state", "gh"]],
      ],
      safeConfig: "C:\\safe\\config",
      safeState: "C:\\safe\\state",
    },
  };

  for (const [platform, definition] of Object.entries(variants)) {
    for (const [name, suffix] of definition.config) {
      for (const root of [definition.sourceRoot, definition.missionRoot]) {
        const seen = [];
        const result = projectGitHubIssueObserverEnvironmentV1({
          sourceEnv: { PATH: "/safe/bin", [name]: root, XDG_STATE_HOME: definition.safeState },
          platform,
          sourceRoot: definition.sourceRoot,
          missionRoot: definition.missionRoot,
          canonicalizeNoFollow: (value) => { seen.push(value); return value; },
        });
        assert.deepEqual(result, { state: "blocked", reason: "credential_environment_unsafe" }, `${platform}:${name}:${root}`);
        assert.deepEqual(seen, [pathToolsForTest(platform, root, suffix)], `${platform}:${name}:${root}`);
      }
    }
    for (const [name, suffix] of definition.state) {
      for (const root of [definition.sourceRoot, definition.missionRoot]) {
        const seen = [];
        const result = projectGitHubIssueObserverEnvironmentV1({
          sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: definition.safeConfig, [name]: root },
          platform,
          sourceRoot: definition.sourceRoot,
          missionRoot: definition.missionRoot,
          canonicalizeNoFollow: (value) => { seen.push(value); return value; },
        });
        assert.deepEqual(result, { state: "blocked", reason: "credential_state_unavailable" }, `${platform}:${name}:${root}`);
        assert.deepEqual(seen, [definition.safeConfig, pathToolsForTest(platform, root, suffix)], `${platform}:${name}:${root}`);
      }
    }
    for (const [name] of definition.config) {
      const seen = [];
      const result = projectGitHubIssueObserverEnvironmentV1({
        sourceEnv: { PATH: "/safe/bin", [name]: "relative-config", XDG_STATE_HOME: definition.safeState },
        platform,
        sourceRoot: definition.sourceRoot,
        missionRoot: definition.missionRoot,
        canonicalizeNoFollow: (value) => { seen.push(value); return value; },
      });
      assert.deepEqual(result, { state: "blocked", reason: "credential_environment_unsafe" }, `${platform}:${name}:relative`);
      assert.deepEqual(seen, [], `${platform}:${name}:relative`);
    }
    for (const [name] of definition.state) {
      const seen = [];
      const result = projectGitHubIssueObserverEnvironmentV1({
        sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: definition.safeConfig, [name]: "relative-state" },
        platform,
        sourceRoot: definition.sourceRoot,
        missionRoot: definition.missionRoot,
        canonicalizeNoFollow: (value) => { seen.push(value); return value; },
      });
      assert.deepEqual(result, { state: "blocked", reason: "credential_state_unavailable" }, `${platform}:${name}:relative`);
      assert.deepEqual(seen, [definition.safeConfig], `${platform}:${name}:relative`);
    }
  }
});

function pathToolsForTest(platform, root, suffix) {
  if (platform === "win32") {
    return [root, ...suffix].join("\\").replace(/\\+/gu, "\\");
  }
  return [root, ...suffix].join("/").replace(/\/+/gu, "/");
}

test("GitHub issue observer blocks relative paths, symlink ambiguity, and missing safe state without leaking canaries", () => {
  const canaries = ["secret-canary", "/private/canary/config", "unrelated-path-canary"];
  const relative = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: "relative-config", XDG_STATE_HOME: "/safe/state", GH_TOKEN: canaries[0] },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(relative, { state: "blocked", reason: "credential_environment_unsafe" });
  assertAbsentFrom(relative, canaries);

  const symlink = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: "/safe/config", XDG_STATE_HOME: "/safe/state" },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: () => null,
  });
  assert.deepEqual(symlink, { state: "blocked", reason: "credential_environment_unsafe" });

  const missingState = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: "/safe/config", GH_TOKEN: canaries[0], SHIELD_PATH_CANARY: canaries[1] },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(missingState, { state: "blocked", reason: "credential_state_unavailable" });
  assertAbsentFrom(missingState, canaries);

  for (const [name, reason] of [["GH_CONFIG_DIR", "credential_environment_unsafe"], ["XDG_STATE_HOME", "credential_state_unavailable"]]) {
    const result = projectGitHubIssueObserverEnvironmentV1({
      sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: "/safe/config", XDG_STATE_HOME: "/safe/state", [name]: "" },
      platform: "linux",
      sourceRoot: "/repo",
      missionRoot: "/mission",
      canonicalizeNoFollow: (value) => value,
    });
    assert.deepEqual(result, { state: "blocked", reason }, `empty ${name}`);
  }

  const observed = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    run: () => ({ exitCode: 1, stdout: Buffer.from(canaries.join("\n")), stderr: Buffer.from(canaries.join("\n")) }),
    cwd: "/repo",
    sourceEnv: {
      PATH: "/safe/bin",
      GH_CONFIG_DIR: "/safe/config",
      XDG_STATE_HOME: "/safe/state",
      GH_TOKEN: canaries[0],
      GITHUB_TOKEN: "github-token-canary",
      GH_ENTERPRISE_TOKEN: canaries[0],
      SHIELD_PATH_CANARY: canaries[1],
      UNRELATED_ENV_CANARY: canaries[2],
    },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(observed, { state: "blocked", reason: "host_rejected" });
  assertAbsentFrom(observed, canaries);

  const successful = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    ...safeObserverOptions,
    run: issueRunner(JSON.stringify(issueResponse())),
    cwd: "/repo",
    sourceRoot: "/repo",
    sourceEnv: {
      PATH: "/safe/bin", GH_CONFIG_DIR: "/safe/config", XDG_STATE_HOME: "/safe/state",
      GH_TOKEN: canaries[0], GITHUB_TOKEN: "github-token-canary", GH_ENTERPRISE_TOKEN: canaries[0],
      SHIELD_PATH_CANARY: canaries[1], UNRELATED_ENV_CANARY: canaries[2],
    },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
    now: () => "2026-08-22T12:01:00Z",
  });
  assert.equal(successful.state, "observed");
  assertAbsentFrom(successful, [...canaries, "github-token-canary"]);
});

test("GitHub issue observer honors platform credential precedence and empty token exclusion", () => {
  const unix = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: {
      PATH: "/safe/bin",
      GH_CONFIG_DIR: "/safe/gh-config",
      XDG_CONFIG_HOME: "/lower/xdg-config",
      HOME: "/lower/home",
      XDG_STATE_HOME: "/safe/xdg-state",
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
    },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.equal(unix.state, "ready");
  assert.deepEqual(unix.environment, {
    PATH: "/safe/bin", LANG: "C", LC_ALL: "C", GH_PROMPT_DISABLED: "1",
    GH_CONFIG_DIR: "/safe/gh-config", XDG_STATE_HOME: "/safe/xdg-state",
  });

  const unixFallback = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/safe/bin", XDG_CONFIG_HOME: "/safe/xdg-config", HOME: "/safe/home", HOME_STATE_CANARY: "unrelated" },
    platform: "linux", sourceRoot: "/repo", missionRoot: "/mission", canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(unixFallback.environment).filter(([key]) => !["PATH", "LANG", "LC_ALL", "GH_PROMPT_DISABLED"].includes(key))), {
    XDG_CONFIG_HOME: "/safe/xdg-config", HOME: "/safe/home",
  });

  const windowsAll = {
    PATH: "C:\\safe\\bin",
    GH_CONFIG_DIR: "C:\\safe\\gh-config",
    XDG_CONFIG_HOME: "C:\\lower\\xdg-config",
    APPDATA: "C:\\lower\\appdata",
    USERPROFILE: "C:\\lower\\profile",
    XDG_STATE_HOME: "C:\\safe\\xdg-state",
    LOCALAPPDATA: "C:\\lower\\localappdata",
    GH_TOKEN: "gh-token",
    GITHUB_TOKEN: "github-token",
  };
  const windows = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: windowsAll, platform: "win32", sourceRoot: "C:\\repo", missionRoot: "C:\\mission", canonicalizeNoFollow: (value) => value,
  });
  assert.equal(windows.state, "ready");
  assert.deepEqual(Object.fromEntries(Object.entries(windows.environment).filter(([key]) => !["PATH", "LANG", "LC_ALL", "GH_PROMPT_DISABLED"].includes(key))), {
    GH_CONFIG_DIR: "C:\\safe\\gh-config", XDG_STATE_HOME: "C:\\safe\\xdg-state", GH_TOKEN: "gh-token", GITHUB_TOKEN: "github-token",
  });

  for (const [removed, expected, removeAlso] of [
    ["GH_CONFIG_DIR", "XDG_CONFIG_HOME", []],
    ["XDG_CONFIG_HOME", "APPDATA", ["GH_CONFIG_DIR"]],
    ["APPDATA", "USERPROFILE", ["GH_CONFIG_DIR", "XDG_CONFIG_HOME"]],
  ]) {
    const sourceEnv = { ...windowsAll };
    delete sourceEnv[removed];
    for (const name of removeAlso) delete sourceEnv[name];
    const result = projectGitHubIssueObserverEnvironmentV1({
      sourceEnv, platform: "win32", sourceRoot: "C:\\repo", missionRoot: "C:\\mission", canonicalizeNoFollow: (value) => value,
    });
    assert.equal(result.state, "ready");
    assert.equal(Object.hasOwn(result.environment, expected), true, `${removed} fallback`);
  }
  const stateFallback = { ...windowsAll };
  delete stateFallback.XDG_STATE_HOME;
  const localState = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: stateFallback, platform: "win32", sourceRoot: "C:\\repo", missionRoot: "C:\\mission", canonicalizeNoFollow: (value) => value,
  });
  assert.equal(localState.state, "ready");
  assert.equal(localState.environment.LOCALAPPDATA, windowsAll.LOCALAPPDATA);
  delete stateFallback.LOCALAPPDATA;
  const profileState = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: stateFallback, platform: "win32", sourceRoot: "C:\\repo", missionRoot: "C:\\mission", canonicalizeNoFollow: (value) => value,
  });
  assert.equal(profileState.state, "ready");
  assert.equal(profileState.environment.USERPROFILE, windowsAll.USERPROFILE);
});

test("GitHub issue observer accepts GH_CONFIG_DIR with HOME state fallback", () => {
  const result = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/safe/bin", GH_CONFIG_DIR: "/safe/config", HOME: "/safe/home" },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(result, {
    state: "ready",
    environment: {
      PATH: "/safe/bin", LANG: "C", LC_ALL: "C", GH_PROMPT_DISABLED: "1",
      GH_CONFIG_DIR: "/safe/config", HOME: "/safe/home",
    },
  });
});

test("GitHub issue observer resolves independent Unix and Windows credential roots", () => {
  const cases = [
    {
      platform: "linux",
      sourceEnv: { PATH: "/bin", GH_CONFIG_DIR: "/external/config", HOME: "/external/home" },
      expected: { GH_CONFIG_DIR: "/external/config", HOME: "/external/home" },
    },
    {
      platform: "win32",
      sourceEnv: { PATH: "C:\\bin", XDG_CONFIG_HOME: "C:\\xdg-config", APPDATA: "C:\\app-data", LOCALAPPDATA: "C:\\local-app-data" },
      expected: { XDG_CONFIG_HOME: "C:\\xdg-config", LOCALAPPDATA: "C:\\local-app-data" },
    },
    {
      platform: "win32",
      sourceEnv: { PATH: "C:\\bin", USERPROFILE: "C:\\Users\\fixture" },
      expected: { USERPROFILE: "C:\\Users\\fixture" },
    },
  ];
  for (const { platform, sourceEnv, expected } of cases) {
    const result = projectGitHubIssueObserverEnvironmentV1({
      sourceEnv,
      platform,
      sourceRoot: platform === "win32" ? "C:\\repo" : "/repo",
      missionRoot: platform === "win32" ? "C:\\mission" : "/mission",
      canonicalizeNoFollow: (value) => value,
    });
    assert.equal(result.state, "ready", platform);
    assert.deepEqual(Object.fromEntries(Object.entries(result.environment).filter(([name]) => !["PATH", "LANG", "LC_ALL", "GH_PROMPT_DISABLED"].includes(name))), expected, platform);
  }
});

test("GitHub issue observer blocks unsafe effective credential directories before spawning", () => {
  const calls = [];
  const run = (...args) => { calls.push(args); return { exitCode: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; };
  const blocked = projectGitHubIssueObserverEnvironmentV1({
    sourceEnv: { PATH: "/bin", XDG_CONFIG_HOME: "/repo", HOME: "/external/home" },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(blocked, { state: "blocked", reason: "credential_environment_unsafe" });
  const observed = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    run,
    sourceEnv: { PATH: "/bin", XDG_CONFIG_HOME: "/repo", HOME: "/external/home" },
    platform: "linux",
    sourceRoot: "/repo",
    missionRoot: "/mission",
    canonicalizeNoFollow: (value) => value,
  });
  assert.deepEqual(observed, { state: "blocked", reason: "credential_environment_unsafe" });
  assert.equal(calls.length, 0);
});

test("GitHub issue observer uses one exact authority-none GraphQL read and stable criteria binding", () => {
  const run = issueRunner(JSON.stringify(issueResponse()));
  const result = observeGitHubIssueV1({
    repositoryId: "RanSolo/shield-workspace",
    issueNumber: 341,
    sourceRef: "github:RanSolo/shield-workspace/issues/341",
  }, {
    ...safeObserverOptions,
    run,
  });
  assert.equal(result.state, "observed");
  assert.equal(run.calls.length, 1);
  assert.deepEqual(run.calls[0].args, [
    "api", "graphql", "-f", `query=${GITHUB_ISSUE_GRAPHQL_QUERY_V1}`,
    "-f", "owner=RanSolo", "-f", "repo=shield-workspace", "-F", "number=341",
  ]);
  assert.match(run.calls[0].args[3], /labels\(first: 65\)/u);
  assert.equal(run.calls[0].options.shell, false);
  assert.equal(run.calls[0].options.input, null);
  assert.equal(run.calls[0].options.encoding, "buffer");
  assert.equal(run.calls[0].options.timeoutMs, 15_000);
  assert.equal(run.calls[0].options.maxBuffer, 4 * 1024 * 1024);
  assert.deepEqual(run.calls[0].options.env, {
    PATH: "/safe/bin", LANG: "C", LC_ALL: "C", GH_PROMPT_DISABLED: "1",
    XDG_CONFIG_HOME: "/safe/config", XDG_STATE_HOME: "/safe/state",
  });
  assert.equal(result.observation.authority, "none");
  assert.deepEqual(result.observation.labels, ["alpha", "zeta"]);
  assert.deepEqual(result.observation.acceptanceCriteria.items, [
    "Observe the issue once.", "Preserve the issue identity.",
  ]);
  assert.match(result.observation.issueRevisionId, /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.match(result.observation.acceptanceCriteria.digest, /^sha256:[0-9a-f]{64}$/u);
});

test("GitHub issue observer rejects malformed bytes and JSON before identity or criteria handling", () => {
  const malformedBytes = issueRunner(Buffer.from([0xc3, 0x28]));
  assert.deepEqual(observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", { ...safeObserverOptions, run: malformedBytes }), {
    state: "blocked", reason: "invalid_utf8",
  });
  const malformedJson = issueRunner(Buffer.from('{"data":}'));
  assert.deepEqual(observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", { ...safeObserverOptions, run: malformedJson }), {
    state: "blocked", reason: "malformed_response",
  });
  const duplicateKey = issueRunner(Buffer.from('{"data":{"repository":{"id":"R_kgDOExample","id":"other"}}}'));
  assert.deepEqual(observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", { ...safeObserverOptions, run: duplicateKey }), {
    state: "blocked", reason: "malformed_response",
  });
});

test("GitHub issue observer rejects foreign identity, unavailable issues, and malformed criteria", () => {
  for (const issue of [
    { repository: { nameWithOwner: "Other/repository" } },
    { url: "https://github.com/RanSolo/shield-workspace/issues/342" },
    { id: "I_kwDOExample", state: "CLOSED" },
  ]) {
    const result = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
      ...safeObserverOptions,
      run: issueRunner(JSON.stringify(issueResponse(issue))),
    });
    assert.equal(result.state, "blocked");
  }
  const missing = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    ...safeObserverOptions,
    run: issueRunner(JSON.stringify({ data: { repository: { id: "R_kgDOExample", nameWithOwner: "RanSolo/shield-workspace", issue: null } } })),
  });
  assert.deepEqual(missing, { state: "blocked", reason: "issue_not_found" });
  assert.deepEqual(extractGitHubAcceptanceCriteriaV1("## Acceptance criteria\n- one\n## Acceptance criteria\n- two\n"), {
    state: "blocked", reason: "acceptance_criteria_invalid",
  });
  assert.deepEqual(extractGitHubAcceptanceCriteriaV1("## Acceptance criteria\n- parent\n  - nested\n"), {
    state: "blocked", reason: "acceptance_criteria_invalid",
  });
  assert.deepEqual(extractGitHubAcceptanceCriteriaV1("## Acceptance criteria\n- one\n### Ambiguous subordinate\n- two\n## Follow-up\n"), {
    state: "blocked", reason: "acceptance_criteria_invalid",
  });
  assert.deepEqual(extractGitHubAcceptanceCriteriaV1("## Acceptance criteria\n- one\n### Trailing subordinate\n"), {
    state: "blocked", reason: "acceptance_criteria_invalid",
  });
});

test("GitHub issue observer closes the 64-label boundary and binds label identity", () => {
  const labels = Array.from({ length: 64 }, (_value, index) => ({ name: `label-${String(index).padStart(2, "0")}` }));
  const first = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    ...safeObserverOptions,
    run: issueRunner(JSON.stringify(issueResponse({ labels: { nodes: labels } }))),
  });
  assert.equal(first.state, "observed");
  const changedLabels = labels.map((label, index) => index === 63 ? { name: "label-drift" } : label);
  const second = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    ...safeObserverOptions,
    run: issueRunner(JSON.stringify(issueResponse({ labels: { nodes: changedLabels } }))),
  });
  assert.equal(second.state, "observed");
  assert.notEqual(first.observation.issueRevisionId, second.observation.issueRevisionId);
  const tooMany = observeGitHubIssueV1("github:RanSolo/shield-workspace/issues/341", {
    ...safeObserverOptions,
    run: issueRunner(JSON.stringify(issueResponse({ labels: { nodes: [...labels, { name: "label-64" }] } }))),
  });
  assert.deepEqual(tooMany, { state: "blocked", reason: "issue_identity_mismatch" });
});

test("V2 GitHub proof adapters return closed PR, target, and squash ancestry observations", async () => {
  const firstSource = "a".repeat(40), source = "b".repeat(40), merged = "c".repeat(40), tree = "d".repeat(40);
  const run = v2Runner([
    v2ok({ number: 7, url: "https://github.com/x/y/pull/7", state: "MERGED", isDraft: true, headRefName: "agent/child", headRefOid: source,
      baseRefName: "feature/226", mergedAt: "2029-01-01T00:00:00Z", mergeCommit: { oid: merged }, statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }], commits: [{ oid: firstSource }, { oid: source }] }),
    v2ok([{ number: 7 }]),
    v2ok({ ref: "refs/heads/feature/226", object: { type: "commit", sha: merged } }),
    v2ok({ sha: merged, tree: { sha: tree } }),
    v2ok({ sha: merged, tree: { sha: tree }, parents: [{ sha: head }] }),
    v2ok({ sha: source, tree: { sha: tree }, parents: [{ sha: firstSource }] }),
  ]);
  const options = { run, cwd: "/workspace" };
  const pull = await observeFeatureIntegrationPullRequestProofV2({ repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, challengeId: "challenge:proof" }, options);
  assert.equal(pull.state, "observed"); assert.equal(pull.observation.checkState, "successful");
  assert.equal(Object.hasOwn(pull.observation, "mergeMethod"), false);
  assert.equal(run.calls[0].args[run.calls[0].args.indexOf("--json") + 1].split(",").includes("mergeMethod"), false);
  const target = await observeFeatureIntegrationTargetProofV2({ repositoryId: "RanSolo/shield-workspace", targetRef: "refs/heads/feature/226", challengeId: "challenge:proof" }, options);
  assert.equal(target.state, "observed"); assert.equal(target.observation.headRevision, merged); assert.match(target.observation.treeDigest, /^sha256:[0-9a-f]{64}$/u);
  const method = await observeFeatureIntegrationCommitMethodProofV2({ repositoryId: "RanSolo/shield-workspace", headRevision: merged, priorHeadRevision: head, integrationMethod: "squash", pullRequestCommitHeads: [firstSource, source], challengeId: "challenge:proof" }, options);
  assert.equal(method.observation.integrationMethodEvidence, "verified");
  assert.deepEqual(method.observation.resultingCommitParents, [head]); assert.deepEqual(method.observation.rebasedCommits, []);
  assert.equal(run.calls.every((call) => call.command === "gh" && call.options.cwd === "/workspace" && call.options.input === null), true);
});

test("V2 method adapter returns authenticated ambiguity for structurally indistinguishable one-commit squash", async () => {
  const source = "b".repeat(40), merged = "c".repeat(40), tree = "d".repeat(40);
  const run = v2Runner([
    v2ok({ sha: merged, tree: { sha: tree }, parents: [{ sha: head }] }),
    v2ok({ sha: source, tree: { sha: tree }, parents: [{ sha: head }] }),
  ]);
  const result = await observeFeatureIntegrationCommitMethodProofV2({ repositoryId: "RanSolo/shield-workspace", headRevision: merged,
    priorHeadRevision: head, integrationMethod: "squash", pullRequestCommitHeads: [source], challengeId: "challenge:ambiguous" }, { run, cwd: "/workspace" });
  assert.equal(result.state, "observed");
  assert.equal(result.observation.integrationMethodEvidence, "ambiguous");
});

test("V2 integration adapter uses the supported merge REST endpoint exactly once and preserves uncertainty", async () => {
  const calls = [];
  const run = (command, args, options) => { calls.push({ command, args, options }); return v2ok({ merged: true, sha: head }); };
  const input = { repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, expectedHeadRevision: base,
    targetFeatureBranch: "feature/226", integrationMethod: "squash", challengeId: "challenge:execute" };
  const applied = await integrateFeatureIntegrationPullRequestV2(input, { run, cwd: "/workspace" });
  assert.deepEqual(applied, { state: "effect_result", outcome: "applied", resultingHeadRevision: head });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].args, ["api", "--method", "PUT", "repos/RanSolo/shield-workspace/pulls/7/merge", "-f", "merge_method=squash", "-f", `sha=${base}`]);
  assert.deepEqual(await integrateFeatureIntegrationPullRequestV2({ ...input, targetFeatureBranch: "main" }, { run, cwd: "/workspace" }),
    { state: "blocked", reason: "adapter_unavailable" });
  assert.equal(calls.length, 1);
  const uncertain = await integrateFeatureIntegrationPullRequestV2(input, { cwd: "/workspace",
    run: () => ({ status: 1, stdout: "", stderr: "connection reset", errorCode: "ECONNRESET" }) });
  assert.deepEqual(uncertain, { state: "effect_result", outcome: "uncertain", reason: "network_failed" });
});

test("V2 adapter failure precedence is stable and malformed I/O fails closed", async () => {
  const input = { repositoryId: "RanSolo/shield-workspace", pullRequestId: 7, challengeId: "challenge:proof" };
  const auth = await observeFeatureIntegrationPullRequestProofV2(input, { cwd: "/workspace", run: () => ({ status: 1, stdout: "rate limit", stderr: "authentication required", errorCode: null }) });
  assert.deepEqual(auth, { state: "blocked", reason: "authentication_failed" });
  const malformed = await observeFeatureIntegrationPullRequestProofV2(input, { cwd: "/workspace", run: () => ({ exitCode: 0, stdout: "{}", stderr: "" }) });
  assert.deepEqual(malformed, { state: "blocked", reason: "malformed_response" });
  let calls = 0;
  const extra = await observeFeatureIntegrationPullRequestProofV2({ ...input, extra: true }, { cwd: "/workspace", run: () => { calls += 1; return v2ok({}); } });
  assert.deepEqual(extra, { state: "blocked", reason: "adapter_unavailable" }); assert.equal(calls, 0);
});

test("GitHub performs no effect without an exact journaled request", () => {
  const run = runner([]);
  const result = deliverGitHubCommunication("request:missing", publication(), { run });
  assert.deepEqual(result, { state: "blocked", reason: "journal_loader_required", commands: [] });
  assert.equal(run.calls.length, 0);

  assert.deepEqual(
    deliverGitHubCommunication("request:missing", publication(), {
      run,
      loadJournal: () => [],
    }),
    { state: "blocked", reason: "journal_replay_failed", commands: [] },
  );
});

test("publication gate replays schema 8 and schema 9 while mixed journals fail closed in both directions", () => {
  const legacy = publicationFixture();
  const profileAware = publicationFixture("publish_status", "comment", 9);
  for (const fixture of [legacy, profileAware]) {
    const resolved = resolveJournaledPublicationRequest(fixture.requestId, { loadJournal: fixture.loadJournal });
    assert.equal(resolved.state, "allowed");
    assert.equal(resolved.request.requestId, fixture.request.requestId);
    assert.equal(resolved.request.state, "queued");
    assert.equal(resolved.request.publicationAuthorizationId, fixture.request.publicationAuthorizationId);
    assert.deepEqual(resolved.authority, fixture.authority);
    assert.deepEqual(resolved.usedCandidateIds, []);
    assert.equal(resolved.evaluatedThroughSequence, 3);
  }
  const mixedEightToNine = structuredClone(legacy.entries);
  mixedEightToNine.push({ ...profileAware.entries.at(-1), sequence: mixedEightToNine.length });
  const mixedNineToEight = structuredClone(profileAware.entries);
  mixedNineToEight.push({ ...legacy.entries.at(-1), sequence: mixedNineToEight.length });
  assert.equal(resolveJournaledPublicationRequest(legacy.requestId, { loadJournal: () => mixedEightToNine }).state, "blocked");
  assert.equal(resolveJournaledPublicationRequest(profileAware.requestId, { loadJournal: () => mixedNineToEight }).state, "blocked");
});

test("GitHub adapter consumes a real schema-9 queued publication request", () => {
  const fixture = publicationFixture("publish_status", "comment", 9);
  const run = runner([...scopeChecks(), ok("github:pr:28:comment:schema9")]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({
      candidateId: "candidate:publication:schema9",
      capturedAt: { value: "2026-07-29T10:04:00Z", provenance: "hostTrusted" },
    }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.requestId, fixture.requestId);
  const queued = replayProfileAwareMissionJournal(fixture.entries);
  assert.equal(queued.state, "valid");
  const entry = createProfileAwareCommunicationResultEntryV1({
    projection: queued.value,
    candidate: result.candidate,
  });
  const terminal = replayProfileAwareMissionJournal([...fixture.entries, entry]);
  assert.equal(terminal.state, "valid");
  assert.equal(terminal.value.communication.state, "delivered");
});

test("GitHub publishes human-readable status only at the requested exact head", () => {
  const fixture = publicationFixture();
  const run = runner([...scopeChecks(), ok("github:pr:28:comment:44")]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, "github:pr:28:comment:44");
  assert.equal(run.calls.at(-1).executable, "gh");
  assert.deepEqual(run.calls.at(-1).args.slice(0, 2), ["pr", "comment"]);
  assert.equal(run.calls.at(-1).options.input, publication().body);
});

test("GitHub comment publication exact-matches the journaled PR target", () => {
  const fixture = publicationFixture();
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ prNumber: 29 }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_target_mismatch");
  assert.equal(run.calls.length, 0);
});

test("GitHub preflights exact result identity before any effect", () => {
  const fixture = publicationFixture();
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({
      capturedAt: {
        value: "2026-07-19T06:01Z",
        provenance: "hostTrusted",
      },
    }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_identity_required");
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects stateful publication identity before any effect", () => {
  const fixture = publicationFixture();
  const stateful = publication();
  let reads = 0;
  Object.defineProperty(stateful, "candidateId", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? "candidate:publication:1" : "candidate:publication:changed";
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    stateful,
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_identity_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects stateful effect inputs before any effect", () => {
  const fixture = publicationFixture();
  const stateful = publication();
  let reads = 0;
  Object.defineProperty(stateful, "prNumber", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? 28 : 29;
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    stateful,
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects a stateful mission workspace plan before any effect", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  let reads = 0;
  Object.defineProperty(workspacePlan, "branchSlug", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? branchSlug : "codex/changed";
    },
  });
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ workspacePlan }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(reads, 0);
  assert.equal(run.calls.length, 0);
});

test("GitHub rejects coercible mission workspace values before any effect", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  let coercions = 0;
  const repositoryOwner = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      return coercions === 1 ? "RanSolo" : "Other";
    },
  };
  const workspacePlan = {
    repositoryOwner,
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const run = runner([]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    publication({ workspacePlan }),
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "publication_input_required");
  assert.equal(coercions, 0);
  assert.equal(run.calls.length, 0);
});

test("mission brief publication delegates to the existing draft PR workspace", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const pr = {
    number: 28,
    title: workspacePlan.prTitle,
    url: "https://github.com/RanSolo/shield-workspace/pull/28",
    isDraft: true,
    state: "OPEN",
    headRefName: branchSlug,
    headRefOid: head,
    baseRefName: "main",
  };
  const run = runner([
    ok(branchSlug),
    ok(),
    ok(workspacePlan.missionBriefPath),
    ok(head),
    ok(head),
    ok("[]"),
    ...prScopeChecks(),
    ok(),
    ok(pr.url),
    ok(JSON.stringify([pr])),
  ]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    { ...publication(), workspacePlan },
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "delivered");
  assert.equal(result.candidate.payload.receiptRef, pr.url);
  assert.ok(run.calls.some(({ executable, args }) => executable === "gh" && args[0] === "pr" && args[1] === "create"));
});

test("post-effect PR readback failure produces journal-ready failure evidence", () => {
  const fixture = publicationFixture("publish_mission_brief", "create");
  const workspacePlan = {
    repositoryOwner: "RanSolo",
    repositoryName: "shield-workspace",
    baseBranch: "main",
    branchSlug,
    missionBriefPath,
    prTitle: "feat: add GitHub host adapter",
  };
  const run = runner([
    ok(branchSlug),
    ok(),
    ok(workspacePlan.missionBriefPath),
    ok(head),
    ok(head),
    ok("[]"),
    ...prScopeChecks(),
    ok(),
    ok("https://github.com/RanSolo/shield-workspace/pull/28"),
    { exitCode: 1, stdout: "", stderr: "readback unavailable" },
  ]);
  const result = deliverGitHubCommunication(
    fixture.requestId,
    { ...publication(), workspacePlan },
    { run, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.outcome, "failed");
  assert.equal(result.candidate.payload.failureReason, "host_rejected");
  assert.equal(result.candidate.payload.scopeDigest.startsWith("sha256:"), true);
});

test("GitHub reports stale and unavailable delivery without fabricating evidence", () => {
  const fixture = publicationFixture();
  const staleRun = runner([
    ok("/workspace/shield-workspace"),
    ok("git@github.com:RanSolo/shield-workspace.git"),
    ok(branchSlug),
    ok("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ok(base),
    ok(),
    ok(`${missionBriefPath}\0`),
    ok(),
    ok(),
  ]);
  const stale = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run: staleRun, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(stale.state, "blocked");
  assert.equal(stale.reason, "binding_mismatch");

  const unavailableRun = runner([
    ...scopeChecks(),
    { exitCode: 1, stdout: "", stderr: "not logged into GitHub" },
  ]);
  const unavailable = deliverGitHubCommunication(
    fixture.requestId,
    publication(),
    { run: unavailableRun, loadJournal: fixture.loadJournal, realpath: (value) => value },
  );
  assert.equal(unavailable.state, "candidate");
  assert.equal(unavailable.candidate.payload.outcome, "failed");
  assert.equal(unavailable.candidate.payload.failureReason, "authentication_failed");
});

test("GitHub review input remains a candidate and cannot assign authority", () => {
  const evidence = {
    payload: {
      evidenceId: "evidence:fitz:3",
      missionId: "mission:fixture",
      subjectId: "issue:28",
      revisionId: "sha256:mission-revision",
      humanPrincipalId: "human:fitz",
      bindingId: "binding:fitz",
      sourceRef: "github:pr:28:review:3",
    },
    signatureBase64: "signed",
  };
  const result = createGitHubHumanEvidenceCandidate({
    candidateId: "evidence:fitz:3",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId: "sha256:mission-revision",
    humanPrincipalId: "human:fitz",
    bindingId: "binding:fitz",
    sourceRef: "github:pr:28:review:3",
    capturedAt: { value: "2026-07-19T06:02:00Z", provenance: "hostTrusted" },
    evidence,
  });
  assert.equal(result.state, "candidate");
  assert.equal(Object.hasOwn(result.candidate, "decision"), false);
  assert.equal(Object.hasOwn(result.candidate, "readiness"), false);
});

test("GitHub Follow-up Mode records awaiting-review state at the exact PR head", () => {
  const result = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:awaiting",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:02:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: [],
    findings: [],
  });
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.candidateKind, "follow_up_snapshot");
  assert.equal(result.candidate.payload.lifecycleState, "awaiting_review");
  assert.equal(result.candidate.payload.headRefOid, head);
  assert.equal(result.candidate.humanPrincipalId, null);
  assert.equal(result.candidate.bindingId, null);
});

test("GitHub Follow-up Mode classifies unresolved findings for the owning seat", () => {
  const result = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:required",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:03:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: ["github:pr:71:review:9", "github:pr:71:check:lint"],
    findings: [
      {
        findingId: "finding:implementation:1",
        sourceKind: "review_comment",
        sourceRef: "github:pr:71:comment:100",
        headRefOid: head,
        classification: "implementation",
        blocking: true,
        summary: "May must repair the implementation without broadening scope.",
      },
      {
        findingId: "finding:architecture:1",
        sourceKind: "review",
        sourceRef: "github:pr:71:review:9",
        headRefOid: head,
        classification: "architecture_conformance",
        blocking: true,
        summary: "Fury must re-check conformance because the authority boundary changed.",
      },
      {
        findingId: "finding:evidence:1",
        sourceKind: "check_run",
        sourceRef: "github:pr:71:check:lint",
        headRefOid: head,
        classification: "evidence",
        blocking: false,
        summary: "Daisy should collect missing validation evidence.",
      },
    ],
  });
  assert.equal(result.state, "candidate");
  assert.equal(result.candidate.payload.lifecycleState, "follow_up_required");
  assert.deepEqual(
    result.candidate.payload.findings.map((finding) => [
      finding.findingId,
      finding.routeToSeatId,
      finding.requiresFuryFollowUp,
    ]),
    [
      ["finding:implementation:1", "may", false],
      ["finding:architecture:1", "fury", true],
      ["finding:evidence:1", "daisy", false],
    ],
  );
  assert.deepEqual(result.candidate.payload.replyRequirements, {
    concise: true,
    includeResolution: true,
    includeValidation: true,
    includeUnresolved: true,
  });
});

test("GitHub Follow-up Mode fails closed on stale or malformed review snapshots", () => {
  const stale = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:stale",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:04:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reviewSourceRefs: [],
    findings: [],
  });
  assert.deepEqual(stale, { state: "blocked", reason: "follow_up_head_mismatch", commands: [] });

  const malformed = createGitHubFollowUpCandidate({
    candidateId: "candidate:follow-up:bad",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: head,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:04:00Z", provenance: "hostTrusted" },
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-71-follow-up-mode",
    prNumber: 71,
    headRefOid: head,
    reviewSourceRefs: [],
    findings: [{
      findingId: "finding:bad",
      sourceKind: "review_comment",
      sourceRef: "github:pr:71:comment:bad",
      headRefOid: head,
      classification: "implementation",
      blocking: true,
      summary: "Missing no fields except this object has an unexpected owner.",
      routeToSeatId: "fury",
    }],
  });
  assert.equal(malformed.state, "blocked");
  assert.equal(malformed.reason, "follow_up_finding_malformed");
});
