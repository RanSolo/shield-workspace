# Document Trail local app

Document Trail turns a Markdown or text document into a small learning journey. It shows one checkpoint at a time, asks the reviewer to explain the idea back, and exports an educational evidence artifact. It never grants authority or approves repository effects.

The review screen also offers browser-native **Read aloud** controls. The checkpoint button reads only the currently visible learning step; the source button reads the complete source paragraph. No text leaves the browser for an application API.

For smarter checkpoints without an API integration, choose **Copy prompt for any AI**. The generated prompt includes the exact closed JSON contract and the current document. Paste the AI's JSON response back into the app; Document Trail validates it before beginning the review.

Start it locally with one copy-safe command from the repository root:

```sh
npm exec nx run @shield/guided-document-review-local:serve
```

Then open `http://127.0.0.1:4177`. The server binds only to loopback and serves five explicit assets.

Code map:

- `packages/guided-document-review/src/` contains the pure, browser-safe review engine and artifact contract.
- `src/main.ts` owns setup, draft persistence, transitions, and artifact download.
- `src/render.ts` owns the visible journey, source panel, and one-checkpoint-at-a-time card.
- `src/sample-review.ts` is the ready-to-review Mission Rail example.
- `scripts/build.mjs` pins the esbuild browser bundle; `scripts/server.mjs` is the local server.

## Checkpoint format

```json
{
  "checkpointId": "visible-qa",
  "title": "Proof people can see",
  "sourceSearch": "must launch the exact candidate",
  "teaching": "Tests prove contracts. Guided QA demonstrates the experience.",
  "question": "What evidence would convince you this actually works?",
  "whyItMatters": "A credible demo needs visible behavior."
}
```

The engine validates this as a closed shape. Unknown fields, duplicate IDs, empty values, stale transitions, and replayed event IDs are rejected without changing the session.
