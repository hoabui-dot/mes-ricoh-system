# Feedback: Redesign MES MBOM Architecture and Workflow

Date: 2026-07-29

## Feedback on the source requirement

The source requirement correctly identifies the required manufacturing concepts: MBOM Header, hierarchical MBOM Lines, substitutes, Production Version authority, UOM ownership, immutable released structures, and Work Order snapshots. It also correctly requires EBOM and MBOM to remain separate.

The running repository contradicted two literal parts of the request:

- migration `0039_decouple_mbom_from_item_revision` intentionally removed `md_mbom_header.item_revision_id`;
- migration `0030_decouple_routing_ownership` intentionally removed Routing product/site ownership.

Reintroducing those columns would create competing ownership and regress the already implemented Production Version authority model. The implementation therefore keeps MBOM and Routing independent and records the product context at Production Version.

## Decisions

- Item Revision to MBOM remains `0..N`; no database one-to-one constraint was added.
- `MBOMType` was not added. Output type is derived from the Item Revision selected by Production Version, and Raw Material output is blocked.
- Production Version remains the only authoritative combination selector for Work Order creation.
- Historical Work Orders are not rewritten. Their snapshots continue to point to the exact selected MBOM version.
- Existing Released MBOM data was not truncated. One deterministic lifecycle inconsistency was repaired by migration `0049`; no ambiguous component relationship was guessed.

## Verification status

Backend schema, validation, detail, replacement and release boundaries are implemented and runtime-verified. Console hydration and validation action are implemented and the production build is verified. A full visual wizard, substitute technical-group approval workflow, and a new semi-finished/finished-good end-to-end structure are still open and must not be claimed as complete from build success alone.

