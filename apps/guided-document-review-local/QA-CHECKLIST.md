# Document Trail QA checklist

## Load the review

- [ ] Open the local app at `http://127.0.0.1:4177/`.
- [ ] Load the complete Mission Rail architecture Markdown file.
- [ ] Load the curated Mission Rail V2 checkpoint JSON file.
- [ ] Select **Build my trail** and verify the page returns to the top.
- [ ] Verify the trail contains ordered V2 checkpoints with 1–3 learning steps each.

## Review each checkpoint

- [ ] Verify the source panel shows the complete matching section without truncation.
- [ ] Verify long lists scroll inside a source panel matching the current checkpoint card's height.
- [ ] Verify Markdown renders as safe semantic HTML with one stable DOM section per heading.
- [ ] Verify raw source HTML is displayed as text and cannot execute scripts or event handlers.
- [ ] Verify the complete source excerpt can be copied with one visible action.
- [ ] Verify compact Copy/Read/Stop controls remain visible at the top while source content scrolls.
- [ ] Verify the desktop review shell stays within the viewport and each long panel scrolls internally.
- [ ] Hovering a checkpoint question highlights its source excerpt; clicking reveals the answer before explain-back.
- [ ] On the reveal step, Read checkpoint aloud speaks both the question and its answer.
- [ ] Prove it to yourself retains the hover/highlight/click-reveal question above the explanation field.
- [ ] Verify the header wagon advances once per checkpoint and reaches the end when the trail is complete.
- [ ] Verify the CSS ox team and oversized spinning wagon wheels remain visible across the full progress track.
- [ ] In curated review, show one source-grounded learning step at a time.
- [ ] Give each step a bright source marker and highlight its exact passage.
- [ ] Reveal each step and verify the revealed step remains visible after refresh.
- [ ] After a revealed step is submitted, advance to the next step and move the source highlight with it.
- [ ] Keep the final explain-back, confidence, and disposition steps after learning steps.
- [ ] Verify **Read checkpoint** reads only the visible review step.
- [ ] Verify **Read source** reads the complete visible source section.
- [ ] Record an explanation and confirm an empty explanation cannot advance.
- [ ] At disposition, choose a step and enter a desired replacement plus optional rationale.
- [ ] Verify the original passage is shown as locked and remains tied to the selected step.
- [ ] Use **Back** through the checkpoint steps and verify saved answers are retained.
- [ ] Record a confidence level.
- [ ] Choose each disposition at least once during the review.
- [ ] Verify **Needs revision** requires a specific requested change.

## Persistence and evidence

- [ ] Refresh midway and verify the exact review position is restored.
- [ ] Complete all checkpoints and download the review artifact.
- [ ] Verify the V2 artifact contains source/revised digests and ordered structured replacements.
- [ ] Complete with replacement requests and verify completion shows only the changes, then explicitly confirm educational/document approval.
- [ ] Verify revised Markdown download applies confirmed, non-overlapping replacements deterministically.
- [ ] Complete without replacements and verify the no-change message offers no revision actions.
- [ ] Verify **Start another document** clears the saved trail and returns to setup.

## Safety and usability

- [ ] Verify the app remains usable by keyboard at desktop and narrow widths.
- [ ] Verify no document text is sent to an external service during the no-AI review.
- [ ] Verify educational/document approval never claims implementation, publication, merge, or release authority.
- [ ] Verify malformed checkpoint JSON fails visibly without starting or altering a review.
