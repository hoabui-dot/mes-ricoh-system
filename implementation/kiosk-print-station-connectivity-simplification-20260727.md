# Kiosk Print Station Connectivity Simplification

Date: 2026-07-27

## Scope

Simplified the Print Station Kiosk connection experience for a factory kiosk.
The `Kết nối mạng` menu item now opens one screen only.

## UI changes

- Removed Connectivity sub-tabs.
- Removed PLC, Camera, Laser, Gateway, and simulator records from the
  operator-facing connection view.
- Renamed the device section to `Thiết bị in`.
- Kept only printer device records (`PRINTER` and `PRINT`).
- Kept the direct MES connection status card.
- Removed MES success/failure/request counters for the last 24 hours.
- Kept the existing printer management workspace with `Thiết bị sẵn sàng
  (online)` and `Máy in đang sản xuất` lists.
- Kept the mandatory label-template selection when adding a printer to
  production.
- Added `Đổi mẫu` for an active printer. It reuses the existing confirmed
  activation API to assign a new published template without removing the
  printer from production.
- Removed the `Chẩn đoán hệ thống` menu/page and its data fetching.
- Removed the central configuration page and its data fetching/editing UI.
- Added a shadcn `Button` icon control using `PanelLeftClose`/
  `PanelLeftOpen` to collapse or expand the left menu.
- Persisted the menu state in `localStorage` and supplied `aria-label` and
  tooltip text for kiosk usability.

## Runtime verification

```bash
cd print-marking/station-agent/services/kiosk-ui/frontend
npm install --include-workspace-root
npm run build

docker compose -f infra/docker-compose.print-station.yml \
  build station-kiosk-ui
docker compose -f infra/docker-compose.print-station.yml \
  up -d --no-deps station-kiosk-ui
curl -fsS http://127.0.0.1:5007/health
```

Result: frontend TypeScript/Vite build passed, the container was healthy, and
the health endpoint returned `{"status":"healthy","service":"kiosk-ui"}`.
