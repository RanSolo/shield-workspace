import { constants as fsConstants } from "node:fs";
import { open, lstat, realpath, opendir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const REPOSITORY_TOOL_LIMITS = Object.freeze({
  pathBytes: 512,
  patternBytes: 512,
  readBytes: 65_536,
  readLines: 2_000,
  listItems: 1_000,
  listEntriesScanned: 4_000,
  listDirectories: 256,
  listBytes: 65_536,
  searchMatches: 500,
  searchBytes: 131_072,
  searchLines: 2_000,
  searchTimeoutMs: 5_000,
});

const SENSITIVE_SEGMENTS = new Set([".git", ".ssh", ".aws", ".gnupg", "credentials"]);
const SENSITIVE_BASENAME = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|tokens?(?:\..*)?|auth(?:entication)?(?:\..*)?)$/iu;

function result(code, details = {}) {
  return { state: code === "completed" ? "completed" : "denied", code, ...details };
}

function deadlineExpired(options) {
  return options?.deadline !== undefined && options.clock() >= options.deadline;
}

function rootIdentity(info) {
  return `${info.dev}:${info.ino}`;
}

function boundedText(buffer, maxBytes, maxLines) {
  let end = Math.min(buffer.length, maxBytes);
  let lines = 0;
  for (let index = 0; index < end; index += 1) {
    if (buffer[index] === 0x0a) {
      lines += 1;
      if (lines >= maxLines) { end = index + 1; break; }
    }
  }
  let truncated = end < buffer.length;
  let selected = buffer.subarray(0, end);
  let data;
  for (let trim = 0; trim <= Math.min(3, selected.length); trim += 1) {
    try {
      selected = buffer.subarray(0, end - trim);
      data = new TextDecoder("utf-8", { fatal: true }).decode(selected);
      if (trim > 0) truncated = true;
      break;
    } catch {
      if (trim === Math.min(3, selected.length)) throw new Error("invalid_utf8");
    }
  }
  return { data, bytes: selected.length, lines, truncated };
}

