# Repository Context Discovery

Use this playbook when the team needs to understand an unfamiliar repository
before choosing a mode, assigning a specialist, or trusting a local-model seat
with repository context.

## Ownership

- **Maria Hill** owns first-pass intake, cheap scans, and context-pack assembly.
- **Daisy Johnson** deepens the investigation when the initial scan is not enough.
- **Nick Fury** decides when the context is sufficient for architecture or risk
  judgment.
- **Melinda May** should not implement until the context pack identifies the relevant
  build, test, and validation commands.
- **Phil Coulson** decides when the repo is too ambiguous, too risky, or too large
  for unattended exploration.

## Goal

Produce a compact, trustworthy context pack that answers:

1. What kind of repository is this?
2. How is it built, tested, and validated?
3. Which files, folders, and systems matter for the current mission?
4. What should the next seat read instead of scanning the whole repo?

## Cheap Intake Pass

Maria Hill starts with cheap, repeatable checks:

```bash
git status -sb
rg --files .
rg -n "scripts|test|lint|build|dev|ci|playwright|jest|vitest|mocha|cypress|storybook|nx|turbo|docker|compose" package.json pnpm-workspace.yaml nx.json turbo.json pyproject.toml Cargo.toml go.mod Gemfile composer.json Makefile Dockerfile docker-compose.yml .github/workflows
```

Then inspect the obvious operating files if present:

- `README.md`
- `package.json`
- workspace manifests such as `pnpm-workspace.yaml`, `nx.json`, `turbo.json`
- language/runtime manifests such as `pyproject.toml`, `Cargo.toml`, `go.mod`,
  `Gemfile`
- CI definitions in `.github/workflows/`
- repo-specific architecture or technical design docs

Do not start by reading dozens of source files. First identify the repo shape.

If the repo is a monorepo, also identify:

- package or app boundaries
- shared libraries
- task runners such as Nx, Turbo, Lage, or custom workspace scripts
- whether validation runs at root, package, or affected-project scope

## Context Pack

Maria Hill should assemble a context pack with four parts:

1. **Repo profile**
   Use [repo-profile-template.md](./repo-context/repo-profile-template.md).
2. **Dependency and runtime stack**
   Record the package manager, primary frameworks, deployment/runtime targets,
   and notable external services.
3. **Testing and validation stack**
   Record test frameworks, lint/type/build commands, E2E tooling, and any
   required local services.
4. **Mission slice**
   List only the files, directories, tickets, commands, and environment facts
   the next seat needs for the current task.

Use [seat-handoff-template.md](./repo-context/seat-handoff-template.md) when
passing context to Daisy Johnson, Daisy, Fury, MM, or Melinda May.

Use [javascript-monorepo-example.md](./repo-context/javascript-monorepo-example.md)
as the reference shape for a completed context pack in a conventional web-app
repository.

## What To Capture

Minimum useful context includes:

- repository purpose
- monorepo vs single-app structure
- package manager and install command
- main runtime(s)
- frontend/backend frameworks
- testing stack
- lint/type/build commands
- deployment/CI shape
- credentials or services required for realistic validation
- active branch and worktree state
- current issue, PR, or mission target

## Dependency Stack Checklist

Capture:

- package manager: `npm`, `pnpm`, `yarn`, `bun`, `pip`, `poetry`, `cargo`, etc.
- primary frameworks: Next.js, React, Express, Django, Nx, Turbo, etc.
- key platform integrations: Vercel, GitHub, Jira, Postgres, Redis, OpenAI,
  LM Studio, Docker, AWS
- whether the repo is local-only, cloud-backed, or hybrid

Do not dump the entire dependency tree. Record only the dependencies that shape
how the repo is developed, run, and validated.

## Non-JavaScript Guidance

Manifest discovery is not enough by itself. Maria Hill must also extract the
install, run, and test entry points that match the stack:

- **Python**
  - inspect `pyproject.toml`, `requirements.txt`, `poetry.lock`, `tox.ini`,
    `noxfile.py`, and `Makefile`
  - identify whether the repo uses `pip`, `poetry`, `uv`, `pipenv`, `tox`, or
    `nox`
  - record the exact test command (`pytest`, `tox -e`, `nox -s`, etc.)
- **Rust**
  - inspect `Cargo.toml`, `Cargo.lock`, workspace members, and any `Makefile`
  - record `cargo test`, `cargo clippy`, `cargo fmt --check`, or workspace
    variants if they exist
- **Go**
  - inspect `go.mod`, `go.work`, `Makefile`, and CI scripts
  - record `go test ./...`, lint tooling, and any code-generation steps
- **Ruby**
  - inspect `Gemfile`, `Gemfile.lock`, `Rakefile`, and framework bin scripts
  - record whether the repo uses `bundle exec rspec`, `rails test`,
    `rubocop`, or custom rake tasks
- **Polyglot / hybrid**
  - capture each runtime separately
  - identify which runtime owns the current mission slice
  - do not hand the entire hybrid stack to the next seat if only one runtime is
    relevant

If the install or test path is still ambiguous after reading the obvious
manifests and CI files, stop and escalate instead of inventing commands.

## Testing Stack Checklist

Capture:

- unit/integration framework: Jest, Vitest, Mocha, Pytest, etc.
- browser or E2E tooling: Playwright, Cypress, RTL, Storybook interaction tests
- lint/type checks
- build command
- smoke-test or preview workflow
- commands that are known to fail or require special env

If there are no tests, say that plainly.

## Command Verification

Before handing commands to another seat, Maria Hill should confirm at least the
shape of the command from the repository itself:

- locate the script in `package.json`, `Makefile`, CI, or repo docs
- confirm whether it is root-level or package-scoped
- note any required env or services
- when safe and inexpensive, dry-run or execute the cheapest validating form

Examples:

- confirm `npm run lint` exists before recommending it
- confirm `nx affected -t test` matches the workspace toolchain
- confirm `pytest` is actually the documented test entry point instead of
  guessing from dependency names

Do not hand Melinda May, Daisy, Fury, or a local model a command that has not been
grounded in the repo.

## Handing Context To The Local Model

When using `scripts/model/ask-local.mjs`, prefer explicit files over freeform
descriptions:

```bash
node scripts/model/ask-local.mjs orchestrator \
  --file mission.md \
  --context README.md \
  --context playbooks/repo-context/repo-profile-template.md
```

Better still, pass the generated mission-specific context files once Maria Hill has
produced them.

The local model should receive:

- the mission prompt
- the repo profile
- the dependency/testing summary
- only the relevant code or docs files

The local model should not be expected to discover the entire repository on its
own.

## Stop Conditions

Stop the discovery pass and escalate when:

- build/test commands remain unclear after inspecting the obvious manifests
- the repo depends on missing credentials or private infrastructure
- multiple packages/apps exist and the mission target is still ambiguous
- the local model begins inventing tools, frameworks, or commands not supported
  by the context
- the team has enough context to proceed and further scanning would be wasteful

## Deliverable

End with:

- completed repo profile
- dependency/testing summary
- exact recommended validation commands
- mission-specific handoff
- open uncertainties

That is the point where Maria Hill hands off to the next seat.
