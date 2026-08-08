# Close Prior Work Gaps and Item Revision Change Control

Date: 2026-07-24
Status: Core implementation complete; live read-model projection verified; Compute & Check and full UI rollout remain partial

## Part A

- Added execution Kafka consumers for EmployeeCreated, ShiftCreated, EmployeeScheduleAssigned, and EmployeeSkillAssigned events.
- Added master-data EmployeeSkillAssigned event publication and employee update publication on the existing PUT contract.
- Execution now projects employees, skills, schedules, and labor assignments into its local read model. The consumer group was versioned to replay the new contract safely.
- Added `wo_operation_labor_assignment` to consolidated MES execution truncation and added it to post-cleanup counts. EBOM tables remain preserved as master data.
- Added the conflict-safe `/uoms` create-or-reuse handler and a disposable concurrency probe at `scripts/test-item-uom-concurrency.sh`.

## Part B

### Schema and numbering

- Migration `0011_item_revision_engineering_change_control` adds revision-owned specification fields, the atomic `md_item_revision_numbering` counter, a case-insensitive UOM code unique index, and backfills existing revisions from their parent Item.
- Migration `0012_item_revision_engineering_change_control_constraints` constrains required revision-owned fields.
- Migration `0013_item_revision_backfill_repair` is a forward-only repair for populated databases that had already passed the constraint migration.
- Old `md_item` specification columns are intentionally retained. The staged deprecation/drop migration is not applied until every read/write path and production probe is migrated.

### API behavior

- `POST /api/mes/master-data/items` now atomically creates the identity Item and first Draft revision `ITEMCODE-R1`; creator identity comes from the server context.
- `POST /api/mes/master-data/items/:id/revisions` creates a Draft successor with atomic numbering, `previous_revision_id`, required `change_reason`, and server-clock future/equal effective-date validation.
- Creating a successor closes the chronological predecessor's `effective_to` at the exact new start in the create transaction. Releasing it clears the previous default flag and marks exactly one same-item/site Released revision as default.
- Direct specification updates to an Item with a Released revision are rejected server-side.
- Production-ready revision queries use revision-owned UOM/name/effective data and filter to the effective Released revision/configuration.

## Verification evidence

- `npm run build --workspace=mes-master-data-service`: PASS.
- `npm run build --workspace=mes-console`: PASS; existing Vite chunk-size warning remains.
- `go test ./...` in `services/mes-execution-service`: PASS.
- Live migration `0011`, `0012`, and `0013`: applied successfully after trigger-safe backfill correction.
- Live disposable Item flow: UOM created, Item plus R1 created atomically, R1 released, backdated R2 rejected with 422, future R2 created as `...-R2`, R2 released, and R1 effective-to/default closure verified.
- Live employee, skill, and schedule projection: execution contains `EMP-001 / SK_MIX_MASTER / L3` in `rm_employee_skill` and a `2026-07-24 Scheduled` row in `rm_employee_shift_schedule`; the latest EmployeeCreated payload contains the localized skill snapshot.
- Live UOM race probe: `scripts/test-item-uom-concurrency.sh` passed and found exactly one row for two simultaneous creates.
- Runtime: `mes-master-data-service` and `mes-execution-service` are healthy after rebuild; migrations `0011`-`0013` are skipped as already applied. The existing Schema Registry backward-compatibility warning for `MES.MasterData.ItemRevisionReleased.v1` remains non-fatal.

## Explicit remaining evidence

The repository has not dropped the legacy `md_item` specification columns. UI metadata rollout for every MBOM, Production Version, Work Order, and EBOM surface is not yet complete. No suitable live Work Order existed in the execution database during this verification, so Labor Compute & Check remains unverified; it must return a scored assignment and explicitly exclude the EMP-008 OnLeave fixture before this gap is closed.
