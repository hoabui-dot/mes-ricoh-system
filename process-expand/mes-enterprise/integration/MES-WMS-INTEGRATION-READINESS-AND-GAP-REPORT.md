# Bao cao danh gia kha nang san sang tich hop MES-WMS Material Staging

## 1. Thong tin bao cao

- Ngay danh gia: `2026-08-04`
- Tai lieu yeu cau: `MES-Requirements-for-Continuing-WMS-Recovery-and-Completion-Phases.md`
- Pham vi: MES-owned Work Order, material requirement, stage-materials, outbox, Kafka result consumer, schema, seed, test va observability
- Trang thai: `ANALYSIS_ONLY_NO_IMPLEMENTATION_STARTED`
- Phan loai tong the: `NOT_READY_FOR_FULL_WMS_PHASE_07_08_CLOSURE`
- Kha nang bat dau sua MES: `READY_TO_BEGIN_REMEDIATION_AFTER_CONTRACT_DECISIONS`

Bao cao nay chi phan tich code, tai lieu he thong, tai lieu san pham va trang thai runtime doc-only. Bao cao **khong** thay doi service, database schema, seed data, Kafka, WMS, Docker hoac du lieu runtime.

## 2. Ket luan dieu hanh

MES da co bo khung happy path can thiet:

1. Tao Work Order va explode MBOM thanh `wo_material_requirement`.
2. Approve Work Order sang `Released` sau khi thoa dieu kien nghiep vu.
3. Goi `POST /api/mes/execution/work-orders/{id}/stage-materials`.
4. Ghi business state va `MES.Execution.MaterialStagingRequested.v1` vao cung transaction/outbox.
5. Publish request qua Kafka.
6. Consume hai topic ket qua `WMS.Outbound.MaterialStaged.v1` va `WMS.Outbound.MaterialShortageDeclared.v1`.
7. Hien thi `stock_check_status` va `stock_check_detail` qua Work Order detail API/UI.

Tuy nhien, day moi la **happy-path compatibility surface**, chua dap ung cac cam ket exactly-once business effect, ordering/version, reconciliation, migration rehearsal, evidence va recovery trong tai lieu WMS. Blocker khong chi la thieu fixture. Ket qua audit code hien tai tim thay cac blocker correctness nghiem trong trong MES result consumer.

Ket luan thuc te:

- Co the giu nguyen Kafka transport baseline ma WMS da xac nhan.
- Co the xay dung fixture va chay happy path sau khi chot mapping contract.
- Khong the chung nhan WMS Phase 07/08 voi consumer hien tai.
- Khong nen bat dau bang cach sua Kafka transport.
- Nen bat dau bang contract freeze, additive persistence va consumer durability, sau do moi tao fixture va chay full-flow.

## 3. Nguon da kiem tra

### Tai lieu yeu cau va kien truc

- `process-expand/mes-enterprise/integration/MES-Requirements-for-Continuing-WMS-Recovery-and-Completion-Phases.md`
- `AI_document/01_BUSINESS_DOMAIN.md`
- `AI_document/06_SERVICE_BOUNDARIES.md`
- `AI_document/08_EVENT_DRIVEN_ARCHITECTURE.md`
- `AI_document/14_WORKFLOW_AND_USECASES.md`
- `AI_document/19_KNOWN_LIMITATIONS.md`
- `product-doc/product-doc.md`
- `product-doc/VII-ERD-MATRIX-&-DEV-VALIDATION.md`
- `docs/adr/0003-mes-wms-material-demand-and-realtime.md`

### Code MES hien tai

- `services/mes-execution-service/internal/application/usecase/stage_materials.go`
- `services/mes-execution-service/internal/infrastructure/events/wms_material_result_consumer.go`
- `services/mes-execution-service/internal/infrastructure/events/schema_registry.go`
- `services/mes-execution-service/internal/infrastructure/http/router.go`
- `services/mes-execution-service/cmd/server/main.go`
- `services/mes-execution-service/migrations/000001_initial_execution_schema.up.sql`
- `services/mes-execution-service/migrations/000005_wms_stock_check_status.up.sql`
- `libs/shared-kernel-go/envelope.go`
- `libs/shared-kernel-go/outbox.go`
- canonical seed/reset/test scripts va MES Console Work Order detail

