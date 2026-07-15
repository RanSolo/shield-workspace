#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<'EOF'
Usage: draft-product-review-response.sh ISSUE_KEY STATUS_LINE [NEXT_STEP]

Example:
  draft-product-review-response.sh ISSUE_KEY "Implemented and ready for product review" \
    "Please confirm acceptance criteria are satisfied."
EOF
  exit 0
fi

ISSUE_KEY="$1"
STATUS_LINE="$2"
NEXT_STEP="${3:-Awaiting product confirmation.}"

cat <<EOF
Context:
- Jira issue: ${ISSUE_KEY}

Current status:
- ${STATUS_LINE}

Decision or answer:
- [Fill in the team's specific response here.]

Impact:
- [State scope, behavior, release, or documentation impact.]

Next step:
- ${NEXT_STEP}
EOF
