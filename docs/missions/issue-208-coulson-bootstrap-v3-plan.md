# Issue #208 — pre-initialization Coulson signer bootstrap v3

## Mission binding

- Mission: `mission:issue-208-coulson-bootstrap-v3`
- Subject: `github:RanSolo/shield-workspace/issue/208`
- Fresh-main base: `c504017afc342cfb10ac9e682f36804e34eb9c9e`
- Branch: `agent/issue-208-coulson-bootstrap-v3`
- Mode: Delivery

## Objective and threat boundary

Finish the smallest supported command that creates a fresh encrypted,
host-local Coulson signer before repository initialization and emits only its
credential-free public binding packet. The command performs no repository
write and grants no authority.

The JavaScript implementation protects against pre-existing symlinks and
non-directories, malformed input, destination collisions, overwrite, and
ordinary storage or cryptographic failure. Its operator precondition is:

> Concurrent mutation of protected signer-storage paths by another process
> running as the same OS user—malicious or accidental—is outside this
> command's confinement guarantee.

Preventing that class requires stronger native or process isolation unavailable
to this JavaScript implementation and remains future out-of-scope work. The
implementation and documentation must not claim race-free ancestor
confinement.

## Frozen command and output

```text
shield mission signer bootstrap \
  --seat coulson \
  --binding-id <canonical-id> \
  --human-principal-id <canonical-id> \
  [--passcode-stdin] [--json]
```

There is no `--root`. Success emits exactly schema version, Coulson seat,
binding ID, human-principal ID, signing-key reference, and public SPKI. It never
emits the signer path, passcode, plaintext private key, or encryption fields.
Failure emits no public packet and uses a fixed path-free classification.

## Frozen implementation

1. Preserve the existing AES-256-GCM, scrypt, Ed25519 key-reference, schema-1
   signer record, repository-bound signer setup, and mission-signing behavior.
2. Validate an exact plain bootstrap input before passcode consumption or key
   generation. Accept only Coulson and distinct binding/principal IDs matching
   `/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/`; reject proxies, accessors,
   inherited/symbol/non-enumerable/missing/extra fields and unknown CLI flags.
3. Reject pre-existing symlink or non-directory `.shield` and `signers`
   components; create and verify real directories at mode `0700`. These checks
   enforce the stated operator precondition but do not claim protection from a
   concurrent same-UID path replacement.
4. Open the final signer path with exclusive `wx`/`O_NOFOLLOW` semantics and
   retain its `FileHandle`. Write completely through that handle, `fchmod` to
   `0600`, `fsync`, and `fstat`; require a regular file with exact mode. Before
   success, `lstat` the pathname and require matching device/inode. Treat close
   failure as recovery-required.
5. After a post-create failure, unlink only when the pathname still resolves to
   the same device/inode as the created handle. Never unlink an existing
   collision, symlink, mismatched inode, or uncertain pathname. A verified
   cleanup returns fixed `creation_failed`; uncertain close, identity, unlink,
   or cleanup returns fixed `recovery_required` guidance. Neither exposes a
   path or public packet.
6. Every success creates a fresh candidate. Never search for, reuse, repair, or
   overwrite an existing signer. Keep deterministic storage/crypto seams
   private to `mission-signer.mts`; do not widen package exports.
7. Documentation states that SHIELD does not emit or store plaintext private
   material, that encrypted signer records are host-local, and that the
   no-concurrent-mutation precondition applies. Fitz remains GitHub platform
   review, Simmons remains conditional external feedback, and #216 owns the
   Coulson-only repository trust profile.

## Exact implementation scope

May may modify only:

1. `packages/shield-team-system/src/mission-signer.mts`
2. `packages/shield-team-system/src/mission-cli.mts`
3. `packages/shield-team-system/tests/supervised-cli.test.mjs`
4. `packages/shield-team-system/SUPERVISED_MISSION.md`

The v3 brief and plan are immutable during implementation. The existing v2
implementation may be reapplied only after this exact plan receives Fury PASS
and fresh Wheels Up authority.

## Required tests

- preserve all v2 success, closed-output, passcode-ordering, hostile-input,
  static-symlink, collision, compatibility, and repository-nonmutation cases;
- restrictive umask is corrected through `fchmod(0600)`;
- partial/write, `fchmod`, `fsync`, `fstat`, and close failures fail closed;
- pathname identity mismatch preserves the foreign target and returns
  recovery-required;
- verified same-inode cleanup succeeds after post-create failure;
- unlink failure returns recovery-required without claiming cleanup;
- existing collisions, symlinks, and mismatched targets are never removed; and
- all error output remains fixed and path-free with no public packet.

## Deterministic validation

Run sequentially, without filtering or hiding failures:

```text
npm run build --workspace @shield/team-system
node --test packages/shield-team-system/tests/supervised-cli.test.mjs
node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

Any serial full-suite failure remains blocking. Do not edit unrelated harness
files or present filtered success as full-suite success.

## Stop conditions

Stop on repository mutation, plaintext private material, passcode disclosure,
signer overwrite, uncertain cleanup reported as success, schema-1 compatibility
break, need for a native helper or public API expansion, or a required path
outside the four implementation files. Do not initialize a work repository,
enter #216, dispatch a work mission, merge, deploy, release, or claim final
acceptance.
