# MES Work Order WebSocket Scheme Fix

Date: 2026-07-26

## Root cause

The Work Order creation screen converted the API URL with `gatewayBaseUrl().replace(/^http/, protocol)`. When the API URL was `https://...` and the requested WebSocket protocol was `wss`, the result became `wsss://...`, causing the browser error: `The URL's scheme must be either 'http', 'https', 'ws', or 'wss'`.

## Fix

`WOCreateScreen.tsx` now parses the endpoint with `URL`, sets only the URL protocol (`https:` to `wss:`, otherwise `ws:`), and adds query parameters through `URLSearchParams`. This avoids malformed schemes and manual whitespace cleanup.

## Verification

- MES Console production build passed with `npm run build`.
- The generated WebSocket URL is valid for both HTTP/WS and HTTPS/WSS gateway deployments.
