# Experimental tool promotion

Small tools may begin as bounded, ignored, mission-local helpers. Tool creation
does not widen mission scope or authority. At the end of the experiment, use
`shield-ops tool harvest` to preserve the facts needed for a promotion decision
without inventing return on investment.

The registry records the trigger, purpose, inputs, outputs, artifact path,
known time investment, observed reuse, prevented errors, evidence improvement,
and one advisory disposition:

- `discard`: the experiment did not justify retention;
- `retain-local`: useful in the current context but not ready for a supported surface;
- `promotion-candidate`: enough evidence exists to request separate scope and review.

Artifact paths may be absolute or relative to the registry file. The report
preserves the declared path instead of leaking the resolved host path, so a
registry using relative paths produces a portable report. Unknown time
measurements remain `null`; the harvester never turns missing measurements into
zero-cost claims. Its report is create-only when `--output` is supplied and is
always non-authoritative.

Promotion requires its own branch, tests, documentation, review, and human
publication decision. The four preceding operation groups are the first
dogfooded example of this experiment-to-operable path.
