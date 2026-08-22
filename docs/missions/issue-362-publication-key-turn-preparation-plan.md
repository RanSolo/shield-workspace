# Issue #362 — canonical publication key-turn preparation

## Exact identity

- Parent objective: #268
- Repository: `RanSolo/shield-workspace`
- Issue: #362
- Planning base: `d2174e32f384c1af1ec2d650ec30a4fbf8f9daec`
- Branch: `agent/issue-362-publication-packet`
- Mission: `mission:issue-362-publication-packet`
- Authority at freeze: planning only

## Observed seam

Issue #349 reached draft publication only after Hill manually authored a fresh
publication mission's `authorize-wheels-up` input. Production validation caught
an unsorted `approvedEffectKeys` vector and rejected an attempted conflicting
publication meaning before the PIN. Once corrected, the existing Wheels Up and
draft-publication rails succeeded.

The repository already owns the downstream clockwork command
`mission publish-reviewed`. Issue #362 must not replace or fork that command,
the final-publication transition, the publication executor, semantic authority
identity, signer, journal, or GitHub adapter. It fills only the earlier missing
constructor for a fresh pending publication mission.

## Bounded outcome

Add one authority-none command:

```text
shield mission prepare-publication \
  --mission-id <fresh-pending-mission-id> \
  --base-branch <operator-asserted-default-branch> \
  --root <canonical-root> \
  [--json]
```

The caller supplies mission identity, the canonical root, and a base-branch
equality assertion. The caller supplies no authorization JSON, path, action,
effect, capability, validation, model, runtime, executor, publication meaning,
or authority field.

The command derives and preflights one canonical
`authorize-wheels-up` input, writes it atomically beneath `.shield/tmp`, reads
back the exact bytes, and returns the packet path/digest plus the exact existing
`mission authorize-wheels-up` command. It never reads a passcode or creates
authority.

## Eligibility and exact derivation

Before writing the prepared packet, require:

1. Exact canonical prepared worktree, configured/origin repository identity,
   attached non-default branch, clean status, and stable HEAD/ref/worktree
   ownership across repeated observation.
2. One schema-9 mission whose brief ID equals `--mission-id`, whose subject and
   repository match configuration, and whose state is fresh pending:
   authorization `waiting`, implementation authority `waiting`, execution
   `not-started`, final acceptance `waiting`, no implementation authority,
   runtime binding, publication authority, or communication request, and one
   pending Coulson mission-authorization requirement.
3. Mission participants include Hill, May, Fury, Coulson and no malformed or
   duplicate seat records. The command does not add participants or repair the
   brief.
4. The configured GitHub repository's canonical default branch equals the
   caller's `--base-branch`; local `origin/<base>` exists. The merge base of
   HEAD and that exact ref is a strict ancestor of HEAD.
5. The merge-base-to-HEAD tree delta is non-empty and stable. Every changed
   entry is a regular repository path accepted by the production publication
   path contract; symlink, gitlink, deletion ambiguity, unsafe path, duplicate,
   path count overflow, or observation drift blocks preparation.

Derive the input exactly as follows:

- `baseRevision` <- exact merge base with the verified default branch.
- `approvedRelativePaths` and `publicationPaths` <- identical canonical
  base-to-HEAD changed paths, sorted with the production path comparator.
- `approvedActionIds` <- literals
  `action:review-publication.execute` and
  `action:review-publication.validate`.
- `approvedEffectClasses` <- literal `verification`.
- `approvedEffectKeys` <- literals
  `effect:review-publication.execute` and
  `effect:review-publication.validate`.
- `approvedCapabilities` <- literals `filesystem_write` and
  `process_execute`.
- `validationCommandIds` <- literals
  `validation:review-publication.exact-head` and
  `validation:review-publication.paths`.
- `modelId` <- literal `model:shield-publication-none`.
- `reasoningRuntimeId` <- literal `runtime:shield-publication-host`.
- `toolExecutorId` <- literal `executor:shield-cli`.

