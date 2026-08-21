# NXT-486 guided document review prototype

This is a throwaway/static prototype for SHIELD Guided Review UI behavior, captured from the NXT-486 SARA document review dogfood session.

It demonstrates:

- acceptance-criteria-driven review state;
- one active question at a time;
- moving yellow highlights over the document excerpt;
- PASS / FAIL / CONDITIONAL buttons;
- local browser receipt state;
- a tiny vanilla JavaScript state machine with no framework dependency.

Run locally from this directory:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/
```

The right-hand document is a guided excerpt derived from the Confluence page, not the authoritative source. The prototype links back to Jira and Confluence so a reviewer can verify against the canonical documents.

