import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Info, PackageCheck, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import { formatWmsQuantity } from '../../lib/utils';
import type { Bin } from '../../lib/api/types';
import { LocationHierarchyCard, type LocationHierarchyContext, type LocationHierarchyLabels } from '../../components/wms/location-hierarchy';
import { Button, Card, Input, SelectBase, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui';
import { ConfirmActionDialog } from '../../components/shared/ConfirmActionDialog';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { StatusBadge } from '../../components/shared/StatusBadge';

const requestSchema = z.object({ wo_id: z.string().min(1), work_center_ref: z.string().min(1), item_revision_id: z.string().min(1), required_qty: z.coerce.number().positive(), uom_code: z.string().optional() });

function movementLabels(t: (key: string) => string): LocationHierarchyLabels {
  return { warehouse: t('outbound.fulfillment.warehouse'), zone: t('outbound.fulfillment.zone'), storageLocation: t('outbound.fulfillment.storageLocation'), workCenterStaging: t('outbound.fulfillment.workCenterStaging'), bins: t('outbound.fulfillment.bins'), availableBins: t('outbound.fulfillment.availableBins'), movementBin: t('outbound.fulfillment.movementBin'), openLocation: t('outbound.fulfillment.openLocation'), unknownLocation: t('outbound.fulfillment.unknownLocation') };
}

function MovementRoute({ movement, source, destination, t }: { movement: any; source: LocationHierarchyContext; destination: LocationHierarchyContext; t: (key: string) => string }) {
  const labels = movementLabels(t);
  return <div className="grid min-w-[760px] grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center gap-3"><div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('movement.from')}</div>{movement.existing ? <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-sm text-muted-foreground">{t('outbound.fulfillment.existingStaging')}</div> : <LocationHierarchyCard direction="source" context={source} labels={labels} actualBinId={movement.from_bin_id} />}</div><ArrowRight className="h-5 w-5 justify-self-center text-action" aria-hidden="true" /><div><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('movement.to')}</div><LocationHierarchyCard direction="destination" context={destination} labels={labels} actualBinId={movement.to_bin_id} /></div></div>;
}

export function RequestsListPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['outbound', 'material-requests'], queryFn: api.listMaterialRequests });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('outbound.requests.title')}</h1><div className="flex gap-2"><Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</Button><Link to="/outbound/requests/new"><Button><Plus className="h-4 w-4" />{t('common.create')}</Button></Link></div></div>
      {rows.length === 0 ? <EmptyState title={t('outbound.requests.empty')} body={t('outbound.requests.emptyHint')} /> : <Card className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="border-b bg-secondary text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t('outbound.requestCode')}</th><th className="px-4 py-3">{t('outbound.itemName')}</th><th className="px-4 py-3">{t('outbound.workOrderName')}</th><th className="px-4 py-3">{t('outbound.workCenterName')}</th><th className="px-4 py-3">{t('outbound.requiredQty')}</th><th className="px-4 py-3">{t('outbound.requestStatus')}</th><th className="px-4 py-3">{t('outbound.createdAt')}</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.request_id} className="hover:bg-secondary/60"><td className="px-4 py-3 font-mono font-semibold"><Link className="text-action hover:underline" to={`/outbound/requests/${row.request_id}`}>{row.request_code || 'MR'}</Link><div className="text-xs text-muted-foreground">{row.source_system || 'MES'}</div></td><td className="px-4 py-3 text-xs"><div className="font-semibold text-foreground">{row.item_name || t('common.notAvailable')}</div><div className="font-mono text-muted-foreground">{row.item_code || t('common.notAvailable')}</div></td><td className="px-4 py-3 text-xs"><div className="font-semibold text-foreground">{row.work_order_name || t('common.notAvailable')}</div><div className="font-mono text-muted-foreground">{row.work_order_code || t('common.notAvailable')}</div></td><td className="px-4 py-3 text-xs"><div className="font-semibold text-foreground">{row.work_center_name || t('outbound.workCenterUnavailable')}</div><div className="font-mono text-muted-foreground">{row.work_center_code || t('outbound.workCenterUnavailable')}</div></td><td className="px-4 py-3 tabular">{formatWmsQuantity(row.required_qty ?? 0)} <span className="text-muted-foreground">{row.uom_code || t('outbound.itemUnit')}</span></td><td className="px-4 py-3"><StatusBadge status={row.status} /></td><td className="px-4 py-3 text-xs text-muted-foreground">{row.created_at ? formatDateTime(row.created_at) : '-'}</td></tr>)}</tbody></table></Card>}
    </>
  );
}

