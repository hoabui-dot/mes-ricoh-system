import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Factory, Info, Search } from 'lucide-react';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import type { Balance, Bin, InventoryMovement, Location, Warehouse, Zone } from '../../lib/api/types';
import { daysUntil, formatWmsQuantity } from '../../lib/utils';
import { Card, Input, Sheet, SheetContent, SheetTitle, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui';
import { DataTable } from '../../components/shared/DataTable';
import { ExpiryBadge } from '../../components/shared/ExpiryBadge';
import { PurposeBadge } from '../../components/shared/StatusBadge';
import { ErrorState } from '../../components/shared/ErrorState';
import { createColumnHelper } from '@tanstack/react-table';

const MAP_REFETCH_MS = 20000;

function heat(balanceQty: number, maxQty: number, hasExpired: boolean, nearExpiry: boolean) {
  if (hasExpired) return '#fee2e2';
  if (nearExpiry) return '#fef3c7';
  if (balanceQty <= 0) return '#f8fafc';
  const opacity = Math.max(0.18, Math.min(0.75, balanceQty / Math.max(maxQty, 1)));
  return `rgba(22, 163, 74, ${opacity})`;
}

export function WarehouseMapPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Location | null>(null);
  const [searchParams] = useSearchParams();
  const scopedLocationId = searchParams.get('location_id');
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const zoneQueries = useQueries({ queries: (warehouses.data ?? []).map((warehouse) => ({ queryKey: qk.zones(warehouse.warehouse_id), queryFn: () => api.listWarehouseZones(warehouse.warehouse_id) })) });
  const zones = zoneQueries.flatMap((query) => query.data ?? []);
  const locationQueries = useQueries({ queries: zones.map((zone) => ({ queryKey: qk.zoneLocations(zone.zone_id), queryFn: () => api.listZoneLocations(zone.zone_id) })) });
  const locations = locationQueries.flatMap((query) => query.data ?? []);
  const binQueries = useQueries({ queries: locations.map((location) => ({ queryKey: qk.bins(location.location_id), queryFn: () => api.listLocationBins(location.location_id) })) });
  const bins = binQueries.flatMap((query) => query.data ?? []);
  const balances = useQuery({ queryKey: qk.balances('map'), queryFn: () => api.listBalances(), refetchInterval: MAP_REFETCH_MS });
  const rows = balances.data ?? [];
  const byLocation = useMemo(() => {
    const map = new Map<string, Balance[]>();
    rows.forEach((row) => map.set(row.location_id, [...(map.get(row.location_id) ?? []), row]));
    return map;
  }, [rows]);
  const maxQty = Math.max(1, ...rows.map((row) => row.on_hand_qty));
  const hasError = warehouses.isError || balances.isError;
  if (hasError) return <ErrorState error={warehouses.error ?? balances.error} onRetry={() => { void warehouses.refetch(); void balances.refetch(); }} />;

  const zonesById = new Map(zones.map((zone) => [zone.zone_id, zone]));
  const binsByLocation = new Map<string, Bin[]>();
  bins.forEach((bin) => binsByLocation.set(bin.location_id, [...(binsByLocation.get(bin.location_id) ?? []), bin]));
  const matching = (location: Location) => {
    if (scopedLocationId && location.location_id !== scopedLocationId) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return location.location_code.toLowerCase().includes(q) || (byLocation.get(location.location_id) ?? []).some((row) => row.lot_code.toLowerCase().includes(q));
  };

  useEffect(() => {
    if (!scopedLocationId) return;
    const location = locations.find((item) => item.location_id === scopedLocationId);
    if (location) setSelected(location);
  }, [locations, scopedLocationId]);

  return (
    <TooltipProvider>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">{t('map.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('map.subtitle')}</p>
        </div>
        <div className="relative w-80">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('map.search')} />
        </div>
      </div>
      <Card className="mb-4 flex flex-wrap gap-3 p-4 text-xs">
        <span className="rounded border bg-slate-50 px-2 py-1">{t('map.legendStorage')}</span>
        <span className="staging-hatch rounded border border-info/30 px-2 py-1 text-info">{t('map.legendStaging')}</span>
        <span className="rounded border border-success/30 bg-success/10 px-2 py-1 text-success">{t('map.legendHealthy')}</span>
        <span className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-amber-700">{t('map.legendExpiring')}</span>
        <span className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{t('map.legendExpired')}</span>
      </Card>
      <div className="grid gap-4">
        {(warehouses.data ?? []).map((warehouse: Warehouse) => {
          const warehouseZones = zones.filter((zone) => zone.warehouse_id === warehouse.warehouse_id);
          return (
            <Card key={warehouse.warehouse_id} className="p-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-sm font-black text-slate-900">{warehouse.warehouse_code}</h2>
                    {warehouse.warehouse_description ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('map.warehouseDescription')}>
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          <div className="space-y-1">
                            <div className="font-semibold">{t('map.warehouseDescription')}</div>
                            <div className="leading-5">{resolve(warehouse.warehouse_description)}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{resolve(warehouse.warehouse_name)}</div>
                </div>
                <span className="rounded border bg-slate-50 px-2 py-1 text-xs font-semibold">{t('common.status')}: {t(`status.${warehouse.status}`)}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {warehouseZones.map((zone: Zone) => {
                  const zoneLocations = locations.filter((location) => location.zone_id === zone.zone_id);
                  const size = Math.ceil(Math.sqrt(Math.max(zoneLocations.length, 1)));
                  return (
                    <div key={zone.zone_id} className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div><div className="font-bold">{zone.zone_code}</div><div className="text-xs text-muted-foreground">{resolve(zone.zone_name)}</div></div>
                        <span className="rounded bg-secondary px-2 py-1 text-xs">{t(`zone.type.${zone.zone_type}`)}</span>
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
                        {zoneLocations.map((location) => {
                          const locationBalances = byLocation.get(location.location_id) ?? [];
                          const qty = locationBalances.reduce((sum, row) => sum + row.on_hand_qty, 0);
                          const hasExpired = locationBalances.some((row) => {
                            const days = daysUntil(row.expiry_date);
                            return days !== null && days < 0;
                          });
                          const nearExpiry = locationBalances.some((row) => {
                            const days = daysUntil(row.expiry_date);
                            return days !== null && days >= 0 && days <= 7;
                          });
                          const visible = matching(location);
                          return (
                            <Tooltip key={location.location_id}>
                              <TooltipTrigger asChild>
                                <button
                                  className={`min-h-24 rounded-md border p-2 text-left transition ${location.location_purpose === 'WorkCenterStaging' ? 'staging-hatch border-info/40' : 'border-slate-300'} ${visible ? 'opacity-100' : 'opacity-20'} ${search && visible ? 'ring-2 ring-action' : ''}`}
                                  style={{ backgroundColor: heat(qty, maxQty, hasExpired, nearExpiry) }}
                                  onClick={() => setSelected(location)}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs font-bold">{location.location_code}</span>
                                    {location.location_purpose === 'WorkCenterStaging' ? <Factory className="h-4 w-4 text-info" /> : null}
                                  </div>
                                  <div className="mt-3 text-xs tabular">{formatWmsQuantity(qty)}</div>
                                  <div className="mt-1 grid grid-cols-4 gap-1">
                                    {(binsByLocation.get(location.location_id) ?? []).slice(0, 8).map((bin) => <span key={bin.bin_id} className="h-2 rounded-sm bg-slate-700/40" />)}
                                  </div>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1">
                                  <div className="font-mono">{location.location_code}</div>
                                  <div>{t(`purpose.${location.location_purpose}`)}</div>
                                  <div>{formatWmsQuantity(qty)}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetTitle>{selected?.location_code}</SheetTitle>
          {selected ? <LocationDrawer location={selected} zone={zonesById.get(selected.zone_id)} balances={byLocation.get(selected.location_id) ?? []} /> : null}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

function LocationDrawer({ location, zone, balances }: { location: Location; zone?: Zone; balances: Balance[] }) {
  const { t } = useI18n();
  const movementParams = new URLSearchParams({ location_id: location.location_id, limit: '20' });
  const movements = useQuery({ queryKey: qk.movements(movementParams.toString()), queryFn: () => api.listMovements(movementParams), refetchInterval: MAP_REFETCH_MS });
  const balanceColumn = createColumnHelper<Balance>();
  const balanceColumns = [
    balanceColumn.accessor('lot_code', { header: t('inventory.lotCode') }),
    balanceColumn.accessor('on_hand_qty', { header: t('common.quantity'), cell: (info) => <span className="tabular">{formatWmsQuantity(info.getValue())}</span> }),
    balanceColumn.accessor('expiry_date', { header: t('inventory.expiry'), cell: (info) => <ExpiryBadge expiryDate={info.getValue()} /> }),
  ];
  const movementColumn = createColumnHelper<InventoryMovement>();
  const movementColumns = [
    movementColumn.accessor('occurred_at', { header: t('movement.occurredAt'), cell: (info) => <span className="font-mono text-xs">{new Date(info.getValue()).toLocaleString()}</span> }),
    movementColumn.accessor('movement_type', { header: t('movement.type'), cell: (info) => <span className="font-semibold">{t(`movement.type.${info.getValue()}`)}</span> }),
    movementColumn.accessor('lot_code', { header: t('inventory.lotCode'), cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span> }),
    movementColumn.accessor('qty', { header: t('common.quantity'), cell: (info) => <span className="tabular">{formatWmsQuantity(info.getValue())}</span> }),
  ];
  return (
    <Tabs defaultValue="overview" className="mt-6">
      <TabsList><TabsTrigger value="overview">{t('map.drawerOverview')}</TabsTrigger><TabsTrigger value="balances">{t('map.drawerBalances')}</TabsTrigger><TabsTrigger value="movements">{t('map.drawerMovements')}</TabsTrigger></TabsList>
      <TabsContent value="overview" className="mt-4 space-y-3 text-sm">
        <div className="font-mono">{zone?.zone_code} / {location.location_code}</div>
        <PurposeBadge purpose={location.location_purpose} />
        <div className="text-muted-foreground">{location.staging_for_work_center_ref}</div>
      </TabsContent>
      <TabsContent value="balances" className="mt-4"><DataTable data={balances} columns={balanceColumns} /></TabsContent>
      <TabsContent value="movements" className="mt-4">
        {movements.isError ? <ErrorState error={movements.error} onRetry={() => void movements.refetch()} /> : <DataTable data={movements.data ?? []} columns={movementColumns} />}
      </TabsContent>
    </Tabs>
  );
}
