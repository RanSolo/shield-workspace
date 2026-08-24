# Issue #384 — exact read/search admission correction

## Exact context

- Repository: `RanSolo/shield-workspace`
- Parent implementation HEAD: `c9e9576cfdae17b116106f879fce786f0b87aaf8`
- Planning base: `a93ab6c406bc4315eb5f1f5bd32f13c970aadbca`
- Live predecessor: Issue #383, HEAD `b120241d0e29f0c7a059e79dfa89966c22cce091`
- Recovery receipt: `receipt:BXq8_kk7dlFZ8P7_-9MQrQOl2onMu1nR`
- Recovery evidence: `sha256:3j8HM0LmVP3ks0lNJhTlJdK0CYkcRZc7Kw7DE8cjuyg`
- Runtime: `@github/copilot-sdk@1.0.11`, model `gpt-5.6-sol`

## Observed cause

The live SDK hook supplies exact registered `read` and `search` arguments as
JSON text. The execution boundary supplies parsed argument objects. Current
`onPreToolUse` forwards the JSON text to an exact-object validator, so every
legitimate immutable read/search is denied before its handler runs. Session
identity matched and no model or agent substitution occurred.

## Bounded correction

1. Add one private bounded decoder/admission helper shared by all custom
   read/search entry surfaces.
2. For string input, enforce a byte cap and parse with the existing
   duplicate-key-rejecting JSON parser. The exact cap is 8,192 UTF-8 bytes,
   measured with `Buffer.byteLength` before parsing, and the admitted argument
   projection has a maximum container depth of 2 (root object plus its scalar
   fields). For non-string input, retain the raw value. Reject parse failure,
   duplicate keys, trailing data, depth above 2, scalar/array/null values, or
   input above 8,192 bytes.
3. Return a validated closed projection:
   - `read`: exact `{ path: string }` whose canonical Git-tree path is present
     in the immutable artifact map;
   - `search`: exact `{ query: string }` or `{ query: string, path: string }`,
     with existing query bounds and optional path restricted to the same map.
4. `onPreToolUse` allows only a valid exact registered `read` or `search` call
   after both the callback session identity and the configured session identity
   match the expected execution identity. It stores one pending admission per
   session containing the canonical tool and projection, then returns that
   projection as `modifiedArgs`. A second pending or concurrent admission,
   unknown tool, namespaced substitution, malformed call, or forbidden call is
   denied and sets the sticky unauthorized flag.
5. Each handler re-admits its received string or object immediately before the
   immutable read/search effect, then requires and consumes the exact pending
   tool/projection match before performing the effect. Missing, stale,
   duplicate, concurrent, or valid-to-valid changed arguments fail closed and
   set the sticky unauthorized flag. Pending state is cleared on rejection and
   checked empty at terminalization; no handler can consume one admission more
   than once.
6. `onPermissionRequest` remains reject-only. `skipPermission: true` is
   unchanged; no permission callback becomes an approval path.
7. Preserve the redacted callback observer, exact one-use #383 recovery,
   execute-once replay, immutable Git-tree binding, model/agent identity checks,
   and all write/shell/web/MCP exclusions.
8. Freeze one additional non-recursive recovery signature for the terminal live
   predecessor `receipt:BXq8_kk7dlFZ8P7_-9MQrQOl2onMu1nR`:
   - terminal entry digest
     `sha256:czI_Kiq9sCml_6YN8l2nbIKYhfzbgUp_9SOqfHCgpQ8`;
   - evidence digest
     `sha256:3j8HM0LmVP3ks0lNJhTlJdK0CYkcRZc7Kw7DE8cjuyg`;
   - packet digest
     `sha256:z1jfC-m15ozX07UHP5hZaUMVNEvvAIIyyWGogi14fdM`;
   - outcome `failed`, error
     `Copilot session identity or policy drifted.`, and sticky unauthorized
     observation `true`;
   - complete claim identity and the prior recovery binding already recorded in
     that receipt/evidence.
   Any mismatch takes the ordinary terminal replay path. Its one permitted
   successor may execute once; that successor is never recoverable and every
   exact retry replays it without another model, session, or tool effect.

## Tests

- Production-faithful live-shaped JSON strings for valid `read` and `search`
  pass pre-tool admission and handler execution.
- Existing object-shaped calls remain compatible.
- Malformed, duplicate-key, trailing, scalar, array, null, oversized, and deep
  JSON inputs fail closed.
- UTF-8 byte boundaries at 8,191, 8,192, and 8,193 bytes, including multibyte
  text, and container-depth boundaries at 2 and 3 are deterministic.
- Extra/missing keys, wrong key combinations, invalid query bounds, traversal,
  `.git`, non-map paths, binary/omitted entries, namespace substitution,
  unknown tools, and MCP remain denied.
- Hook bypass, stale pending state, duplicate consumption, concurrent calls,
  and valid hook decode followed by valid-to-valid changed handler arguments
  fail closed and leave no pending admission at terminalization.
- Every permission request remains rejected, including valid-looking custom
  read/search requests.
- Replay the preserved #383 request through the production dispatcher. It must
  reach a structured Fury `PASS` or `REVISE` handoff instead of policy drift;
  exact retry must replay without another model/session/tool effect.

## Approved implementation paths

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

## Validation

- `npm exec nx run @shield/team-system:build`
- `npm exec nx run @shield/team-system:test:copilot-fury-plan-dispatch`
- `npm exec nx affected -t build,test --base=a93ab6c406bc4315eb5f1f5bd32f13c970aadbca --head=<candidate> --exclude=@shield/multiband`
- warm-cache focused replay
- `git diff --check a93ab6c406bc4315eb5f1f5bd32f13c970aadbca..<candidate>`
- one live #383 recovery successor from the frozen `BXq...` predecessor,
  followed by exact zero-effect replay; the terminal successor cannot recurse
  into another recovery

## Exclusions

No new tool, broad filesystem access, write/edit/shell/Git/web/network/MCP
effect, permission approval, authority change, Fury rubric change, publication,
merge, deployment, release, or final acceptance.