### Gioi han nguon

Checkout MES nay khong co `services/wms-*`. Co cac WMS container dang chay, nhung khong the dung MES source de chung nhan logic noi bo, migration, inbox, outbox, FEFO hay exactly-once cua WMS. Cac phat bieu WMS runtime trong tai lieu yeu cau duoc xem la external evidence do WMS cung cap, khong phai evidence duoc report nay tai kiem chung.

## 4. Quyen so huu va nguyen tac phai giu

| Du lieu/hanh vi | Owner | Ket luan |
|---|---|---|
| Work Order va material requirement | MES | MES tao va cap nhat bang MES-owned API/use case |
| Work Center execution context | MES | MES cung cap reference, WMS map sang staging location |
| Stock, lot, reservation, movement, FEFO | WMS Inventory | MES khong tu tinh ton kho |
| Material request/staging execution | WMS Outbound | WMS tra Staged hoac Shortage |
| MES request outbox | MES | Atomic voi command state |
| WMS result inbox/consumer state | MES | Hien tai thieu va phai bo sung |
| Kafka transport | Platform | Bao ton baseline da xac nhan |
| Redis | Khong thuoc flow nay | Khong them Redis |

Khong duoc doc/ghi truc tiep database WMS, khong dung shared table va khong de WMS insert Work Order/material requirement vao MES.

## 5. Trang thai runtime doc-only tai thoi diem audit

Truy van read-only tren `mes_execution_db` cho ket qua:

| Chi so | Gia tri |
|---|---:|
| Work Orders | 1 |
| Draft Work Orders | 1 |
| Material requirements | 1 |
| `NotChecked` requirements | 1 |
| Released Work Orders co material requirement | 0 |
| Material-staging outbox rows | 0 |

Do do con so `0 Work Orders / 0 material requirements` trong tai lieu WMS da cu so voi runtime hien tai. Tuy vay, ket luan blocker van dung theo nghia nghiep vu: chua co deterministic disposable `Released` fixture co material demands de chung minh integration.

`mes-execution-service`, Kafka, Schema Registry va cac WMS container quan sat duoc dang chay. MES log co Schema Registry warning `409` cho `MES.Execution.WOCreated.v1-value`; day la dau hieu schema governance/compatibility can duoc lam ro truoc khi dang ky contract staging moi.

## 6. Nhung gi MES co the lam ngay

| Kha nang | Trang thai | Evidence/ghi chu |
|---|---|---|
| Tao Draft WO bang MES API | `AVAILABLE_NOW` | `POST /api/mes/execution/work-orders` |
| Explode MBOM thanh material requirements | `AVAILABLE_NOW` | Thuc hien trong create WO transaction |
| Release WO | `AVAILABLE_NOW_WITH_PREREQUISITES` | Approval can compute/readiness va resource allocations hop le |
| Stage materials bang MES-owned command | `AVAILABLE_NOW` | Chi cho `Released` hoac `InProgress` |
| Gom demand theo item revision + Work Center | `AVAILABLE_NOW` | Duplicate MBOM lines cung group duoc cong quantity |
| Bo qua phantom, quantity <= 0 va dong da `Staged` | `AVAILABLE_NOW` | Shortage van co the retry |
| Serialize concurrent staging theo WO | `AVAILABLE_NOW` | PostgreSQL advisory transaction lock |
| Atomic command state + outbox | `AVAILABLE_NOW` | Cung database transaction |
| Retry publish khi Kafka loi | `PARTIAL` | Outbox retry toi da 3 lan, sau do `FAILED` |
| Consume Staged/Shortage result topics | `PARTIAL` | Consumer duoc start cung service |
| Cap nhat status/detail va expose qua WO detail | `PARTIAL` | Chi co status co ban va raw JSON detail |
| Khong dung Redis/cross-database | `AVAILABLE_NOW` | Phu hop boundary |

