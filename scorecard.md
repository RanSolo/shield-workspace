# SHIELD OPERATIONS SCORECARD

_Persistent scoreboard for AI-controlled and user-controlled missions._

---

## Current Roster

- **Maria Hill (Orchestrator)** — intake, routing, Nx validation, system ops, and scorekeeping
- **Nick Fury (Architect)** — architecture, scope shaping, readiness review
- **Daisy Johnson (Debugger/Recon)** — investigation, evidence gathering, reality checks
- **Melinda May (Implementer)** — disciplined execution inside approved scope
- **Phil Coulson (Human/Player 1)** — human-controlled wildcard who can occupy any seat
- **Leo Fitz (Technical Review)** — external technical review seat for pull request review and merge readiness
- **Jemma Simmons (Product Feedback)** — external product/domain feedback seat for Jira, docs, direct comms, and waiting states

> Naming rule: keep the SHIELD identity first and the responsibility in parentheses.

---

## Rules of Engagement

### 1) Fuel Efficiency
- **Total Tokens** = total token burn across all participating seats in the mission.
- **Successful Token Burn** = total tokens for missions marked `Success`.
- Lower token burn is better.

### 2) Mission Score
Use blended scoring so cheap missions do not beat valuable missions by default.

```text
Mission Score = ((Outcome Points + Quality Bonuses - Penalties) * 1000) / Total Tokens
```

#### Outcome Points
- `Success` = 100
- `Partial` = 45
- `Failed` = 0

#### Quality Bonuses
- `Within approved scope` = +15
- `No rework requested` = +15
- `Focused validation completed` = +10
- `Tests added/updated when appropriate` = +10
- `Docs updated when appropriate` = +5
- `Excellent handoff / debrief clarity` = +5

#### Penalties
- `Scope drift` = -20
- `Approval bypass` = -40
- `Rework loop required` = -15
- `Unverified completion` = -20
- `Mission abort due to preventable confusion` = -10

### 3) Win Conditions
- **Fuel Miser** = lowest token burn among successful missions
- **Top Score** = highest blended Mission Score
- **Clean Kill** = success with no penalties
- **Best Human-Controlled Run** = highest Mission Score with Player 1 controlling a seat
- **Best AI-Controlled Run** = highest Mission Score with all seats AI-controlled

---

## Overall Leaderboard

| Player | Control | Missions | Successes | Success Rate | Avg Tokens | Avg Mission Score | Best Mission Score | Wins |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Maria Hill (Orchestrator) | AI | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Nick Fury (Architect) | AI | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Daisy Johnson (Debugger/Recon) | AI | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Melinda May (Implementer) | AI | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Phil Coulson (Human/Player 1) | User | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Leo Fitz (Technical Review) | External | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| Jemma Simmons (Product Feedback) | External | 0 | 0 | 0% | 0 | 0 | 0 | 0 |

> Add a row when a new callsign or control mode is introduced.

---

## Squadron Standings

### Fuel Efficiency Standings
_Lowest average successful token burn._

| Rank | Callsign | Seat | Control | Avg Successful Tokens | Best Low-Burn Success |
| --- | --- | --- | --- | ---: | ---: |
| 1 | TBD | TBD | TBD | 0 | 0 |
| 2 | TBD | TBD | TBD | 0 | 0 |
| 3 | TBD | TBD | TBD | 0 | 0 |

### Mission Value Standings
_Best cost-vs-outcome blended scoring._

| Rank | Callsign | Seat | Control | Avg Mission Score | Best Mission Score | Success Rate |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | TBD | TBD | TBD | 0 | 0 | 0% |
| 2 | TBD | TBD | TBD | 0 | 0 | 0% |
| 3 | TBD | TBD | TBD | 0 | 0 | 0% |

### Human vs AI

| Controller | Missions | Successes | Avg Tokens | Avg Mission Score | Best Mission Score |
| --- | ---: | ---: | ---: | ---: | ---: |
| User-Controlled | 0 | 0 | 0 | 0 | 0 |
| AI-Controlled | 0 | 0 | 0 | 0 | 0 |

---

## Hall of Fame

- **Lowest Burn Successful Mission:** TBD
- **Highest Mission Score:** TBD
- **Cleanest Feature Mission:** TBD
- **Cleanest Debug Mission:** TBD
- **Best Phil Coulson (Human/Player 1) Run:** TBD
- **Cleanest Fitz Review Gate:** TBD
- **Best AI-Controlled Run:** TBD
- **Steadiest Maria Hill (Orchestrator) Control:** TBD
- **Most Disciplined Nick Fury (Architect):** TBD
- **Sharpest Daisy Johnson (Debugger/Recon) Report:** TBD
- **Coldest Melinda May (Implementer) Finish:** TBD

