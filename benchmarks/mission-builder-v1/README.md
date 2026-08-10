# Mission Builder v1 benchmark fixture

This deterministic fixture compares the five frozen orchestration-cost metrics:
Hill tokens, handoffs, elapsed milliseconds, repeated context reads, and human
interventions. It is contract evidence only; it performs no dispatch or other
external effect.

After building `@shield/team-system`, run:

```sh
node benchmarks/mission-builder-v1/run.mjs
```
