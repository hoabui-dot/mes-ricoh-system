# ADR 0002: i18n Completeness Governance

Date: 2026-07-22

## Status

Accepted

## Context

Phase 1 Step 8 introduced platform i18n contracts and locale switching for `vi`, `en`, `ja`, and `ko`.
Manual QA later found two gaps:

- Static UI copy on MES Console screens was not fully wired to locale bundles.
- Existing seed/master-data strings were mechanically backfilled into the `vi` key, even when the original value might not have been Vietnamese.

Both issues can recur when WMS/QMS introduce their own master data and console screens unless the platform has a permanent gate.

## Decision

Every frontend app must run an automated i18n static coverage scan in CI. New user-facing literals must be sourced from `t()`, `useLocalizedText()`, or a locale bundle. Any intentional non-translatable literal needs an adjacent `i18n-exempt: <reason>` comment.

Every future `varchar` to `LocalizedText` migration must run a language-quality heuristic during the backfill transaction. Suspected mislabeled `vi` values are written to an `i18n_data_quality_flag` sidecar table and routed to a human review queue. The migration must not auto-translate, auto-move, or otherwise mutate the underlying localized value based on the heuristic.

## Consequences

- `LocalizedText` remains a stable wire contract with no review metadata embedded in the JSON value.
- Human data owners resolve or dismiss suspected rows through a review queue.
- A cluster can complete with open flags only when the flags are documented and actively tracked; silently ignoring open flags is not acceptable.
- WMS/QMS inherit this rule before they introduce translatable master data.
