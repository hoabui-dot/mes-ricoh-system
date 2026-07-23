# QMS Demo Seed Data

Date: 2026-07-23
Status: Completed

## Command

```bash
npm run seed:qms:demo
```

The script is `scripts/seed-qms-demo.ts`. It uses the two owned QMS database URLs, defaults to the local
Compose host ports `15442` and `15443`, and is safe to run repeatedly. It uses deterministic IDs and
`ON CONFLICT` updates so refreshes do not create duplicate demo records.

## Coverage

Inspection database:

- Six localized defect codes covering `Critical`, `Major`, and `Minor`, including surface crack,
  dimension, hardness, torque, visual mark, and burr examples.
- Four plans covering `Released`, `Draft`, `InReview`, and `Obsolete` states.
- Six characteristics covering Attribute and Variable measurement types with localized names, UOM, target,
  and lower/upper specifications.
- Four results: one pending queue item, one passing result, one failed result, and one historical failed
  result. Seven result details exercise pass/fail, numeric values, defect codes, and comments.
- Local read-model references for the seeded item revision, inspection operation, site, and PCS UOM.

Nonconformance database:

- Four NCRs covering Open, CAPARequired, UnderReview, and Closed states with Critical, Major, and Minor
  severity examples.
- Two disposition records covering Rework with CAPA required and Scrap without CAPA.
- Four CAPAs covering Open, InProgress, Verified, and Closed states.
- Four NCR/CAPA links, including the failed inspection-to-CAPA path.
- Numbering rules and a reserved demo sequence range so subsequent real API-created NCR/CAPA codes do not
  collide with seeded codes.

## Verification

The seed was run twice successfully. Final live counts are:

| Dataset | Count |
|---|---:|
| Demo inspection plans | 4 |
| Demo characteristics | 6 |
| Demo results | 4 |
| Demo result details | 7 |
| Demo defect codes | 6 |
| Demo NCRs | 4 |
| Demo dispositions | 2 |
| Demo CAPAs | 4 |
| Demo CAPA/NCR links | 4 |

The script intentionally does not emit Kafka events. Automatic event-to-NCR behavior remains exercised by
the separate real MES closure flow; the seed gives the QMS Console complete lifecycle data without creating
duplicate downstream cases.