## 7. Nhung gi MES chua the cam ket

MES chua the cam ket cac noi dung sau voi code hien tai:

- Exactly-once business effect cho WMS result.
- Same event ID/same payload la durable no-op.
- Same event ID/different payload tao durable conflict.
- Offset chi commit sau khi database update thanh cong.
- Restart recovery khong mat message.
- Bao ve stale result, future version gap va transition conflict.
- Unknown requirement duoc park/DLQ/reconcile thay vi silent acknowledge.
- Duplicate stage-materials command khong tao logical WMS request moi.
- Stable business event key, correlation ID va causation ID end-to-end.
- Contract schema chinh thuc cho request/result va compatibility test.
- Quan sat lag, duplicate, stale, unknown, backlog age va reconciliation mismatch.
- Migration rehearsal tren legacy requirement.
- Hai scenario Staged/Shortage voi real MES aggregate va WMS inventory mapping.
- Bo evidence `.artifacts/recovery/<scope>/mes-wms/` theo yeu cau.

## 8. Ma tran yeu cau WMS

| Nhom yeu cau | Hien tai | Gap chinh | Phan loai |
|---|---|---|---|
| Released WO fixture | Co domain flow, chua co recovery fixture | Canonical seed khong giu Released WO | `NOT_READY` |
| Hai material requirements | WO explosion co the tao requirement | Seed hien tai chi tao 1 requirement runtime; chua map hai outcome | `NOT_READY` |
| Cross-system master mapping | MES co item/WC IDs | Chua co manifest mapping voi WMS site, UOM, staging location, stock | `EXTERNAL_INPUT_REQUIRED` |
| Real stage-materials command | Da co | Chua co recovery harness/evidence | `PARTIAL` |
| Atomic outbox | Da co | Thieu aggregate/correlation/causation va observability | `PARTIAL` |
| Duplicate MES command | Chi lock concurrent | Retry sequential tao event/outbox moi neu chua Staged | `FAILS_REQUIREMENT` |
| Result consumption | Da co topic consumer | Auto commit, khong inbox, khong validation | `FAILS_REQUIREMENT` |
| Staged persistence | Status + raw payload | Khong normalized ID/qty/location/version/time/correlation | `PARTIAL` |
| Shortage persistence | Status + raw payload | Khong normalized requested/available/shortage/retryability | `PARTIAL` |
| Duplicate result | Re-run UPDATE | Khong durable event identity/no-op metric/conflict detection | `FAILS_REQUIREMENT` |
| Stale/conflict | Khong co | Co the overwrite state moi hon | `FAILS_REQUIREMENT` |
| Unknown aggregate | UPDATE 0 rows | Message van duoc acknowledge, khong evidence | `FAILS_REQUIREMENT` |
| Consumer restart | Consumer group co san | Auto-commit-before-durable-apply tao nguy co mat result | `FAILS_REQUIREMENT` |
| Kafka outage/recovery | Outbox co retry | Retry cap 3, khong backlog/oldest-age metrics/recovery harness | `PARTIAL` |
| Schema Registry | Generic runtime registration | Khong co source schema staging; consumer khong validate result | `NOT_READY` |
| Migration safety | Migration framework co san | Chua co schema moi va legacy rehearsal | `NOT_STARTED` |
| Evidence artifacts | Chua co | Chua co generator/summary classifier | `NOT_STARTED` |
| Redis independence | Dat | Khong can thay doi | `PASS` |

## 9. Correctness blocker trong result consumer

### P0 - Co the mat WMS result

Consumer dung `kafka.Reader.ReadMessage` voi consumer group. API nay commit message tu dong; sau do code moi goi database `apply`. Neu `apply` loi, consumer chi ghi log va tiep tuc. Ket qua la offset co the da commit trong khi MES requirement chua duoc cap nhat.

