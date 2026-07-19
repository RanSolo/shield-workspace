import { constants } from "node:fs";
import { mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  replayDelegationLog,
  type ContractResult,
  type DelegationLogEntry,
  type DelegationLogProjection,
  type TrustedCoulsonBinding,
} from "./delegation-v1.mjs";

const RELATIVE_PATH = join(".shield", "delegations.jsonl");
const valid = <T,>(value: T): ContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, message: string): ContractResult<T> => ({ state: "invalid", code, errors: [message] });

function paths(repositoryRoot: string) {
  const root = resolve(repositoryRoot);
  const path = resolve(root, RELATIVE_PATH);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) return invalid<never>("unsafe_path", "Delegation log escapes the repository.");
  return valid({ root, path, lockPath: `${path}.lock` });
}

async function confinedRoot(repositoryRoot: string, directory: string): Promise<ContractResult<true>> {
  try {
    const [root, target] = await Promise.all([realpath(repositoryRoot), realpath(directory)]);
    const rel = relative(root, target);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) ? valid(true) : invalid("unsafe_path", "Delegation directory escapes or equals the repository root.");
  } catch (error) { return invalid("delegation_unavailable", `Delegation directory verification failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`); }
}

function parse(text: string, binding: TrustedCoulsonBinding, repositoryId: string): ContractResult<DelegationLogProjection> {
  if (text === "") return replayDelegationLog([], binding, repositoryId);
  if (!text.endsWith("\n")) return invalid("recovery_required", "Delegation log has an incomplete final line.");
  const entries: unknown[] = [];
  for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
    try { entries.push(JSON.parse(line)); }
    catch { return invalid("recovery_required", `Delegation log line ${index + 1} is malformed JSON.`); }
  }
  return replayDelegationLog(entries, binding, repositoryId);
}

async function readFileNoFollow(path: string): Promise<ContractResult<string> | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) return invalid("unsafe_path", "Delegation log must be a regular file.");
    return valid(await handle.readFile("utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    return invalid(code === "ELOOP" ? "unsafe_path" : "delegation_unavailable", `Delegation log read failed: ${code ?? "unknown_error"}.`);
  } finally { await handle?.close().catch(() => undefined); }
}

export async function readDelegationLog(input: { repositoryRoot: string; repositoryId: string; binding: TrustedCoulsonBinding }): Promise<ContractResult<DelegationLogProjection>> {
  const resolved = paths(input.repositoryRoot); if (resolved.state === "invalid") return resolved;
  try { await realpath(dirname(resolved.value.path)); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? valid({entries:[],active:[],revokedRevisionIds:[],supersededRevisionIds:[],lastSequence:-1}) : invalid("delegation_unavailable", "Delegation directory is unavailable."); }
  const confinement = await confinedRoot(input.repositoryRoot, dirname(resolved.value.path)); if (confinement.state === "invalid") return confinement;
  const content = await readFileNoFollow(resolved.value.path); if (content === null) return valid({entries:[],active:[],revokedRevisionIds:[],supersededRevisionIds:[],lastSequence:-1});
  return content.state === "invalid" ? content : parse(content.value, input.binding, input.repositoryId);
}

export async function appendDelegationEntry(input: { repositoryRoot: string; repositoryId: string; binding: TrustedCoulsonBinding; entry: DelegationLogEntry }): Promise<ContractResult<DelegationLogProjection>> {
  const resolved = paths(input.repositoryRoot); if (resolved.state === "invalid") return resolved;
  await mkdir(dirname(resolved.value.path), { recursive: true });
  const confinement = await confinedRoot(input.repositoryRoot, dirname(resolved.value.path)); if (confinement.state === "invalid") return confinement;
  let lock;
  try { lock = await open(resolved.value.lockPath, "wx"); }
  catch (error) { return invalid((error as NodeJS.ErrnoException).code === "EEXIST" ? "delegation_lock_held" : "delegation_unavailable", "Delegation log lock acquisition failed."); }
  try {
    const existing = await readFileNoFollow(resolved.value.path); if (existing?.state === "invalid") return existing;
    const text = existing?.value ?? ""; const current = parse(text, input.binding, input.repositoryId); if (current.state === "invalid") return current;
    if (input.entry.sequence !== current.value.entries.length) return invalid("sequence_invalid", `Delegation sequence must be ${current.value.entries.length}.`);
    const candidate = parse(`${text}${JSON.stringify(input.entry)}\n`, input.binding, input.repositoryId); if (candidate.state === "invalid") return candidate;
    let handle;
    try {
      handle = await open(resolved.value.path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
      if (!(await handle.stat()).isFile()) return invalid("unsafe_path", "Delegation log must be a regular file.");
      const line = `${JSON.stringify(input.entry)}\n`; const write = await handle.write(line, null, "utf8");
      if (write.bytesWritten !== Buffer.byteLength(line)) return invalid("recovery_required", "Delegation log append was incomplete.");
      await handle.sync();
    } catch (error) { return invalid((error as NodeJS.ErrnoException).code === "ELOOP" ? "unsafe_path" : "recovery_required", "Delegation log append or sync failed."); }
    finally { await handle?.close().catch(() => undefined); }
    return candidate;
  } finally { await lock.close().catch(() => undefined); await unlink(resolved.value.lockPath).catch(() => undefined); }
}
