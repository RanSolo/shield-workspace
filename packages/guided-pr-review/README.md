# Guided PR Review

Pure contracts and compilation for acceptance-criteria-aligned pull-request
review. GitHub access, filesystem writes, and UI rendering remain host
responsibilities; the read-only GitHub adapter is a separate workspace package.

The canonical packet binds the review to an exact PR head revision. Its
identity excludes observation time, and every evidence anchor is resolved from
observed PR, issue, file, PR-body, or revision-bound validation input. Authored
explanations, questions, and gaps remain separate guidance.