Can sua:

- Dung explicit fetch/commit flow.
- Chi commit Kafka offset sau khi inbox va business update da commit thanh cong.
- Neu durable processing that bai, retry co policy; khong acknowledge ngam.

### P0 - Khong co inbox/idempotency durable

`event_id` duoc parse nhung khong duoc luu hoac su dung. Duplicate result chi chay lai `UPDATE`; same ID/different payload cung khong duoc phat hien.

Can sua:

- Them MES-owned WMS result inbox voi unique `(consumer_name, event_id)`.
- Luu payload hash, topic, partition, offset, processing status, received/processed timestamps va error/reconciliation metadata.
- Inbox insert va requirement transition phai cung mot transaction.
- Same ID/same hash => no-op; same ID/different hash => durable conflict.

### P0 - Unknown requirement bi mat evidence

SQL khong kiem tra affected row count. Requirement ID khong ton tai co the `UPDATE 0`, tra ve success va message bi acknowledge.

Can sua:

- Kiem tra exact expected/matched requirement IDs.
- Park unknown/missing aggregate vao reconciliation table hoac DLQ policy.
- Khong fabricated row va khong lookup database WMS.

### P0 - Khong co ordering/version/transition guard

Topic quyet dinh truc tiep `Staged` hoac `Shortage`, bat ke state/version hien tai. Vi vay Shortage cu co the overwrite Staged, hoac Staged co the cap nhat requirement cua WO da Cancelled.

Can sua:

- Chot source version contract.
- Luu current WMS result version va MES requirement row version.
- Dinh nghia transition table va optimistic condition trong SQL.
- Park future gaps; ghi metric cho stale; conflict/reconcile cho illegal transition.

### P1 - Validation contract khong du

Consumer chi parse `event_id` va `payload`; khong validate `event_type`, source, timestamp, schema/version, required fields hay topic-event consistency. JSON khong hop le co the tra `nil` error khi `payload` nil trong mot so truong hop va khong co error classification ro rang.

Can sua:

- Typed envelope/result DTO.
- Validate envelope, event type, topic, UUID, quantity, version va required references.
- Dinh nghia invalid-schema policy: park/DLQ + metric + safe log.

## 10. Gap o staging command va outbox

1. `stock_check_status` van la `NotChecked` trong khi `stock_check_detail.status = Requested`. Day la hai vocabulary khong nhat quan va khong the query state machine mot cach tin cay.
2. Goi lai command truoc khi co result tao event ID/outbox row moi. Advisory lock chi giai quyet concurrency, khong giai quyet logical replay.
3. Kafka key la outbox event ID moi, khong phai stable demand/request key.
4. Envelope chi co `trace_id`; khong co `correlation_id`, `causation_id`, aggregate ID hay schema/event version rieng.
5. Payload khong co `uom_code`, `site_id`, warehouse context, request version hoac idempotency key.
6. `work_center_ref` hien dang gui MES Work Center UUID. Can WMS xac nhan day la canonical key hay phai dung code/external mapping ID.
7. Outbox retry toi da 3 lan roi `FAILED`, nhung chua co recovery command, backlog metric va oldest age metric cho operator.
8. API tra `202` va danh sach event ID, nhung khong co command resource/status endpoint de doc lifecycle requested/processed/reconciled.

## 11. Gap ve database va state model

`wo_material_requirement` hien chi co:

- `stock_check_status`: `NotChecked | Staged | Shortage`
- `stock_check_detail`: raw `jsonb`

Khong co requirement lifecycle/release state rieng, WMS request ID, result event ID, correlation ID, source version, staged/available/shortage quantity, staging location, result timestamp, retryability, conflict hay reconciliation state.

Can quyet dinh product model truoc migration:

