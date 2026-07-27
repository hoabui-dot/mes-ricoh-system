# Printer Adapter Virtual Simulator Listener Fix

Date: 2026-07-26

## Root cause

`VirtualPrinterSimulator.RunListenerAsync` called `AcceptTcpClientAsync` on a `TcpListener` that could be stopped concurrently by `SetOnlineAsync`. This produced `InvalidOperationException: Not listening` during an expected online/offline transition.

The runtime data also contained two simulation printer rows, `Printer-01` and `printer-01`, configured for the same TCP port `9100`. The first listener bound successfully; the second listener failed with `Address already in use`. The retry loop then attempted to accept on the failed listener state and generated the repeated `Not listening` errors.

## Implementation

Updated `print-marking/station-agent/services/printer-adapter/src/ND.PrinterAdapter.Infrastructure/Simulation/VirtualPrinterSimulator.cs`:

- Added a per-endpoint listener lock.
- Captured the exact listener instance before awaiting accept.
- Made listener start/stop operations synchronized.
- Classified a stopped or replaced listener as an expected lifecycle race.
- Preserved real bind/socket failures as errors.
- Grouped simulation rows by TCP port at startup and selected one deterministic row per port.
- Added a warning identifying duplicate configured ports instead of starting a retry loop.

This keeps the database rows auditable while ensuring one TCP listener per port. The duplicate row should still be cleaned up or assigned a unique port in the printer master data when the simulation fixture is next migrated.

## Build and verification

- Published `vanhoadotbui2628/printer-adapter:independent-http-20260726` as `linux/arm64` only.
- Final image digest: `sha256:66f57761c2ef4e6fbcbe04827eb58f1dfa9c58e6c199f49f52e1a4f2451eed34`.
- Registry manifest inspection confirmed a single Docker image manifest with no AMD64 entry.
- The ARM image cannot execute on this AMD64 development host and correctly reports `exec format error`; this is an expected architecture mismatch.
- A temporary AMD64 image built from the identical source started successfully for runtime verification. It logged the duplicate-port warning, started three listeners, returned HTTP health status `healthy`, and produced no `Not listening` loop.