export function NewRequestPage() {
  const { t } = useI18n();
  const [pendingValues, setPendingValues] = useState<z.infer<typeof requestSchema> | null>(null);
  const navigate = useNavigate();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const stagingLocations = (locations.data ?? []).filter((location) => location.location_purpose === 'WorkCenterStaging' && location.status === 'Active');
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { required_qty: 1, uom_code: 'PCS' } });
  const mutation = useMutation({
    mutationFn: api.createMaterialRequest,
    onSuccess: (row) => {
      toast.success(row.status === 'Shortage' ? t('status.Shortage') : t('common.created'));
      setPendingValues(null);
      navigate(`/outbound/requests/${row.request_id}`);
    },
  });
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('outbound.new.title')}</h1><Link to="/outbound/requests"><Button variant="outline">{t('common.back')}</Button></Link></div>
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
        <Card className="grid gap-3 p-5">
          <Input placeholder="WO ID" {...form.register('wo_id')} />
          <Controller control={form.control} name="work_center_ref" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} placeholder={t('outbound.workCenter')} options={[{ value: '', label: t('outbound.workCenter') }, ...stagingLocations.map((location) => ({ value: location.staging_for_work_center_ref ?? '', label: `${location.location_code} · ${location.staging_for_work_center_ref}` }))]} />
          )} />
          <Input placeholder={t('master.itemRevision')} {...form.register('item_revision_id')} />
          <Input placeholder={t('outbound.requiredQty')} type="number" step="0.001" {...form.register('required_qty')} />
          <Input placeholder={t('master.uom')} {...form.register('uom_code')} />
        </Card>
        {mutation.isError ? <ErrorState error={mutation.error} onRetry={() => mutation.reset()} /> : null}
        <Button disabled={mutation.isPending}><PackageCheck className="h-4 w-4" />{t('common.submit')}</Button>
      </form>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={pendingValues?.wo_id ? `${t('confirm.createBody')} ${pendingValues.wo_id}` : t('confirm.createBody')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </>
  );
}

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const query = useQuery({ queryKey: qk.request(id), queryFn: () => api.getMaterialRequest(id), enabled: Boolean(id) });
  const movementQuery = useQuery({ queryKey: ['outbound', 'request-movements', id, query.data?.wo_id, query.data?.work_center_ref, query.data?.item_revision_id], queryFn: () => api.listMaterialRequestMovements(query.data?.wo_id || '', query.data?.work_center_ref || '', query.data?.item_revision_id || ''), enabled: Boolean(query.data?.wo_id && query.data?.work_center_ref && query.data?.item_revision_id) });
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const zoneQueries = useQueries({ queries: (warehouses.data ?? []).map((warehouse) => ({ queryKey: qk.zones(warehouse.warehouse_id), queryFn: () => api.listWarehouseZones(warehouse.warehouse_id) })) });
  const zones = zoneQueries.flatMap((item) => item.data ?? []);
  const locationQuery = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const locations = locationQuery.data ?? [];
  const binQueries = useQueries({ queries: locations.map((location) => ({ queryKey: qk.bins(location.location_id), queryFn: () => api.listLocationBins(location.location_id) })) });
  const bins = binQueries.flatMap((item) => item.data ?? []);
  const stagingBalances = useQuery({ queryKey: ['outbound', 'request-staging-balances', id, query.data?.item_revision_id, query.data?.staging_location_id], queryFn: () => { const params = new URLSearchParams({ item_revision_id: query.data?.item_revision_id || '', location_id: query.data?.staging_location_id || '' }); return api.listBalances(params); }, enabled: Boolean(query.data?.item_revision_id && query.data?.staging_location_id && query.data?.status === 'Staged') });
  const contexts = useMemo(() => {
    const zoneById = new Map(zones.map((zone) => [zone.zone_id, zone]));
    const warehouseById = new Map((warehouses.data ?? []).map((warehouse) => [warehouse.warehouse_id, warehouse]));
    const binsByLocation = new Map<string, Bin[]>();
    bins.forEach((bin) => binsByLocation.set(bin.location_id, [...(binsByLocation.get(bin.location_id) ?? []), bin]));
    const map = new Map<string, LocationHierarchyContext>();
    locations.forEach((location) => { const zone = zoneById.get(location.zone_id); map.set(location.location_id, { location, zone, warehouse: zone ? warehouseById.get(zone.warehouse_id) : undefined, bins: binsByLocation.get(location.location_id) ?? [] }); });
    return map;
  }, [bins, locations, warehouses.data, zones]);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const row = query.data;
  const transferRows = (movementQuery.data ?? []).filter((movement) => movement.movement_type === 'TRANSFER_TO_STAGING');
  const existingRows = transferRows.length === 0 && row?.status === 'Staged' ? (stagingBalances.data ?? []).map((balance) => ({ movement_id: `existing-${balance.lot_id}`, movement_type: 'EXISTING_STAGING', lot_id: balance.lot_id, lot_code: balance.lot_code, item_revision_id: row.item_revision_id, from_location_id: null, to_location_id: row.staging_location_id, qty: balance.on_hand_qty, expiry_date: balance.expiry_date, uom_code: row.uom_code, occurred_at: '', existing: true })) : [];
  const fulfillmentRows = [...transferRows, ...existingRows];
  const locationIds = [...new Set(fulfillmentRows.flatMap((movement) => [movement.from_location_id, movement.to_location_id].filter(Boolean) as string[]))];
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('outbound.detail.title')}</h1><Link to="/outbound/requests"><Button variant="outline">{t('common.back')}</Button></Link></div>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3"><span className="font-mono text-sm">{row?.request_code || 'MR'}</span><span className="text-xs text-muted-foreground">{row?.source_system || 'MES'}</span><StatusBadge status={row?.status} /></div>
        <TooltipProvider>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t('outbound.alreadyStaged')} value={`${formatWmsQuantity(row?.already_staged_qty ?? 0)} ${row?.uom_code || t('outbound.itemUnit')}`} />
          <Metric label={t('outbound.transferred')} value={`${formatWmsQuantity(row?.transferred_qty ?? 0)} ${row?.uom_code || t('outbound.itemUnit')}`} />
          <Metric label={t('outbound.available')} tooltip={t('outbound.fulfillment.availableHelp')} value={`${formatWmsQuantity(row?.available_qty ?? 0)} ${row?.uom_code || t('outbound.itemUnit')}`} />
          <Metric label={t('outbound.shortfall')} tooltip={t('outbound.fulfillment.shortfallHelp')} value={`${formatWmsQuantity(row?.shortfall_qty ?? 0)} ${row?.uom_code || t('outbound.itemUnit')}`} danger={row?.status === 'Shortage'} />
        </div>
        <section className="mt-6 border-t pt-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t('outbound.fulfillment.title')}</h2>{locationIds.length > 0 ? <Link className="text-sm font-semibold text-action hover:underline" to={`/warehouse-map?location_id=${locationIds[0]}`}>{t('outbound.fulfillment.openMap')}</Link> : null}</div>{row?.status === 'Shortage' ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">{t('outbound.fulfillment.shortage')} <span className="font-semibold">{formatWmsQuantity(row.shortfall_qty ?? 0)} {row.uom_code || t('outbound.itemUnit')}</span></div> : null}{movementQuery.isLoading || stagingBalances.isLoading ? <div className="text-sm text-muted-foreground">{t('common.loading')}</div> : <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="border-b bg-secondary text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">{t('inventory.lotCode')}</th><th className="px-3 py-3">{t('outbound.fulfillment.route')}</th><th className="px-3 py-3">{t('common.quantity')}</th><th className="px-3 py-3">{t('inventory.expiry')}</th><th className="px-3 py-3">{t('movement.type')}</th><th className="px-3 py-3">{t('movement.occurredAt')}</th></tr></thead><tbody className="divide-y">{fulfillmentRows.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{t('outbound.fulfillment.noRows')}</td></tr> : fulfillmentRows.map((movement: any) => <tr key={movement.movement_id} className="align-top"><td className="px-3 py-3 font-mono text-xs">{movement.lot_code || t('common.notAvailable')}</td><td className="px-3 py-3"><MovementRoute movement={movement} source={contexts.get(movement.from_location_id) ?? { bins: [] }} destination={contexts.get(movement.to_location_id) ?? { bins: [] }} t={t} /></td><td className="px-3 py-3 tabular font-semibold">{formatWmsQuantity(movement.qty)} {movement.uom_code || row?.uom_code || t('outbound.itemUnit')}</td><td className="px-3 py-3">{movement.expiry_date ? formatDateOnly(movement.expiry_date) : t('outbound.fulfillment.noExpiry')}</td><td className="px-3 py-3">{movement.existing ? t('outbound.fulfillment.existingBalance') : t(`movement.type.${movement.movement_type}`)}</td><td className="px-3 py-3 whitespace-nowrap">{movement.occurred_at ? formatDateTime(movement.occurred_at) : '-'}</td></tr>)}</tbody></table></div>}</section>
        </TooltipProvider>
      </Card>
    </>
  );
}

function Metric({ label, value, danger, tooltip }: { label: string; value: string; danger?: boolean; tooltip?: string }) {
  return <div className={danger ? 'rounded-md border border-destructive/30 bg-destructive/10 p-4' : 'rounded-md border bg-secondary p-4'}><div className="flex items-center gap-1 text-xs text-muted-foreground">{label}{tooltip ? <Tooltip><TooltipTrigger asChild><button type="button" className="rounded p-0.5 hover:text-foreground" aria-label={tooltip}><Info className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-xs">{tooltip}</TooltipContent></Tooltip> : null}</div><div className="mt-2 text-2xl font-black tabular">{value}</div></div>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDateOnly(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