These three execution identities deliberately record that packet preparation
and publication are deterministic host operations, not a model conclusion.
They remain pairwise distinct and distinct from mission seats.

All vectors are canonicalized by constructors and then passed through the
existing exported `validateAuthorizeWheelsUpInput`. The implementation exposes
one authority-none preflight facade from the existing Wheels Up executor that
uses the same private production preparation path as signing, but returns only
a redacted readiness identity. The final authorization command still repeats
the full production preparation before display, after signing, and before the
journal append.

## Atomic packet and replay

- Destination:
  `.shield/tmp/<filesystem-safe-mission-id>-publication-authorize-wheels-up.json`.
- Canonical JSON plus one newline; SHA-256 is over the exact written bytes.
- Create parent safely; reject symlinked/non-directory parents and
  symlinked/non-regular destination files.
- Write a sibling exclusive temporary file, fsync it, rename atomically, fsync
  the parent, and read back through no-follow identity checks.
- Exact replay returns `reused` with the same bytes, digest, and command.
- An existing non-identical packet returns `packet_conflict`; it is never
  overwritten.
- Reobserve configuration, journal bytes/identity, repository, branch, base,
  HEAD, changed paths, worktree receipt, and production preflight immediately
  before rename. Any drift removes the temporary file and returns one closed
  blocked result.

## Output contract

Human mode prints only:

```text
PUBLICATION KEY TURN READY
Mission: <id>
Revision: <short HEAD>
Paths: <count>
Next: <one copy-safe authorize-wheels-up command>
```

JSON mode writes exactly one parseable object to stdout containing schema
version, state (`prepared|reused|blocked`), mission ID, base/HEAD, packet path,
packet byte digest, path count, and a structured next action. It does not emit
raw journal, signer, trust registry, absolute paths beyond the explicitly
selected canonical root/packet, or authority material.

## Smallest implementation inventory

- `packages/shield-team-system/src/publication-key-turn-preparation-v1.mts`
- `packages/shield-team-system/src/authorize-wheels-up-executor-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/publication-key-turn-preparation-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- this plan

No public package export, package dependency, lockfile, mission/authority
schema, journal event, signer, runtime-binding schema, publication identity,
GitHub adapter, final-publication executor, merge, deployment, release, or
final-acceptance change is allowed.

## Acceptance evidence

1. A fresh pending fixture produces a packet accepted unchanged by
   `validateAuthorizeWheelsUpInput` and by the production authority-none
   preflight facade, then reaches the existing PIN boundary on first use.
2. Reproductions of #349's unsorted effect keys and conflicting canonical
   publication meaning cannot be emitted by the constructor.
3. Exact replay performs no second write and returns byte-identical output.
4. Existing conflicting packet, stale receipt, dirty status, default-branch
   mismatch, branch/HEAD/ref drift, base drift, changed-path drift, unsafe tree
   entries, ineligible mission state, config/journal replacement, and failed
   production preflight all stop before packet replacement or signer access.
5. Tests prove the preparation path never reads a signer, requests a PIN,
   appends a journal entry, invokes a model, runs Git publication, or calls
   GitHub.
6. Existing `authorize-wheels-up`, `prepare-next`, and `publish-reviewed`
   behavior remains unchanged.

## Validation

- `npm exec -- nx run @shield/team-system:build`
- focused publication-key-turn, Wheels Up, and supervised-CLI tests
- `npm exec -- nx affected -t build test --base=d2174e32f384c1af1ec2d650ec30a4fbf8f9daec --head=HEAD --exclude=@shield/multiband`
- `git diff --check d2174e32f384c1af1ec2d650ec30a4fbf8f9daec..HEAD`

## Stop conditions

Return to Fury before implementation if the design requires caller-authored
closed-schema fields, a second publication executor, a new authority meaning,
model inference, passcode storage, a journal append during preparation, or any
path outside the frozen inventory.