---

## Medal Case

Award these when deserved:

- **Fuel Miser** — lowest-token successful mission
- **Clean Kill** — success with zero penalties
- **First Pass Kill** — approved plan executed with no rework loop
- **By the Book** — approval gate followed perfectly
- **Ghost Rider** — risky move caught before execution
- **Battle Manager** — Maria Hill handled routing and ops cleanly with minimal token burn
- **Clearance Received** — Fitz review and Simmons feedback were satisfied cleanly with minimal churn
- **Top Cover** — architect prevented downstream confusion
- **Ice Cold Finish** — implementer delivered a tight, disciplined change
- **Picture Perfect Recon** — evidence separated facts from assumptions cleanly
- **Ace Debrief** — excellent After Action Report

---

## Mission Log

### Mission 001 — TEMPLATE

**Mission Name:**  
**Mission Type:** Feature Mission | Debugger Mode | Recon Mission | Hotfix Response | Refactor Pass
**Outcome:** Success | Partial | Failed  
**Threat Level:** Low | Elevated | High | Critical  

#### Flight Crew
- **Maria Hill (Orchestrator):**
- **Leo Fitz (Technical Review):**
- **Jemma Simmons (Product Feedback):**
- **Player 1 Character:**  
- **Player 1 Seat:**  
- **Mode Selection Source:** Automatic / Manual
- **Selected Modes:**
- **Nick Fury (Architect):**
- **Daisy Johnson (Debugger/Recon):**
- **Melinda May (Implementer):**
- **Phil Coulson (Human/Player 1 / Final Authority):**

#### Control Model
- **User-Controlled Seats:**  
- **AI-Controlled Seats:**  

#### Mode Requests
| Requested Mode | Requesting Agent | Reason | Approver | Outcome |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

#### Mode Attachments
| Participating Seat | Attached Modes | Reason |
| --- | --- | --- |
|  |  |  |

#### Token Burn
| Seat | Callsign | Controller | Tokens |
| --- | --- | --- | ---: |
| Maria Hill (Orchestrator) |  |  | 0 |
| Nick Fury (Architect) |  |  | 0 |
| Daisy Johnson (Debugger/Recon) |  |  | 0 |
| Melinda May (Implementer) |  |  | 0 |
| Leo Fitz (Technical Review) |  |  | 0 |
| Jemma Simmons (Product Feedback) |  |  | 0 |
| Phil Coulson (Human/Player 1) |  |  | 0 |
| **Total** |  |  | **0** |

#### Quality Assessment
- **Within approved scope:** Yes / No
- **No rework requested:** Yes / No
- **Focused validation completed:** Yes / No
- **Tests added/updated when appropriate:** Yes / No
- **Docs updated when appropriate:** Yes / No
- **Excellent handoff / debrief clarity:** Yes / No
- **Fitz technical review completed before merge:** Yes / No / Not applicable
- **Simmons feedback required:** Yes / No / Not applicable
- **Simmons source:** Jira product review / Atlassian / Direct comms / Other / Not applicable
- **Simmons communication sent:** Yes / No / Not applicable

#### Penalties Assessed
- Scope drift: 0
- Approval bypass: 0
- Rework loop required: 0
- Unverified completion: 0
- Preventable confusion: 0

#### Scoring
- **Outcome Points:** 0
- **Quality Bonuses:** 0
- **Penalties:** 0
- **Total Tokens:** 0
- **Mission Score:** 0

#### Debrief
- **Mission:**  
- **Result:**  
- **Changes Made:**  
- **Changes Not Made:**  
- **Unexpected Findings:**  
- **Recommended Next Step:**  
- **Fitz Final Review:** Approved / Changes requested / Pending / Not applicable
- **Simmons Communication Outcome:** Sent / Waiting / Resolved / Not applicable

#### Awards
- Medal(s):  

---

## Scorekeeper Notes

- Count only **successful missions** for low-burn win records.
- Log **all missions** for historical accuracy.
- Keep **user-controlled** and **AI-controlled** runs in the same book, but always mark controller explicitly.
- A low-token mission that failed does **not** outrank a successful mission.
- Feature and debug missions should both use the same score formula so results stay comparable.