export function validateRepositoryRelativePath(value, { allowDot = false } = {}) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > REPOSITORY_TOOL_LIMITS.pathBytes) return false;
  if (value === ".") return allowDot;
  if (value.length === 0 || isAbsolute(value) || value.includes("\0") || value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isSensitiveRepositoryPath(value) {
  if (typeof value !== "string") return true;
  const segments = value.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
  return segments.some((segment) => SENSITIVE_SEGMENTS.has(segment) || SENSITIVE_BASENAME.test(segment));
}

async function verifyRoot(root) {
  try {
    const [canonical, info] = await Promise.all([realpath(root.input), stat(root.input)]);
    return canonical === root.canonical && info.isDirectory() && rootIdentity(info) === root.identity;
  } catch {
    return false;
  }
}

async function resolveConfined(root, relativePath, { allowDot = false, finalType = "any" } = {}) {
  if (!validateRepositoryRelativePath(relativePath, { allowDot }) || isSensitiveRepositoryPath(relativePath)) return result("path_denied");
  if (!(await verifyRoot(root))) return result("root_identity_changed");
  const segments = relativePath === "." ? [] : relativePath.split("/");
  let current = root.canonical;
  for (const segment of segments) {
    current = join(current, segment);
    let info;
    try { info = await lstat(current); }
    catch { return result("path_unavailable"); }
    if (info.isSymbolicLink()) return result("symlink_denied");
  }
  const escaped = relative(root.canonical, current);
  if (escaped.startsWith(`..${sep}`) || escaped === ".." || isAbsolute(escaped)) return result("path_escape_denied");
  if (finalType !== "any") {
    const info = await lstat(current);
    if (finalType === "file" && !info.isFile()) return result("regular_file_required");
    if (finalType === "directory" && !info.isDirectory()) return result("directory_required");
  }
  return { state: "completed", code: "path_allowed", path: current };
}

async function verifyRg(rgPath, identity, timeoutMs) {
  return new Promise((resolveVerification) => {
    const child = spawn(rgPath, ["--version"], {
      env: { PATH: dirname(rgPath), LANG: "C", LC_ALL: "C" }, shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];
    let bytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1_024) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.on("error", () => { clearTimeout(timer); resolveVerification(false); });
    child.on("close", async (code) => {
      clearTimeout(timer);
      const current = await stat(rgPath).catch(() => null);
      const output = Buffer.concat(chunks).toString("utf8");
      resolveVerification(!timedOut && code === 0 && bytes <= 1_024 && /^ripgrep [0-9]+\./u.test(output) && current?.isFile() && rootIdentity(current) === identity);
    });
  });
}

export async function createRepositoryTools(repositoryRoot, options = {}) {
  const input = resolve(repositoryRoot);
  const canonical = await realpath(input);
  const info = await stat(input);
  if (!info.isDirectory()) throw new Error("repository_root_not_directory");
  const root = { input, canonical, identity: rootIdentity(info) };
  const searchTimeoutMs = options.searchTimeoutMs ?? REPOSITORY_TOOL_LIMITS.searchTimeoutMs;
  const rgInput = options.rgExecutable;
  let rg = null;
  if (rgInput !== undefined) {
    if (typeof rgInput !== "string" || !isAbsolute(rgInput)) throw new Error("rg_executable_invalid");
    const [resolvedRg, rgInfo] = await Promise.all([realpath(rgInput), stat(rgInput)]);
    if (!rgInfo.isFile() || (rgInfo.mode & 0o111) === 0) throw new Error("rg_executable_invalid");
    if (!(await verifyRg(resolvedRg, rootIdentity(rgInfo), options.rgProbeTimeoutMs ?? 2_000))) throw new Error("rg_executable_invalid");
    rg = { path: resolvedRg, identity: rootIdentity(rgInfo) };
  }

  const readFile = async ({ path }, operation = {}) => {
    if (deadlineExpired(operation)) return result("session_timeout");
    const checked = await resolveConfined(root, path, { finalType: "file" });
    if (checked.state !== "completed") return checked;
    let handle;
    try {
      handle = await open(checked.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
      const opened = await handle.stat();
      if (!opened.isFile()) return result("regular_file_required");
      const chunks = [];
      let total = 0;
      let lineCount = 0;
      while (total <= REPOSITORY_TOOL_LIMITS.readBytes && lineCount <= REPOSITORY_TOOL_LIMITS.readLines) {
        if (deadlineExpired(operation)) return result("session_timeout");
        const chunk = Buffer.allocUnsafe(8_192);
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        const slice = chunk.subarray(0, bytesRead);
        chunks.push(slice);
        total += bytesRead;
        for (const byte of slice) if (byte === 0x0a) lineCount += 1;
      }
      const closed = await handle.stat();
      if (rootIdentity(opened) !== rootIdentity(closed) || !(await verifyRoot(root))) return result("filesystem_identity_changed");
      const bounded = boundedText(Buffer.concat(chunks), REPOSITORY_TOOL_LIMITS.readBytes, REPOSITORY_TOOL_LIMITS.readLines);
      return result("completed", bounded);
    } catch {
      return result("read_failed");
    } finally {
      await handle?.close().catch(() => {});
    }
  };

  const listFiles = async ({ directory }, operation = {}) => {
    if (deadlineExpired(operation)) return result("session_timeout");
    const checked = await resolveConfined(root, directory, { allowDot: true, finalType: "directory" });
    if (checked.state !== "completed") return checked;
    const entries = [];
    const pending = [{ absolute: checked.path, relativePath: directory === "." ? "" : directory }];
    let truncated = false;
    let scanned = 0;
    let directories = 0;
    while (pending.length > 0 && entries.length <= REPOSITORY_TOOL_LIMITS.listItems) {
      if (deadlineExpired(operation)) return result("session_timeout");
      if (directories >= REPOSITORY_TOOL_LIMITS.listDirectories || scanned >= REPOSITORY_TOOL_LIMITS.listEntriesScanned) { truncated = true; break; }
      const next = pending.shift();
      directories += 1;
      const children = [];
      const directoryHandle = await opendir(next.absolute);
      for await (const child of directoryHandle) {
        if (deadlineExpired(operation)) return result("session_timeout");
        scanned += 1;
        children.push(child);
        if (scanned >= REPOSITORY_TOOL_LIMITS.listEntriesScanned) { truncated = true; break; }
      }
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const childRelative = next.relativePath ? `${next.relativePath}/${child.name}` : child.name;
        if (child.isSymbolicLink() || isSensitiveRepositoryPath(childRelative)) continue;
        if (child.isDirectory()) pending.push({ absolute: join(next.absolute, child.name), relativePath: childRelative });
        else if (child.isFile()) entries.push(childRelative);
        if (entries.length > REPOSITORY_TOOL_LIMITS.listItems) { truncated = true; break; }
      }
    }
    entries.sort();
    let selected = entries.slice(0, REPOSITORY_TOOL_LIMITS.listItems);
    while (Buffer.byteLength(selected.join("\n"), "utf8") > REPOSITORY_TOOL_LIMITS.listBytes) {
      selected = selected.slice(0, -1);
      truncated = true;
    }
    if (!(await verifyRoot(root))) return result("root_identity_changed");
    return result("completed", { data: selected.join("\n"), items: selected.length, bytes: Buffer.byteLength(selected.join("\n"), "utf8"), truncated: truncated || selected.length < entries.length });
  };

  const searchRepo = async ({ pattern }, operation = {}) => {
    if (deadlineExpired(operation)) return result("session_timeout");
    if (rg === null) return result("rg_unavailable");
    if (typeof pattern !== "string" || pattern.length === 0 || Buffer.byteLength(pattern, "utf8") > REPOSITORY_TOOL_LIMITS.patternBytes || /[\u0000-\u001f\u007f]/u.test(pattern)) return result("pattern_denied");
    if (!(await verifyRoot(root))) return result("root_identity_changed");
    const rgInfo = await stat(rg.path).catch(() => null);
    if (!rgInfo?.isFile() || rootIdentity(rgInfo) !== rg.identity) return result("rg_identity_changed");
    const args = [
      "--no-config", "--hidden", "--color", "never", "--line-number", "--no-heading",
      "--glob", "!**/.[gG][iI][tT]/**", "--glob", "!**/.[eE][nN][vV]*",
      "--glob", "!**/.[sS][sS][hH]/**", "--glob", "!**/.[aA][wW][sS]/**",
      "--glob", "!**/.[gG][nN][uU][pP][gG]/**", "--glob", "!**/*.[pP][eE][mM]",
      "--glob", "!**/*.[kK][eE][yY]", "--glob", "!**/*.[pP]12", "--glob", "!**/*.[pP][fF][xX]",
      "--glob", "!**/[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL][sS]*",
      "--glob", "!**/[tT][oO][kK][eE][nN]*", "--glob", "!**/[aA][uU][tT][hH]*",
      "--glob", "!**/[iI][dD]_[rR][sS][aA]*", "--glob", "!**/[iI][dD]_[dD][sS][aA]*",
      "--glob", "!**/[iI][dD]_[eE][cC][dD][sS][aA]*", "--glob", "!**/[iI][dD]_[eE][dD]25519*",
      "--", pattern, ".",
    ];
    const execution = await new Promise((resolveExecution) => {
      const child = spawn(rg.path, args, {
        cwd: root.canonical,
        env: { PATH: dirname(rg.path), LANG: "C", LC_ALL: "C" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks = [];
      let total = 0;
      let timedOut = false;
      let capped = false;
      const remaining = operation.deadline === undefined ? searchTimeoutMs : Math.max(1, operation.deadline - operation.clock());
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, Math.min(searchTimeoutMs, remaining));
      child.stdout.on("data", (chunk) => {
        if (capped) return;
        chunks.push(chunk);
        total += chunk.length;
        const lines = chunks.reduce((count, item) => count + [...item].filter((byte) => byte === 0x0a).length, 0);
        if (total > REPOSITORY_TOOL_LIMITS.searchBytes || lines > REPOSITORY_TOOL_LIMITS.searchMatches) {
          capped = true;
          child.kill("SIGKILL");
        }
      });
      child.stderr.resume();
      child.on("error", () => { clearTimeout(timer); resolveExecution(result("search_failed")); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) return resolveExecution(result("search_timeout"));
        if (code !== 0 && code !== 1 && !capped) return resolveExecution(result("search_failed"));
        const bounded = boundedText(Buffer.concat(chunks), REPOSITORY_TOOL_LIMITS.searchBytes, Math.min(REPOSITORY_TOOL_LIMITS.searchLines, REPOSITORY_TOOL_LIMITS.searchMatches));
        resolveExecution(result("completed", { ...bounded, matches: bounded.lines, truncated: capped || bounded.truncated }));
      });
    });
    if (!(await verifyRoot(root))) return result("root_identity_changed");
    return execution;
  };

  return Object.freeze({ canonicalRoot: canonical, readFile, listFiles, searchRepo });
}
