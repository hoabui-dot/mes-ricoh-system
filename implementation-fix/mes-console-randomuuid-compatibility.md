# MES Console `crypto.randomUUID` Compatibility Fix

**Date:** 2026-07-23  
**Status:** Implemented and build-verified

## Root cause

Work Order creation called `crypto.randomUUID()` directly when generating the `Idempotency-Key`.
The deployed browser runtime exposed `crypto` but not `randomUUID`, so submission failed before the
HTTP request was sent.

## Fix

Added `generateRequestId()` in `services/mes-console/src/lib/codePreview.ts`. It uses
`crypto.randomUUID` when available, `crypto.getRandomValues` as the browser-compatible fallback, and
a timestamp/random fallback for restricted runtimes. Work Order idempotency keys and generated code
previews now use this helper.

## Verification

- `npm run build` in `services/mes-console`: passed.
- `git diff --check`: passed.