- Giu compatibility status hien tai hay mo rong explicit states.
- Material staging state nam tren tung MBOM snapshot line hay tren aggregate demand parent + requirement links.
- Mot WMS result cho group nhieu requirement IDs duoc version va transition nhu the nao.
- Retry shortage tao request version moi hay tiep tuc cung logical demand.
- Cancellation/replan/MBOM snapshot thay doi anh huong demand da gui nhu the nao.

Tai lieu san pham da ghi nhan WMS material-request hien la legacy flat aggregate va final parent/line requisition model con mo. Khong nen chen nhieu field vao `stock_check_detail` de tranh quyet dinh mo hinh nay.

Migration tuong lai phai additive: them nullable structures/columns, deploy backward-compatible consumer/API, backfill co kiem soat, rehearsal voi legacy rows, sau do moi tang constraints.

## 12. Gap contract va Schema Registry

Hien tai `MES.Execution.MaterialStagingRequested.v1` chi duoc dang ky bang mot generic schema dung chung. Schema nay yeu cau payload `wo_id` va `wo_code`, trong khi payload staging gui `work_order_code` chu khong gui `wo_code`. Khong co file schema chuyen biet trong `infra/schemas/mes-execution/` cho staging request.

MES consumer cung khong validate hai WMS result schema. Truoc khi implement can co source-controlled contract cho:

- Request envelope va payload.
- Staged result envelope va payload.
- Shortage result envelope va payload.
- Required/optional fields, numeric precision va enum.
- Stable event key va logical request ID.
- `correlation_id`, `causation_id`, `trace_id`.
- Request/result/source version semantics.
- Topic-event mapping va invalid-event policy.
- Compatibility mode, owner, deployment order va contract-test owner.

Khuyen nghi giu event `v1` chi khi thay doi la backward-compatible additive. Neu nghia cua identity/version/state thay doi, can danh gia `v2` thay vi thay semantics ngam trong `v1`.

## 13. Gap fixture va mapping

Canonical MES seed tao deterministic master/read-model data, nhung reset/verify hien ky vong execution Work Orders bang 0. No khong tao disposable Released WO cho WMS recovery.

Recovery fixture can:

- Co `recovery_scope` de rerun va cleanup.
- Tao WO qua public API/application use case, khong SQL production undocumented.
- Hoan tat compute/readiness/resource allocation/approval de dat `Released` dung domain rule.
- Tao it nhat hai **logical demand groups** rieng. Neu hai MBOM lines cung item + Work Center, MES se aggregate thanh mot WMS demand, khong the chung minh hai outcome doc lap.
- Map chinh xac MES item revision, Work Center, UOM, site voi WMS master/staging location.
- Co mot demand du stock va mot demand thieu stock theo WMS-owned setup.
- Xoa sach MES-owned fixture/outbox/inbox/reconciliation theo scope; WMS cleanup do WMS-owned command thuc hien.

Khong the tu MES source hien tai xac dinh gia tri mapping WMS chinh xac. WMS phai cung cap/confirm mapping manifest va disposable stock setup API/command.

## 14. API va authorization gap

### Da co

- Create/read Work Order.
- Approve/release Work Order qua workflow.
- Stage materials.
- Doc requirements trong WO detail.

### Thieu hoac chi co gian tiep

- Khong co API tao/release material requirement rieng; requirement chi sinh tu MBOM explosion. Day khong phai blocker neu fixture dung WO domain flow.
- Khong co stage command status resource.
- Khong co inbox/reconciliation read API hoac replay/reconcile command.
- Khong co recovery fixture command.
- Core execution routes khong co local bearer middleware nhu kiosk routes; hien phu thuoc gateway/boundary va trusted headers. Can xac nhan service-to-service identity/permission cho recovery va production staging command.

## 15. Gap test, observability va evidence

Coverage hien tai chi co mot unit test cho demand grouping. Khong tim thay test consumer/result, contract test staging, Kafka integration test hoac script full MES-WMS staging trong checkout hien tai. Cac report cu nhac `scripts/test-mes-wms-material-request-flow.sh`, nhung file do khong con ton tai trong source hien tai.

