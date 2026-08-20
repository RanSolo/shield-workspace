# Guided Document Review — NXT-486

Confluence source: [SARA XML Generation Process Overview](https://asmark.atlassian.net/wiki/spaces/IT/pages/1327661074/SARA+XML+Generation+Process+Overview)

Jira source: [NXT-486](https://asmark.atlassian.net/browse/NXT-486)

## ✅ Checkpoint 1 — Current SARA data-flow map/doc exists

### AC under review

<mark>**A map or document detailing the current SARA data flow is created.**</mark>

### Review focus

Look at the beginning of the Confluence page:

🟨 <mark>**Purpose**</mark>

🟨 <mark>**Quick Summary**</mark>

🟨 <mark>**End-to-End Flow**</mark>

### Highlighted evidence

<mark>The document says it records the current SARA Tier II data flow from the Access `frmAutoXML` form through XML creation and final delivery.</mark>

It also says this is the observed legacy implementation and not a proposed replacement design.

### Question

Does this satisfy the first AC: the document exists and clearly maps the current SARA data flow?

**Status: PASS**

---

## Checkpoint 2 — Access queries and macros are listed/described

### AC under review

<mark>**Access queries and macros involved in the process are listed and their functions described.**</mark>

### Review focus

Look at these Confluence sections:

🟨 <mark>**Command1 / Auto Run**</mark>

🟨 <mark>**Rebuild of per-code staging data**</mark>

🟨 <mark>**Tier II table construction**</mark>

🟨 <mark>**Access Query Mapping**</mark>

### Highlighted evidence

<mark>The document names the Auto Run chain: `Command1`, `mcrAutoPopulateTablesRun`, `mcrAutoPopulateTables`, `mcrProcessSARA`, `mcrPrintProcessEncamp`, and `mcrTier2MakeTablesToExport`.</mark>

<mark>The `Access Query Mapping` section then groups saved queries by function: staging/cleanup, facility identifiers, contacts, phones, chemicals, locations, mixtures, attachments, and state-specific records.</mark>

### Question

Does this satisfy the second AC: the document lists the Access queries/macros involved and describes their functions well enough for a future developer to follow the legacy process?

Reply in chat:

```text
PASS
```

or tell me what wording/detail is missing.
