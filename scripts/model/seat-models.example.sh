#!/usr/bin/env bash

# Copy this file to scripts/model/seat-models.sh and set the models available
# for the current project and environment.

DAISY_MODEL="${DAISY_MODEL:-ornith-1.0-35b}"
HILL_MODEL="${HILL_MODEL:-ornith-1.0-35b}"
FURY_MODEL="${FURY_MODEL:-gpt-5.3-codex}"
MM_MODEL="${MM_MODEL:-gpt-5.3-codex}"

# Optional legacy aliases if you want to override them explicitly.
# STINGER_MODEL="${STINGER_MODEL:-$HILL_MODEL}"
# JESTER_MODEL="${JESTER_MODEL:-$DAISY_MODEL}"
# VIPER_MODEL="${VIPER_MODEL:-$FURY_MODEL}"
# ICEMAN_MODEL="${ICEMAN_MODEL:-$FURY_MODEL}"
# GOOSE_MODEL="${GOOSE_MODEL:-$MM_MODEL}"
# MAVERICK_MODEL="${MAVERICK_MODEL:-human}"
