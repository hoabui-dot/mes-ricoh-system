# Fix Production Version Code Generation

Date: 2026-07-27

## Root cause

The MES Console Production Version form intentionally submits only the selected
Item Revision, MBOM, Routing, and default flag. The generic master-data create
handler did not generate a business code for `md_production_version`, so the
insert omitted the required `code` column and PostgreSQL returned:

```text
null value in column "code" of relation "md_production_version"
violates not-null constraint
```

## Fix

`services/mes-master-data-service/src/infrastructure/http/master-data.router.ts`
now allocates Production Version codes through the existing atomic
`md_resource_numbering_daily` counter using prefix `PV`. The format is:

```text
PV-YYYYMMDD-NNNN
```

When the form does not submit a name, the generated code is used as the
display name. The selected MBOM/Routing site validation remains unchanged.

## Verification

- Rebuilt and recreated `mes-master-data-service`.
- Created a Production Version through the real API without sending `code` or
  `name`.
- API returned `201` with `PV-20260727-0001`, `Draft`, and the derived site.
- Container started and migrations completed.
- Schema Registry compatibility warning is pre-existing and non-blocking.
