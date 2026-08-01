# Coding Standards

## Naming

- Use business codes for user-facing identities.
- Use UUIDs as internal IDs only.
- Event names follow `<Domain>.<Context>.<Event>.v<version>`.
- Database names should reflect owner and aggregate.

## Folder Conventions

Follow existing service structure. Do not reorganize service folders as part of feature work unless requested.

## API Conventions

- Keep APIs under existing gateway path conventions.
- Preserve `X-Trace-ID`, `X-User-ID`, `X-Role-Code`, and idempotency headers where used.
- Return structured validation errors where possible.
- Handle empty/non-JSON errors on clients.

## Migration Conventions

- Forward-only.
- Do not rewrite applied migrations.
- Prefer additive changes.
- Backfill only when relationships are unambiguous.
- Preserve audit/history.
- Remove legacy surfaces only after all consumers are migrated and verified.

## DTO Conventions

- Localized text stays structured.
- UOM-sensitive quantities respect UOM precision/fraction policy.
- Work Order DTOs should carry snapshots rather than live master-data assumptions.

## Error Conventions

Use stable error codes. Reuse existing codes instead of inventing duplicates. Translate error codes in UI.

## Logging Conventions

Include trace/correlation identity where possible. Do not log credentials, tokens, printer passwords, or sensitive secrets.

## Event Naming

Do not publish desired/future state as implemented fact. Event payloads should include IDs, codes/snapshots as needed, source service, trace ID, and occurred timestamp.

## Commit Style

Unknown: repository-specific commit policy is not documented in the focused evidence. Use clear, scoped commits when requested.

## PR Review Checklist

- Ownership boundary preserved.
- No cross-service DB reads.
- Released/history records not rewritten.
- Backend validation remains authoritative.
- UI does not expose UUIDs.
- Idempotency and retry behavior considered.
- Migration is forward-only.
- Tests or verification match risk.
- Product intent not documented as implemented without source evidence.
