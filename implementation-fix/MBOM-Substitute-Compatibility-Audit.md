# MBOM Substitute Compatibility Audit

Date: 2026-07-30

## Rule

For an MBOM line component, a substitute Item Revision is valid only when:

1. the substitute Revision is `Released` and effective now;
2. it is not the same Revision as the original component;
3. its `item_group` matches the original component group; and
4. its base UOM matches the component UOM, or a Released, open-ended UOM conversion exists.

An incompatible group or missing UOM conversion returns `MBOM_SUBSTITUTE_COMPATIBILITY_INVALID`.
The compatibility exception path is intentional: the request must provide
`compatibility_exception_approved=true` and a non-empty reason, and the substitute becomes
approval-required. It is not a normal compatibility success.

## Target data clarification

`5d7501bf-415c-45c2-90f7-18676cafb476` is an MBOM header, not a line. The current active line under
that header is `9d1c2616-c6fa-43f0-a009-15bda3231b39`, with source Revision `AUDIT-ITEM-20260729-R1`,
group `General`, and UOM `PCS`.

## Script and runtime result

`scripts/verify-mbom-substitute.mjs` resolves either a header ID or a line ID, prints source and
candidate identities, sends an incompatible candidate, and expects HTTP 422 with
`MBOM_SUBSTITUTE_COMPATIBILITY_INVALID`. It then creates a same-group/same-UOM candidate when one is
currently Released, effective, and not already assigned.

Command:

```bash
node scripts/verify-mbom-substitute.mjs
```

Runtime result for the supplied header:

- source: `AUDIT-ITEM-20260729-R1`, `General`, `PCS`;
- invalid candidate: `E2E-WO-FG-01-R1`, `E2E`, `PCS`;
- invalid attempt: HTTP 422, `MBOM_SUBSTITUTE_COMPATIBILITY_INVALID`;
- no compatible unused current candidate was available, so no substitute was inserted.

The UI now excludes the original component and only offers Released, currently effective Revisions.
The backend applies the same effective-date rule, so a future-effective Released Revision cannot be
selected or persisted prematurely.

## Structured error UX

Compatibility rejection now returns structured `details[]` instead of only a code. For example:

```json
{
  "error": "MBOM_SUBSTITUTE_COMPATIBILITY_INVALID",
  "details": [
    { "code": "MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH", "expected_group": "General", "actual_group": "E2E" }
  ]
}
```

MES Console uses the reusable `ValidationErrorToast` component. The toast shows the translated error
message and stable error code, with a `More details` action that expands translated condition failures.
The component accepts a details list through props and can be reused by other validation forms. The
same-group/different-UOM case was also verified and returns the translated UOM-conversion condition.
