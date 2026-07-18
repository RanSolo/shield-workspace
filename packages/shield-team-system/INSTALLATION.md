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

Initialize the current repository with explicit, credential-free references to
the required human authority bindings:

```sh
npx shield init \
  --repository-id owner/repository \
  --coulson-binding-ref github:user:coulson \
  --fitz-binding-ref github:user:fitz
```

Use `--root <path>` to name a repository root explicitly. Use
`--simmons-binding-ref <ref>` only when the repository has configured Simmons as
a conditional product/domain authority. Initialization creates only
`.shield/config.json` and `.shield/.gitignore`. It refuses symlinks, divergent
existing targets, unsupported values, credentials, and unsafe paths. Repeating
the identical command is a no-op.

Run deterministic, read-only diagnostics with either human or JSON output:

```sh
npx shield doctor
npx shield doctor --json
```

Exit status `0` means healthy, `1` means a diagnostic failed, and `2` means the
command or environment could not be evaluated. Doctor performs no network
requests and makes no repository changes.

## Upgrade, rollback, and uninstall

V0.3-3 provides documentation only for these lifecycle operations. It does not
provide mutation commands or automatic migrations.

- Before upgrading, preserve `.shield/config.json`, journals, artifacts, and
  reports, then install the new exact version and run `shield doctor`. An
  unsupported config version fails closed until an explicit migration procedure
  is supplied by a later authorized release.
- To roll back package code, reinstall the prior exact version. Do not rewrite
  durable SHIELD evidence to make it appear compatible; restore only from an
  evidence-preserving repository backup when the prior version cannot read it.
- To uninstall package code, use `npm uninstall @shield/team-system`.
  `.shield/` is intentionally preserved. A maintainer may archive or remove it
  only after applying the repository's evidence-retention policy.
