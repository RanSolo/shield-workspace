#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
JIRA_SCRIPT="${ROOT_DIR}/jira/product-review-queue.sh"
COULSON_SCRIPT="${ROOT_DIR}/jira/coulson-sprint-tickets.sh"

echo "=== Fitz/Simmons Review Sweep ==="

echo
echo "-- Jira product review --"
if [[ -n "${JIRA_BASE_URL:-}" && -n "${JIRA_USER_EMAIL:-}" && -n "${JIRA_API_TOKEN:-}" ]]; then
  "${JIRA_SCRIPT}" "${JIRA_PRODUCT_REVIEW_JQL:-status = \"Product Review\" ORDER BY updated DESC}"
else
  echo "Skipped Jira query: set JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN."
fi

echo
echo "-- Phil Coulson sprint or assigned tickets --"
if [[ -n "${JIRA_BASE_URL:-}" && -n "${JIRA_USER_EMAIL:-}" && -n "${JIRA_API_TOKEN:-}" ]]; then
  "${COULSON_SCRIPT}" "${JIRA_COULSON_MODE:-${JIRA_MAVERICK_MODE:-triage}}"
else
  echo "Skipped Phil Coulson Jira query: set JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN."
fi

echo
echo "-- GitHub review queue --"
if command -v gh >/dev/null 2>&1; then
  gh pr list \
    --limit "${GH_REVIEW_LIMIT:-20}" \
    --search "${GH_REVIEW_SEARCH:-review:required state:open}" \
    --json number,title,reviewDecision,url,headRefName | python3 - <<'PY'
import json
import sys

prs = json.load(sys.stdin)
print(f"GitHub review queue: {len(prs)} PR(s)")
for pr in prs:
    decision = pr.get("reviewDecision") or "PENDING"
    print(f"- PR #{pr['number']} [{decision}] {pr['title']} :: {pr['url']} :: branch={pr['headRefName']}")
PY
else
  echo "Skipped GitHub query: gh CLI is not installed."
fi

echo
echo "-- Fitz/Simmons status prompt --"
cat <<'EOF'
Check for:
- Jira product review waiting on the team
- GitHub review comments or approvals pending
- Atlassian documentation feedback pending
- Direct comms from Jemma Simmons or Leo Fitz to Phil Coulson that need routing
EOF
