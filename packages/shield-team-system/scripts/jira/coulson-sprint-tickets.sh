#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-triage}"

if [[ "${MODE}" == "-h" || "${MODE}" == "--help" ]]; then
  cat <<'EOF'
Usage: coulson-sprint-tickets.sh [triage|mine-or-sprint|mine|sprint|unclaimed|JQL]

Lists Jira issues for the current sprint, issues assigned to Phil Coulson,
unclaimed issues, or a triage combination of all three. If the first
argument is not one of the built-in modes, it is treated as a raw JQL
string.

Required environment:
  JIRA_BASE_URL
  JIRA_USER_EMAIL
  JIRA_API_TOKEN

Optional environment:
  JIRA_COULSON_EMAIL
  JIRA_MAVERICK_EMAIL   # legacy compatibility alias
  JIRA_MAX_RESULTS
EOF
  exit 0
fi

: "${JIRA_BASE_URL:?Set JIRA_BASE_URL first}"
: "${JIRA_USER_EMAIL:?Set JIRA_USER_EMAIL first}"
: "${JIRA_API_TOKEN:?Set JIRA_API_TOKEN first}"

COULSON_EMAIL="${JIRA_COULSON_EMAIL:-${JIRA_MAVERICK_EMAIL:-}}"
if [[ -z "${COULSON_EMAIL}" ]]; then
  echo "Missing required environment variable: JIRA_COULSON_EMAIL" >&2
  echo "Set JIRA_COULSON_EMAIL to the player email to query assigned issues." >&2
  exit 1
fi
MAX_RESULTS="${JIRA_MAX_RESULTS:-25}"
JIRA_URL="${JIRA_BASE_URL%/}/rest/api/3/search"

case "${MODE}" in
  triage)
    JQL="(assignee = \"${COULSON_EMAIL}\" OR assignee is EMPTY OR sprint in openSprints()) ORDER BY updated DESC"
    ;;
  mine-or-sprint)
    JQL="(assignee = \"${COULSON_EMAIL}\" OR sprint in openSprints()) ORDER BY updated DESC"
    ;;
  mine)
    JQL="assignee = \"${COULSON_EMAIL}\" ORDER BY updated DESC"
    ;;
  sprint)
    JQL="sprint in openSprints() ORDER BY updated DESC"
    ;;
  unclaimed)
    JQL="assignee is EMPTY ORDER BY updated DESC"
    ;;
  *)
    JQL="${MODE}"
    ;;
esac

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
  "${JIRA_URL}" | python3 - <<'PY' "${MODE}" "${COULSON_EMAIL}"
import json
import sys

mode = sys.argv[1]
coulson_email = sys.argv[2]

data = json.load(sys.stdin)
issues = data.get("issues", [])

print(f"Jira Phil Coulson queue ({mode}) for {coulson_email}: {len(issues)} item(s)")
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
