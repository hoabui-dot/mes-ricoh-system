# Label Template & Icon Printing — Implementation Map

| Concern | Owner | Existing base | Planned extension |
|---|---|---|---|
| Canonical template and versions | Printer Adapter | `LabelTemplate`, `LabelTemplateVersion` | Typed schema, lifecycle, immutable approval versions |
| ZPL and physical send | Printer Adapter | `ZplRenderer`, TCP/simulation drivers | DPI-aware secure compiler and render snapshots |
| Assets and cache | Printer Adapter | none authoritative | asset/variant/cache persistence and synchronization |
| Workflow policy | Job Engine | job-event consumers | exact `template_version_id` print request contract |
| Read model/realtime | Projection Service | production SignalR | consume print/template events without cross-DB access |
| UI | Kiosk UI | template tab/proxy routes | Vietnamese designer, preview, lifecycle controls |

## Capability model

Printer profiles will explicitly declare DPI, media dimensions, UTF-8/Vietnamese-font support, Z64/stored-graphic support, Link-OS/status-query support, transport protocol, online state and memory constraints. Unsupported features must surface as structured preflight warnings/errors rather than silently changing print output.
