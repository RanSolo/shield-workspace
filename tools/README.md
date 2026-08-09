# Tools

## Human-only SHIELD output

`shield-human-output.mjs` removes journal bookkeeping and machine-actionable
diagnostics from SHIELD CLI transcripts. It reports only explicit passcode
decisions, the authority being granted or excluded, and pending human gates.

```bash
node tools/shield-human-output.mjs transcript.txt

shield-auth 242 2>&1 | node tools/shield-human-output.mjs
```

The filter is presentation-only. It does not authorize, sign, reinterpret, or
change mission evidence.

This directory is reserved for workspace-level generators and validation helpers.
Application-specific scripts remain with their owning project.
