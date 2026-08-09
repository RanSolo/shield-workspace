# Experimental tool promotion

Small tools may begin as bounded, ignored, mission-local helpers. Tool creation
does not widen mission scope or authority. At the end of the experiment, use
`shield-ops tool harvest` to preserve the facts needed for a promotion decision
without inventing return on investment.

The closed version 1 registry contains exactly `schemaVersion`, `artifactRoot`,
and a nonempty `tools` array. Each tool contains exactly its name, path,
trigger, purpose, string-array inputs and outputs, nullable measurements,
string-array errors prevented and evidence improved, and one advisory
disposition:

- `discard`: the experiment did not justify retention;
- `retain-local`: useful in the current context but not ready for a supported surface;
- `promotion-candidate`: enough evidence exists to request separate scope and review.

`artifactRoot` is a normalized POSIX locator relative to the registry file. Its
canonical, non-symlink target must be the repository's Git root. Every tool
path is a unique, normalized POSIX path relative to that root; absolute paths,
backslashes, traversal, aliases, escapes, symlink components, directories, and
missing artifacts fail closed. After rejecting symlink components, the
harvester canonicalizes every candidate, requires its canonical path to exactly
equal the resolved spelling and remain inside `artifactRoot`, and rejects
canonical-path collisions. This complete preflight occurs before any artifact
content is read. Case-sensitive repositories may therefore preserve distinct
portable paths that differ only by case, while case-insensitive aliases fail
closed. The harvester then reads each accepted artifact once and records only
the declared portable path, byte count, and SHA-256 digest.

The report is a closed, field-by-field sanitized projection. It binds the exact
registry byte snapshot without preserving a host path, so identical registry
and artifact bytes replay identically after the repository moves. Unknown
measurements remain `null` in per-tool and aggregate values. Totals separately
name known subtotals and unknown counts; they never turn missing measurements
into zero-cost claims. Non-finite inputs, unsafe reuse counts, and derived or
aggregate numeric overflow fail closed.

The CLI rejects missing, incomplete, duplicate, and unknown options. Its report
is create-only when `--output` is supplied and is always non-authoritative with
`authority: "none"`.

Promotion requires its own branch, tests, documentation, review, and human
publication decision. The four preceding operation groups are the first
dogfooded example of this experiment-to-operable path.
