#!/usr/bin/env bash
set -euo pipefail

# Model selection helper
# Provides a seat-first model config plus a compatibility layer for the older
# cheap/standard/strong escalation flow.
# Usage examples:
#   source ./scripts/model/escalation.sh
#   get_seat_model hill
#   get_model cheap
#   escalate_model failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_MODEL_CONFIG="${SCRIPT_DIR}/seat-models.sh"

# Project-local config
# Create scripts/model/seat-models.sh from seat-models.example.sh to set the
# real models available in a given repo or environment.
if [[ -f "${PROJECT_MODEL_CONFIG}" ]]; then
  # shellcheck disable=SC1090
  source "${PROJECT_MODEL_CONFIG}"
fi

# Seat-first routing
# Set these before a mission when you want to swap model assignments.
DAISY_MODEL="${DAISY_MODEL:-ornith-1.0-35b}"
HILL_MODEL="${HILL_MODEL:-ornith-1.0-35b}"
FURY_MODEL="${FURY_MODEL:-gpt-5.3-codex}"
MM_MODEL="${MM_MODEL:-gpt-5.3-codex}"
FITZ_MODEL="${FITZ_MODEL:-${MM_MODEL}}"
SIMMONS_MODEL="${SIMMONS_MODEL:-human}"
COULSON_MODEL="${COULSON_MODEL:-human}"

# Compatibility aliases from earlier naming
STINGER_MODEL="${STINGER_MODEL:-${HILL_MODEL}}"
JESTER_MODEL="${JESTER_MODEL:-${DAISY_MODEL}}"
VIPER_MODEL="${VIPER_MODEL:-${FURY_MODEL}}"
ICEMAN_MODEL="${ICEMAN_MODEL:-${FURY_MODEL}}"
GOOSE_MODEL="${GOOSE_MODEL:-${FITZ_MODEL}}"
MAVERICK_MODEL="${MAVERICK_MODEL:-${COULSON_MODEL}}"

# Tier compatibility
DEFAULT_MODEL="${DEFAULT_MODEL:-${HILL_MODEL}}"
CHEAP_MODEL="${CHEAP_MODEL:-${DAISY_MODEL}}"
STANDARD_MODEL="${STANDARD_MODEL:-${FURY_MODEL}}"
STRONG_MODEL="${STRONG_MODEL:-${MM_MODEL}}"

get_seat_model() {
  case "${1:-hill}" in
    daisy) printf "%s" "${DAISY_MODEL}" ;;
    hill) printf "%s" "${HILL_MODEL}" ;;
    fury) printf "%s" "${FURY_MODEL}" ;;
    mm) printf "%s" "${MM_MODEL}" ;;
    fitz) printf "%s" "${FITZ_MODEL}" ;;
    simmons) printf "%s" "${SIMMONS_MODEL}" ;;
    coulson) printf "%s" "${COULSON_MODEL}" ;;
    stinger) printf "%s" "${STINGER_MODEL}" ;;
    jester) printf "%s" "${JESTER_MODEL}" ;;
    viper) printf "%s" "${VIPER_MODEL}" ;;
    iceman) printf "%s" "${ICEMAN_MODEL}" ;;
    goose) printf "%s" "${GOOSE_MODEL}" ;;
    maverick) printf "%s" "${MAVERICK_MODEL}" ;;
    *) printf "%s" "${HILL_MODEL}" ;;
  esac
}

select_seat_model() {
  local m
  m=$(get_seat_model "${1:-hill}")
  if [[ "${2:-}" == "export" ]]; then
    export SELECTED_MODEL="${m}"
  fi
  printf "%s" "${m}"
}

# Returns the model name for a given tier level: cheap, standard, strong
get_model() {
  case "${1:-default}" in
    cheap) printf "%s" "${CHEAP_MODEL}" ;;
    standard) printf "%s" "${STANDARD_MODEL}" ;;
    strong) printf "%s" "${STRONG_MODEL}" ;;
    *) printf "%s" "${DEFAULT_MODEL}" ;;
  esac
}

# Given a trigger, print the recommended model. Triggers are advisory strings
# that calling code can use to decide whether to escalate.
escalate_model() {
  case "${1:-default}" in
    token_limit|failure|high_risk)
      get_model strong ;;
    code_review)
      get_model standard ;;
    *)
      get_model cheap ;;
  esac
}

# Helper to print a tier model and optionally export it as SELECTED_MODEL
select_model() {
  local m
  m=$(escalate_model "${1:-default}")
  if [[ "${2:-}" == "export" ]]; then
    export SELECTED_MODEL="${m}"
  fi
  printf "%s" "${m}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Model selection helper"
  echo "Seat models:"
  echo "  DAISY_MODEL=${DAISY_MODEL}"
  echo "  HILL_MODEL=${HILL_MODEL}"
  echo "  FURY_MODEL=${FURY_MODEL}"
  echo "  MM_MODEL=${MM_MODEL}"
  echo "  FITZ_MODEL=${FITZ_MODEL}"
  echo "  SIMMONS_MODEL=${SIMMONS_MODEL}"
  echo "  COULSON_MODEL=${COULSON_MODEL}"
  echo
  echo "Tier compatibility:"
  echo "  DEFAULT_MODEL=${DEFAULT_MODEL}"
  echo "  CHEAP_MODEL=${CHEAP_MODEL}"
  echo "  STANDARD_MODEL=${STANDARD_MODEL}"
  echo "  STRONG_MODEL=${STRONG_MODEL}"
  echo
  echo "Examples:"
  echo "  get_seat_model hill -> $(get_seat_model hill)"
  echo "  get_seat_model daisy -> $(get_seat_model daisy)"
  echo "  get_model cheap -> $(get_model cheap)"
  echo "  escalate_model failure -> $(escalate_model failure)"
  exit 0
fi
