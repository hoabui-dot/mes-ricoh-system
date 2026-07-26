import { Navigate, Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { WarehouseMapPage } from './features/warehouse-map/WarehouseMapPage';
import { BalancesPage, DiscrepanciesPage, LotDetailPage, MovementsPage } from './features/inventory/InventoryPages';
import { NewReceiptPage, ReceiptDetailPage, ReceiptsListPage } from './features/inbound/InboundPages';
import { NewRequestPage, RequestDetailPage, RequestsListPage } from './features/outbound/OutboundPages';
import { BackendGapPage, BinDetailPage, BinsPage, ItemUomPage, LocationDetailPage, LocationsPage, WarehouseDetailPage, WarehousesPage, ZoneDetailPage, ZonesPage } from './features/master-data/MasterDataPages';
import { NotFoundPage } from './features/NotFoundPage';

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppShell />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/warehouse-map" element={<WarehouseMapPage />} />
      <Route path="/master-data/warehouses" element={<WarehousesPage />} />
      <Route path="/master-data/warehouses/:id" element={<WarehouseDetailPage />} />
      <Route path="/master-data/zones" element={<ZonesPage />} />
      <Route path="/master-data/zones/:id" element={<ZoneDetailPage />} />
      <Route path="/master-data/locations" element={<LocationsPage />} />
      <Route path="/master-data/locations/:id" element={<LocationDetailPage />} />
      <Route path="/master-data/bins" element={<BinsPage />} />
      <Route path="/master-data/bins/:id" element={<BinDetailPage />} />
      <Route path="/master-data/item-uom-mapping" element={<ItemUomPage />} />
      <Route path="/inventory/balances" element={<BalancesPage />} />
      <Route path="/inventory/lots/:lotId" element={<LotDetailPage />} />
      <Route path="/inventory/movements" element={<MovementsPage />} />
      <Route path="/inventory/discrepancies" element={<DiscrepanciesPage />} />
      <Route path="/inbound/receipts" element={<ReceiptsListPage />} />
      <Route path="/inbound/receipts/new" element={<NewReceiptPage />} />
      <Route path="/inbound/receipts/:id" element={<ReceiptDetailPage />} />
      <Route path="/outbound/requests" element={<RequestsListPage />} />
      <Route path="/outbound/requests/new" element={<NewRequestPage />} />
      <Route path="/outbound/requests/:id" element={<RequestDetailPage />} />
      <Route path="/inventory/discrepancy-log" element={<BackendGapPage titleKey="inventory.discrepancies.title" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>,
  ),
);
