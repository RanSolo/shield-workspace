# Install, initialize, and diagnose V0.3

Install an exact package artifact as a development dependency. For a published
release, replace `<exact-version>` with the Coulson-authorized version:

```sh
npm install --save-dev --save-exact @shield/team-system@<exact-version>
```

During pre-release evaluation, an exact local package tarball produced by
`npm pack` may be used instead. Copy the produced artifact into the adopting
repository and install that exact file:

```sh
npm install --save-dev --save-exact ./shield-team-system-0.1.0.tgz
```

The packed-consumer validation exercises this command's `--save-dev` and
`--save-exact` semantics against the exact generated tarball. Registry
publication is not part of V0.3-3.

Initialization writes configuration schema 3. The default
`signed_human_gates` repository trust profile preserves the existing explicit,
credential-free Coulson and Fitz SHIELD signing bindings and configures only
the GitHub host adapter:

```sh
npx shield init \
  --repository-id owner/repository \
  --repository-trust-profile signed_human_gates \
  --coulson-binding-ref ed25519:sha256:<coulson-spki-digest> \
  --fitz-binding-ref ed25519:sha256:<fitz-spki-digest>
```

Omitting `--repository-trust-profile` selects the same signed-human default and
still requires `--fitz-binding-ref`. For a repository whose required Fitz
review and conditional Simmons feedback remain exclusively on the external
platform, select the explicit Coulson-only profile:

```sh
npx shield init \
  --repository-id owner/repository \
  --repository-trust-profile coulson_only_platform_review \
  --coulson-binding-ref ed25519:sha256:<coulson-spki-digest>
```

That profile accepts exactly one configured SHIELD binding: Coulson. It rejects
Fitz and Simmons binding flags. The profile does not inspect GitHub or Jira,
admit platform state as SHIELD evidence, or report external review satisfied.

Use `--root <path>` to name a repository root explicitly. Use
`--simmons-binding-ref <ref>` only when the repository has configured Simmons as
a conditional product/domain authority. Initialization creates only
`.shield/config.json` and `.shield/.gitignore`. It refuses symlinks, divergent
existing targets, unsupported values, credentials, and unsafe paths. Repeating
the identical command is a no-op.

To configure both admitted hosts, provide the normalized, registry-ordered,
duplicate-free list explicitly:

```sh
npx shield init \
  --repository-id owner/repository \
  --coulson-binding-ref ed25519:sha256:<coulson-spki-digest> \
  --fitz-binding-ref ed25519:sha256:<fitz-spki-digest> \
  --adapters github,atlassian
```

This is repository configuration only. It does not add an executable Atlassian
adapter, discover credentials, call Atlassian, or grant publication authority.
Schema 1 and 2 remain byte-compatible and are not rewritten by ordinary
initialization. After first confirming an identical deterministic schema-3
candidate, migrate either legacy schema explicitly with `--migrate-config`.
Migration uses an exclusive no-follow lock and verified atomic replacement;
`recovery_required` means the operator must inspect the migration state and
must not retry blindly.

When you want SHIELD to capture an initial execution lane profile, add
`--starter-pipeline <minimal|web-app|service-api|database-backed-app|enterprise>`.
In that mode, initialization also writes `.shield/pipeline-profile.json` by
matching the selected starter lanes against real `package.json` scripts. Lanes
without a matching script are recorded as unavailable rather than invented, and
repeating the identical command remains a no-op.

Run deterministic, read-only diagnostics with either human or JSON output:

```sh
npx shield doctor
npx shield doctor --json
```

Exit status `0` means healthy, `1` means a diagnostic failed, and `2` means the
command or environment could not be evaluated. Doctor performs no network
requests and makes no repository changes.

Doctor reports the selected repository trust profile and required cryptographic
seats. Valid schema-1 configuration remains readable as the implicit legacy
`signed_human_gates` profile. Doctor report v2 emits one adjacent adapter check
per configured host. Those checks mean only that repository configuration
admits the host; they do not probe executable code, credentials, authentication,
network access, or host health.

For the local supervised mission workflow, the binding references must be the
content-addressed Ed25519 references described in
[SUPERVISED_MISSION.md](./SUPERVISED_MISSION.md). A future host adapter may
establish human identity through its own trusted binding mechanism without
changing kernel evidence semantics.

## Upgrade, rollback, and uninstall

Configuration migration is explicit; there is no automatic migration.

- Before upgrading, preserve `.shield/config.json`, journals, artifacts, and
  reports, then install the new exact version and run `shield doctor`. An
  unsupported config version fails closed. Schema 1 or 2 may be converted only
  with an equivalent `shield init ... --migrate-config` invocation.
- To roll back package code, reinstall the prior exact version. Do not rewrite
  durable SHIELD evidence to make it appear compatible; restore only from an
  evidence-preserving repository backup when the prior version cannot read it.
- To uninstall package code, use `npm uninstall @shield/team-system`.
  `.shield/` is intentionally preserved. A maintainer may archive or remove it
  only after applying the repository's evidence-retention policy.
