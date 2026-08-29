# Document Trail QA checklist

## Load the review

- [ ] Open the local app at `http://127.0.0.1:4177/`.
- [ ] Load the complete Mission Rail architecture Markdown file.
- [ ] Load the curated Mission Rail checkpoint JSON file.
- [ ] Select **Build my trail** and verify the page returns to the top.
- [ ] Verify the trail contains 12 ordered checkpoints.

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
- [ ] Verify the header wagon advances once per checkpoint and reaches the end when the trail is complete.
- [ ] In curated review, show two or three source-grounded questions one at a time.
- [ ] Give each question a bright source marker and highlight the exact passage that supports it.
- [ ] After an answer is submitted, advance to the next question and move the source highlight with it.
- [ ] Keep the final explain-back step after the multiple-choice sequence.
- [ ] Verify **Read checkpoint** reads only the visible review step.
- [ ] Verify **Read source** reads the complete visible source section.
- [ ] Record an explanation and confirm an empty explanation cannot advance.
- [ ] Add a revision note beside the explanation and verify it remains at disposition.
- [ ] Verify the checkpoint question remains directly above the explanation field.
- [ ] Use **Back** through the checkpoint steps and verify saved answers are retained.
- [ ] Record a confidence level.
- [ ] Choose each disposition at least once during the review.
- [ ] Verify **Needs revision** requires a specific requested change.

## Persistence and evidence

- [ ] Refresh midway and verify the exact review position is restored.
- [ ] Complete all checkpoints and download the review artifact.
- [ ] Verify the artifact contains the source digest, checkpoint-set digest, explanations, confidence, decisions, and requested changes.
- [ ] Verify **Start another document** clears the saved trail and returns to setup.

## Safety and usability

- [ ] Verify the app remains usable by keyboard at desktop and narrow widths.
- [ ] Verify no document text is sent to an external service during the no-AI review.
- [ ] Verify malformed checkpoint JSON fails visibly without starting or altering a review.