`/metrics` cua MES Execution hien chi expose `mes_execution_service_up`. Chua co cac metric ma WMS request yeu cau.

Can bo sung sau khi contract/state model duoc chot:

- Unit tests: mapping, transition, duplicate, conflict, stale, version gap, quantity va errors.
- Database tests: inbox atomicity, outbox atomicity, unknown parking, duplicate no-op va migration rehearsal.
- Contract tests: request/staged/shortage schema, keys va compatibility.
- Kafka tests: explicit commit, restart, outage/recovery, duplicate va lag convergence.
- Full-flow: Staged, Shortage, duplicate request/result, unknown, stale/conflict va legacy row.
- Metrics/logs: request totals/failures, backlog/age, result failures, lag, duplicate/stale/unknown/reconciliation; logs co topic/partition/offset/event/WO/requirement/correlation nhung khong lo secret.
- Artifact generator dung duong dan va classifier trong tai lieu WMS.

## 16. Tai lieu lich su khong con la source truth

Mot so report ngay `2026-07-23`/`2026-07-24` mo ta MES goi HTTP truc tiep toi WMS va WMS tra result dong bo. Code hien tai lai ghi Kafka outbox va nhan Kafka result bat dong bo. Vi vay:

- ADR ownership cua explicit `stage-materials` van huu ich.
- Cardinality `WO + Work Center + Item Revision` van phu hop voi code grouping.
- Sequence HTTP dong bo, response `MR-*` va test script duoc nhac trong report cu khong con phai source truth cua checkout hien tai.
- Contract va runtime report moi phai duoc tao tu code Kafka hien tai, khong copy claim cu.

## 17. Dau vao can tu WMS, Platform va Product

### WMS can cung cap/xac nhan

- Exact JSON schemas va sample events cua hai result topics.
- Logical WMS request ID va idempotency identity.
- `work_center_ref` la UUID, code hay external mapping key.
- Mapping item revision/UOM/site/warehouse/staging location.
- Result version semantics va ordering scope.
- Quantity semantics: requested, staged, available, shortfall va UOM precision.
- Disposable stock seed/setup va cleanup command cho mot Staged, mot Shortage.
- WMS-side evidence API/queries cho inbox, request, outbox, movement va balances.
- WMS reconciliation/DLQ contract va owner.

### Platform can cung cap/xac nhan

- Schema subject ownership va compatibility mode.
- Kafka retention/partition/key policy.
- Consumer lag evidence command/dashboard.
- Failure rehearsal rules cho shared environment.

### Product/MES architecture can quyet dinh

- Final parent/line material demand model.
- State machine va retry/cancel/conflict semantics.
- Version owner va version increment rules.
- Operation-level readiness khi mot demand group map nhieu requirements.
- Production authorization cho stage/reconcile/replay commands.

## 18. Ke hoach remediation de xuat

### Phase A - Contract freeze va product decisions

Chot schemas, identity, mapping, state machine, version/ordering, reconciliation va ownership. Output la contract files/ADR duoc phe duyet; chua can chay full-flow.

### Phase B - Additive persistence va consumer safety

Them inbox/reconciliation va normalized result persistence; chuyen sang explicit offset commit; implement typed validation, duplicate/conflict/stale/version-gap/unknown handling trong transaction.

### Phase C - Command idempotency va outbox hardening

Them stable logical demand/request identity, command replay behavior, correlation/causation, request state va outbox observability/recovery.

### Phase D - Deterministic recovery fixture

Them MES-owned recovery command/harness tao Released WO va hai demand groups theo mapping WMS da chot; co scope manifest va cleanup.

### Phase E - Automated verification

Chay unit, contract, database, migration va Kafka tests. Chay 8 runtime scenarios voi WMS-owned fixture/stock setup, khong dung cross-database write.

### Phase F - Evidence va closure

