# Document Trail local app

Document Trail turns a Markdown or text document into a small learning journey. It shows one learning step at a time, asks the reviewer to explain the idea back, and exports a V2 educational evidence artifact. It never grants authority or approves repository effects.

The review screen also offers browser-native **Read aloud** controls. The checkpoint button reads only the currently visible learning step; the source button reads the complete source paragraph. No text leaves the browser for an application API.

For smarter checkpoints without an API integration, choose **Copy prompt for any AI**. The generated prompt includes the exact closed V2 JSON contract and the current document. Paste the AI's JSON response back into the app; Document Trail validates it against the source before beginning the review.

Start it locally with one copy-safe command from the repository root:

```sh
npm exec nx run @shield/guided-document-review-local:serve
```

Then open `http://127.0.0.1:4177`. The server binds only to loopback and serves five explicit assets.

Code map:

- `packages/guided-document-review/src/` contains the pure, browser-safe V2 review engine, replacement applier, prompt builder, and artifact contract.
- `src/main.ts` owns setup, draft persistence, transitions, and artifact download.
- `src/render.ts` owns the visible journey, source panel, exact-passage highlight, and one-step-at-a-time card.
- `src/markdown.ts` safely projects Markdown into anchored semantic HTML sections; raw HTML remains disabled.
- `src/sample-review.ts` is the ready-to-review Mission Rail example.
- `scripts/build.mjs` pins the esbuild browser bundle; `scripts/server.mjs` is the local server.

## V2 checkpoint format

```json
{
  "checkpointId": "visible-qa",
  "title": "Proof people can see",
  "learningSteps": [{
    "stepId": "visible-qa-proof",
    "sourceQuote": "must launch the exact candidate",
    "purpose": "Separate visible proof from a passing test.",
    "question": "What evidence would convince you this actually works?",
    "explanation": "Guided QA demonstrates the candidate while preserving what was observed.",
    "whyItMatters": "A credible demo needs visible behavior."
  }]
}
```

The engine validates this as a closed shape. Unknown fields, duplicate IDs, empty values, non-unique source quotes, stale transitions, and replayed event IDs are rejected without changing the session. Completion shows only structured replacement requests. After the reviewer explicitly confirms the educational/document packet, the app can copy a revision prompt or deterministically download revised Markdown; these actions create no implementation authority.

## Mission Rail architecture review

The curated study kit is `review-kits/mission-rail-v2-checkpoints.json`. Pair it with the exact architecture document at `docs/architecture/mission-rail-v1.md` from the `agent/mission-rail-architecture` branch.
