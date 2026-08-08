# Label Template & Icon Printing — Phase 1 Baseline

## Architecture

The Printer Adapter (`station-agent/services/printer-adapter`) already owns `printer.db`, TCP/ZPL transport, a JSON `LabelTemplate` aggregate, version snapshots, print history, printer-template assignments, a simulation driver, RabbitMQ consumers, and a legacy ZPL renderer. Kiosk UI proxies template and print-history APIs; Job Engine submits workflow requests; Projection Service is not used as template authority.

## Baseline capabilities

- TCP port 9100: supported through `ZplTcpPrinterAdapter`.
- Simulation/fake transport: supported through `SimulationPrinterDriver` and `VirtualPrinterSimulator`.
- Existing template source: JSON; existing renderer emits ZPL for text, barcode, QR, line and shapes.
- Existing persistence: SQLite label templates, immutable snapshots, assignment and print history.
- Existing broker: RabbitMQ, not Kafka.
- Existing UI: LabelTemplatesTab plus Kiosk proxy APIs.

## Gaps to close

- Legacy template status is `draft/published/archived`, not the required version lifecycle.
- The legacy renderer is pixel-oriented and does not provide a typed mm/DPI compiler contract or structured validation.
- Assets, printer capabilities/profiles, asset cache, command outbox/inbox, exact print request identity, and immutable render snapshots are incomplete.
- SVG/PNG validation, Z64 and Vietnamese fallback are not authoritative yet.

## Compatibility decision

Extend the Printer Adapter in-place. Retain legacy template endpoints and `ILabelRenderer` during migration; introduce the canonical typed model/compiler beside them and adapt new APIs to it. RabbitMQ routing remains compatible with current deployment.

## Baseline verification

The previous Alarm Center work left the repository with no known printer-adapter-specific build failure. Phase implementation will run the Printer Adapter build/start and targeted tests after each safe increment. Existing Kiosk lint warnings remain unrelated and are not treated as feature failures.
