PROMPT — Documentation Audit: Incorporate Two-Echelon Warehouse Requirement

Project: MOM Platform (MES / WMS / QMS) — Won Seal Tech

New business requirement (verbatim, treat as authoritative)

The business operates two levels of inventory: a central Warehouse and a staging inventory at each Work Center. Example: the Warehouse holds 100 large rubber sheets. A WO asks Work Center A to produce 20 tires. Work Center A requests 60 sheets from WMS (out of the 100 available) — the system must handle insufficient-stock and expired-stock cases correctly — and those 60 sheets are moved to Work Center A's staging inventory. Production only actually consumes 40 sheets; the remaining 20 stay on hand in that staging inventory, available for future use, not returned to the Warehouse.

Task

Audit every existing project document — stragegy.md, stragegy-update.md (Console addendum), TECH-STACK-DECISION.md, product-doc.md, PROJECT_WORKLOAD_PROGRESS.md, AI_CONTEXT.md, and any WMS-related build prompts or implementation traces already written — and check each one against this requirement. For each document:

State whether it already reflects the two-echelon model (Warehouse ↔ Work Center staging, staging-first allocation, FEFO, insufficient-stock/expired-stock handling) or predates it.
If it predates it, update the relevant section in place — do not leave stale text that contradicts the two-echelon model, and do not create a duplicate/conflicting description elsewhere in the same document.
If a document's WMS domain description (e.g. stragegy.md §1.2's one-line WMS service table) is now too shallow to be accurate, expand it minimally — just enough to state the two-echelon concept and point to the detailed build prompt, not a full re-write of the section.
Flag any document you believe is out of scope for this update and explain why, rather than skipping it silently.
Output

A short change log: one line per document, stating "updated / already aligned / out of scope + reason." Do not restate the full requirement text in every document — one canonical description (in stragegy.md or AI_CONTEXT.md, pick one as the source of truth) and a reference from the others.

---

## Audit Result — 2026-07-22

Canonical source of truth: `AI_CONTEXT.md` §2 contains the permanent two-echelon WMS inventory rule.
`process/stragegy.md` §1.2 now carries the concise architecture summary and points to the detailed
Step 2 prompt/implementation trace.

- `process/stragegy.md`: updated — expanded WMS service table from one-line future sketch into the two-echelon Warehouse ↔ WorkCenter staging model with staging-first allocation and references.
- `process/strategy-update-console-gap.md`: updated — Phase 2 service row now mentions two-echelon WMS and points to the detailed Step 2 prompt.
- `process/TECH-STACK-DECISION.md`: updated — WMS inventory/outbound workload rationale now includes staging-first, FEFO, expired/insufficient-stock handling, and real `stock_check_status`.
- `product-doc/product-doc.md`: updated — WMS backend moved from planned to completed, added WMS Stock Flow and two-echelon behavior summary.
- `process/PROJECT_WORKLOAD_PROGRESS.md`: already aligned — Phase 2 Step 2 is completed and references `implementation/phase-2-2-wms-inventory-stock.md`.
- `AI_CONTEXT.md`: already aligned — permanent WMS two-echelon rule and Step 2 service ownership/endpoints/events already recorded.
- `process/Phase-2-Step-1.md`: updated — added current-state note clarifying its old Step 1 non-goals are historical.
- `process/phase1-3.md`: updated — added current-state note clarifying `stock_check_status` is no longer inert after Phase 2 Step 2.
- `process/Phase-1-Step-4.md`: updated — added current-state note clarifying WMS stock non-goal is historical for Stage B only.
- `process/Phase 1-Step 5.md`: updated — added current-state note clarifying kiosk stock visibility remains UI-deferred while WMS backend now exists.
- `process/Phase-2-Step-1-Patch-&-Step-2.md`: already aligned — this is the detailed authoritative build prompt for the requirement.
- `implementation/phase-2-1-wms-master-data-service.md`: already aligned — includes Step 2 dependency patch note for location purpose/staging reference fields.
- `implementation/phase-2-2-wms-inventory-stock.md`: already aligned — implementation trace and verification evidence for the two-echelon WMS backend.
- Other Phase 0/Phase 1 implementation traces: out of scope — they are historical evidence for completed pre-WMS milestones and do not define current WMS inventory behavior.
