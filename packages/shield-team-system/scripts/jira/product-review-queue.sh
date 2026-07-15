#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: product-review-queue.sh [JQL]

Lists Jira issues that need product review attention.

Required environment:
  JIRA_BASE_URL
  JIRA_USER_EMAIL
  JIRA_API_TOKEN

Optional environment:
  JIRA_PRODUCT_REVIEW_JQL
  JIRA_MAX_RESULTS
EOF
  exit 0
fi

: "${JIRA_BASE_URL:?Set JIRA_BASE_URL first}"
: "${JIRA_USER_EMAIL:?Set JIRA_USER_EMAIL first}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN first}"

JQL="${1:-${JIRA_PRODUCT_REVIEW_JQL:-status = \"Product Review\" ORDER BY updated DESC}}"
MAX_RESULTS="${JIRA_MAX_RESULTS:-20}"
JIRA_URL="${JIRA_BASE_URL%/}/rest/api/3/search"

payload="$(python3 - <<'PY' "$JQL" "$MAX_RESULTS"
import json
import sys

jql = sys.argv[1]
max_results = int(sys.argv[2])

print(
    json.dumps(
        {
            "jql": jql,
            "maxResults": max_results,
            "fields": [
                "summary",
                "status",
                "assignee",
                "reporter",
                "updated",
                "issuetype",
                "priority",
            ],
        }
    )
)
PY
)"

curl -sfS \
  -u "${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  --data "${payload}" \
  "${JIRA_URL}" | python3 - <<'PY'
import json
import sys

data = json.load(sys.stdin)
issues = data.get("issues", [])

print(f"Jira product review queue: {len(issues)} item(s)")
for issue in issues:
    fields = issue.get("fields", {})
    key = issue.get("key", "UNKNOWN")
    summary = fields.get("summary", "").strip()
    status = (fields.get("status") or {}).get("name", "Unknown")
    priority = (fields.get("priority") or {}).get("name", "Unknown")
    updated = fields.get("updated", "Unknown")
    assignee = (fields.get("assignee") or {}).get("displayName", "Unassigned")
    print(f"- {key} [{status}] ({priority}) {summary} :: assignee={assignee} :: updated={updated}")
PY
