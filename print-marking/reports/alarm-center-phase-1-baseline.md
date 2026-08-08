# Alarm Center Phase 1 Baseline

Date: 2026-08-05 (UTC)

## Toolchain and repository state

- Git baseline: `879f429 Alarm-Center-theo-Phase`; worktree was clean before Phase 1.
- Host .NET SDK: unavailable (`dotnet: command not found`). Backend compilation is verified through repository Dockerfiles.
- Node: 22.22.1; npm: 10.9.4.
- Docker: 29.1.3; Docker Compose: 5.1.0.
- The solution targets .NET 9 packages, while current service Dockerfiles build and run on .NET 10 images. This pre-existing divergence is retained for compatibility and tracked as technical debt.

## Baseline verification

| Check | Result | Evidence / note |
|---|---|---|
| Compose configuration | Pass | `docker compose config --quiet` |
| Kiosk typecheck | Pass | `npm run typecheck` |
| Kiosk production build | Pass with warning | `npm run build`; existing bundle-size warning (650.93 kB minified) and SignalR PURE-comment warnings |
| Kiosk lint | Pass | `npm run lint` |
| Kiosk unit tests | Not available | No frontend test script or test framework exists at baseline |
| Backend host build/tests | Environment limitation | No host `dotnet` executable |
| Backend tests | Partial baseline only | Only device-simulator unit/integration projects exist; no alarm tests exist |
| Projection Docker build | See final command log | Built with `services/projection-service/docker/Dockerfile` |
| Kafka connectivity | Not applicable to live code | Repository uses RabbitMQ (`station.events`) rather than Kafka despite older AI docs |
| SignalR path | Present | Projection hub `/hubs/production`; client subscribes to `OnAlarmRaised` |

## Existing alarm implementation

The Projection Service already contains an alarm entity, SQLite table `projection_alarms`, repository filtering and pagination, device-timeout and failed-job creation, basic active-alarm deduplication, automatic device recovery resolution, REST list/count/acknowledge routes, SignalR `OnAlarmRaised`, a Vietnamese Alarm Center tab, and a persistent banner.

This baseline is useful but incomplete: lifecycle state is string-based and limited to Active/Acknowledged/Resolved; repeat count starts at zero; dedupe is not enforced by a conditional unique index; writes have no alarm outbox or audit timeline; consumers have no persistent inbox; actions are not consistently authenticated or authorized; technical Vietnamese messages are used as backend contracts; and persistence is created with `EnsureCreated`/ad-hoc compatibility SQL rather than migrations.

## Phase 1 test foundation change

`ND.Testing.SqliteFixture<TContext>` now uses a real open SQLite in-memory connection instead of EF Core's non-relational InMemory provider. This makes constraints, transactions, indexes, and SQLite behavior testable. `TestClock` provides deterministic time control for later domain tests.

## Pre-existing risks

- Documentation names Kafka while deployed code and Compose use RabbitMQ.
- Projection Service currently combines authoritative alarm writes with projection reads.
- Several services lack test projects.
- No CI workflows are present.
- Some Dockerfiles and Compose services do not uniformly expose an explicit UID/GID declaration; each must be verified during hardening.
- The shared SQLite helper creates directories but does not perform the required write probe/fallback.

