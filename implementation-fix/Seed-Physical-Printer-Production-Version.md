# Seed Physical-Printer Production Version

Date: 2026-07-27

## Release error diagnosis

The draft PV `PV-20260727-0003` (`b21de996-b6e7-4893-bc02-c5076f301fde`) was
not releasable. It selected Routing `RT-20260727-0002`, whose sequence 20
Routing Operation `c0ad1789-0ebe-437b-b5bf-510d2d9a0f87` uses Operation
`OP-20260727-0001` in Draft status. Validation correctly returned
`ROUTING_OPERATION_INACTIVE`; the PV must not be forced to Released.

## Seeded configuration

The idempotent script `npm run seed:mes:physical-printer-pv` created and
released the following PV through the real master-data APIs:

| Field | Value |
|---|---|
| Production Version | `PV-20260727-0004` |
| Production Version ID | `ca7f09f8-6e6e-4e00-8acc-b4b924e3f1c5` |
| Name VI | `Cấu hình sản xuất FG có in nhãn` |
| Name EN | `FG Label Printing Production Configuration` |
| Name JA | `ラベル印刷付きFG生産構成` |
| Name KO | `라벨 인쇄 FG 생산 구성` |
| Item Revision | `FG-WS-CM01-R1` / `16e323c4-0cb8-41e6-ad57-3f2c4810a1bf` |
| MBOM | `MBOM-FG-WS-CM01-R1` / `ebefe808-545b-4f22-9b70-6151a7557961` |
| Routing | `RT-FG-WS-CM01-R1` / `bdf183f0-9d44-4674-8153-134ae7b151c3` |
| Site | `SITE-KZ3` / `9f785cbd-98aa-4b2c-98ef-287a189e760c` |
| Base UOM | `PCS` / `1a2c0adc-cd7e-4cc9-a2ae-4b9053683b29` |
| Min lot | `1` |
| Max lot | `1000` |
| Lifecycle | `Released` |

The Routing has six Released operations and label-required operations. The
physical Print Station is `PRINT-STATION-01`, currently ONLINE, with an active
binding to `WS-20260727-0006` and one allocated printer.

## Manual WO form values

In `/work-orders/new` select Production Version **FG Label Printing Production
Configuration** (`PV-20260727-0004`). Use quantity `10` PCS and target date a
future date such as `2026-08-01`. Do not enter Site, Item Revision, MBOM,
Routing, or UOM manually; the Console displays these as derived context.

The current approval policy is resource-allocation advisory, so the WO can be
approved without selecting generic resources. Approval returns a warning and
records the bypass in the audit. Physical printing still requires the Print
Station binding, Kafka connectivity, ONLINE station, and ready Zebra printer.

## Verification

- Create API returned HTTP 201 and backend-owned code `PV-20260727-0004`.
- Validate endpoint returned HTTP 200 with `valid: true` and no failures.
- Release endpoint returned HTTP 200 with `event_published: true`.
- Execution read-model received the PV and the candidate endpoint returned
  `ready: true`, Site `SITE-KZ3`, and UOM `PCS`.
- Re-running `npm run seed:mes:physical-printer-pv` reuses the existing PV and
  does not create a duplicate.