Sinh `.artifacts/recovery/<scope>/mes-wms/`, kiem tra before/after/outbox/inbox/lag/reconciliation, sau do tao `docs/integration/MES_WMS_MATERIAL_STAGING_RUNTIME_VERIFICATION_REPORT.md`.

## 19. Thu tu uu tien sua

| Uu tien | Viec can sua | Ly do |
|---|---|---|
| P0 | Explicit commit sau durable transaction | Ngan mat WMS result |
| P0 | Inbox + payload hash + conflict detection | Exactly-once business effect |
| P0 | Unknown/stale/version-gap/illegal transition parking | Ngan silent data corruption |
| P0 | Chot contract identity/version/mapping | Tranh migration va event sai nghia |
| P1 | Stable command idempotency va event key | Ngan duplicate logical WMS request |
| P1 | Normalized result persistence/state model | API, audit va reconciliation tin cay |
| P1 | Source-controlled schemas/contract tests | Deployment compatibility |
| P1 | Deterministic two-outcome fixture | Mo khoa runtime verification |
| P2 | Metrics, logs, recovery commands va artifacts | Van hanh va Phase 07/08 evidence |
| P2 | UI command/result/reconciliation detail | Operator visibility sau backend correctness |

## 20. File du kien bi anh huong khi duoc phep implement

Danh sach nay chi la impact forecast, khong phai files da thay doi:

- New additive migrations trong `services/mes-execution-service/migrations/`.
- `wms_material_result_consumer.go` va cac typed contract/processor moi.
- `stage_materials.go` cho logical command identity/state.
- `libs/shared-kernel-go/envelope.go` hoac MES-local versioned envelope extension sau compatibility analysis.
- `infra/schemas/mes-execution/` va WMS result contract fixtures.
- MES HTTP routes/read models cho status/reconciliation neu duoc phe duyet.
- Recovery fixture/cleanup/evidence scripts trong `scripts/`.
- Unit, database integration, contract, Kafka va E2E tests.
- MES Console chi sau khi backend contract on dinh.

## 21. Dieu kien bat dau va dieu kien dung

Co the bat dau implementation MES khi co toi thieu:

1. Ba event contract da chot.
2. Mapping manifest MES-WMS co gia tri dung trong target environment.
3. Product decision ve demand parent/line va state/version.
4. WMS disposable stock setup/cleanup va evidence interface.
5. Platform cho phep failure rehearsal trong scope co lap.

Phai dung va bao blocker neu:

- WMS result khong co stable event ID hoac version/order semantics can thiet.
- Mapping can direct DB read/write giua MES-WMS.
- Chi co the tao stock fixture bang production SQL khong duoc phe duyet.
- Schema `v1` can thay doi semantics khong backward-compatible.
- Shared Kafka outage test co the anh huong workload ngoai recovery scope.

## 22. Final readiness classification

| Muc | Phan loai |
|---|---|
| Kafka transport baseline | `EXTERNALLY_VERIFIED_PRESERVE` |
| MES happy-path skeleton | `IMPLEMENTED_PARTIAL` |
| MES business fixture | `BLOCKED_BY_MES_FIXTURE_AND_WMS_MAPPING` |
| MES result durability/idempotency | `NOT_READY_P0` |
| Version/conflict/reconciliation | `NOT_IMPLEMENTED_P0` |
| Schema governance | `NOT_READY` |
| Full runtime scenarios | `NOT_EXECUTED` |
| Phase 07/08 evidence | `NOT_GENERATED` |
| Overall closure | `NOT_READY_FOR_FULL_WMS_PHASE_07_08_CLOSURE` |

MES co the tiep tuc cong viec sau khi cac contract decision duoc chot, nhung khong nen tao fixture roi tuyet doi hoa mot happy-path PASS truoc khi sua consumer P0. Fixture la dieu kien can; durability, idempotency, ordering va reconciliation moi la dieu kien du de dong cac phase WMS duoc yeu cau.
