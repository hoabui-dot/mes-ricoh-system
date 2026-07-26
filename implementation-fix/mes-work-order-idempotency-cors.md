# Work Order Idempotency-Key CORS Fix

**Date:** 2026-07-23  
**Status:** Implemented; service tests and image build passed

## Root cause

The Work Order creation request sends the required `Idempotency-Key` header. Kong's global CORS
allow-list did not include that header, so the browser rejected the OPTIONS preflight before the
POST reached `mes-execution-service`. The execution service's direct CORS middleware also omitted it.

## Fix

Added `Idempotency-Key` to `infra/kong/kong.yml` global CORS headers and to the execution service's
`Access-Control-Allow-Headers` response. This preserves idempotency protection and does not weaken
authentication or origin policy.

## Verification

- `go test ./...` in `services/mes-execution-service`: passed.
- `mes-execution-service` Docker image: built and recreated.
- Kong declarative configuration contains the new allowed header. Kong force-recreation was attempted,
  but the local Docker socket intermittently returned a permission error during the final command.
