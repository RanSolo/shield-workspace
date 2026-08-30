# Mission Rail V1 review recovery

Recovered from the Document Trail dogfood conversation on 2026-08-29. This is
reviewer context, not a canonical completed session. Text marked **confirmed**
reflects an explicit direction or accepted framing. Text marked
**reconstructed** summarizes the discussion and should be reviewed by Randy
before import.

## 1. The problem and the promised outcome

**Reconstructed explanation**

The existing system has strong individual guards, but the steps do not compose
into one reliable delivery lifecycle. State, evidence, identity, or authority
can be lost between intake, planning, implementation, validation, and
publication. The new Rail must make those pieces form one small, auditable
happy path.

**Likely disposition:** Looks right; retain the human-readable explanation of
"lifecycle composition."

## 2. The rules that constrain every design

**Confirmed direction**

- Principles 2–10, 12, and 15 were treated as non-negotiable.
- Principle 1 needs a judgment junction when no deterministic safe answer is
  knowable.
- Principle 7's trusted-host boundary is accepted; do not burden the happy path
  with defenses against a malicious same-user process.
- Principle 10 means legacy behavior is evidence, not a requirement. Do not
  recreate recovery paths for failures eliminated by the new architecture.
- Principle 11 should require executable quality checks without coupling the
  kernel to SonarQube specifically.
- Principle 13 must fail closed on an unsafe effect, not stop the entire
  mission. Correctable failures repair, validate, and rejoin.
- Principle 14 needs measurable V1 quality evidence rather than a purely
  subjective "reference quality" claim.

**Reconstructed synthesis**

My non-negotiables are a clear next action, meaningful human gates, stable
reusable lanes, delivery as the outcome, small maintainable components,
Nx-aware execution, portable agent contracts, and Guided Review that lets the
human steer. I would push back whenever governance makes a correctable mistake
terminal, treats evidence as more important than delivery, recreates obsolete
legacy failures, or adds complexity for threats outside our trusted-host
model. When software cannot predict the right recovery, the Rail gathers the
facts, brings Hill and Fury together for a bounded decision, records it, and
continues.

## 3. Identity and the pure mission rail

**Confirmed direction**

Keep canonical JSON, deterministic digests and IDs, primitive validators, and
a boundary with no Git, filesystem, seat, phase, or authority concepts.

Replace "surgically extracting" with this direction:

> Implement the minimal canonical primitives in the new library. Use existing
> tests and known output vectors as behavioral evidence, but do not copy legacy
> mission schemas, lifecycle assumptions, authority rules, or recovery
> machinery. Legacy behavior is evidence, not a requirement.

## 4. Guided Review as the human steering surface

**Confirmed explanation**

Guided Review appears during planning before implementation approval, before
publication to review the exact code and evidence, and during QA when delivered
behavior can be observed. It shows acceptance criteria, exact revision,
proposed or completed changes, supporting evidence, risks or questions, and a
clear review action.

This was classified as **Explain in your own words**, not automatically a
requested document change.

## 5. Deterministic history and reusable lanes

**Confirmed explanation**

The Mission Store is trustworthy mission memory. It records milestones such as
intake completion, planning, review, and human gates so SHIELD can reconstruct
where a mission is and continue correctly after restarts.

**Confirmed requested change**

Retain the technical contracts, but begin with the human purpose and briefly
define specialized terms. Clarify that evidence supports delivery: mistakes
should be recorded and repaired without stopping progress unless they make the
next action unsafe, unauthorized, or materially ambiguous. Move exhaustive
field and rejection details into a technical contract or appendix if they make
the architecture section difficult to understand.

## 6. Effects outside, visibility inside

**Confirmed explanation**

The Mission Host performs real-world actions requested by the Rail. It records
what actually happened and prevents retries from accidentally repeating
successful or uncertain actions. The Rail decides, the Host performs, the Store
records, and Projection explains.

**Confirmed disposition**

The architecture is right. A small clarity improvement may introduce the Host
in human language and define idempotency as safely retrying without performing
the same external effect twice.

