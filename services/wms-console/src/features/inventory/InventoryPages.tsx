import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import type { Balance, InventoryMovement } from '../../lib/api/types';
import { daysUntil } from '../../lib/utils';
import { Button, Card, Input, SelectBase } from '../../components/ui';
import { DataTable } from '../../components/shared/DataTable';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { ExpiryBadge } from '../../components/shared/ExpiryBadge';
import { PurposeBadge, StatusBadge } from '../../components/shared/StatusBadge';

function Header({ title }: { title: string }) {
  return <h1 className="mb-5 text-2xl font-black text-slate-900">{title}</h1>;
}

export function BalancesPage() {
  const { t, formatNumber } = useI18n();
  const [params, setParams] = useSearchParams();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const queryParams = new URLSearchParams();
  if (params.get('item_revision_id')) queryParams.set('item_revision_id', params.get('item_revision_id')!);
  if (params.get('location_id')) queryParams.set('location_id', params.get('location_id')!);
  const balances = useQuery({ queryKey: qk.balances(queryParams.toString()), queryFn: () => api.listBalances(queryParams), refetchInterval: 20000 });
  const locationById = new Map((locations.data ?? []).map((location) => [location.location_id, location]));
  const filtered = useMemo(() => {
    const expiry = params.get('expiry');
    const showExpired = params.get('showExpired') === 'true';
    return (balances.data ?? []).filter((row) => {
      const days = daysUntil(row.expiry_date);
      if (!showExpired && days !== null && days < 0) return false;
      if (expiry === '7d') return days !== null && days >= 0 && days <= 7;
      return true;
    });
  }, [balances.data, params]);
  const column = createColumnHelper<Balance>();
  const columns = [
    column.accessor('lot_code', { header: t('inventory.lotCode'), cell: (info) => <Link className="font-mono font-semibold text-primary hover:underline" to={`/inventory/lots/${info.row.original.lot_id}`}>{info.getValue()}</Link> }),
    column.accessor('lot_id', { header: 'Lot ID', cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span> }),
    column.accessor('location_id', { header: t('master.locationId'), cell: (info) => <div className="space-y-1"><div className="font-mono text-xs">{locationById.get(info.getValue())?.location_code ?? info.getValue()}</div><PurposeBadge purpose={locationById.get(info.getValue())?.location_purpose} /></div> }),
    column.accessor('on_hand_qty', { header: t('common.quantity'), cell: (info) => <span className="tabular font-semibold">{formatNumber(info.getValue())}</span> }),
    column.accessor('expiry_date', { header: t('inventory.expiry'), cell: (info) => <ExpiryBadge expiryDate={info.getValue()} /> }),
    column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
  ];
  if (balances.isError) return <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />;
  return (
    <>
      <Header title={t('inventory.balances.title')} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1"><label className="text-xs font-semibold">{t('master.itemRevision')}</label><Input value={params.get('item_revision_id') ?? ''} onChange={(event) => setParams((prev) => { const next = new URLSearchParams(prev); event.target.value ? next.set('item_revision_id', event.target.value) : next.delete('item_revision_id'); return next; })} /></div>
        <div className="space-y-1"><label className="text-xs font-semibold">{t('master.locationId')}</label><SelectBase value={params.get('location_id') ?? ''} onValueChange={(value) => setParams((prev) => { const next = new URLSearchParams(prev); value ? next.set('location_id', value) : next.delete('location_id'); return next; })} options={[{ value: '', label: t('common.all') }, ...(locations.data ?? []).map((location) => ({ value: location.location_id, label: location.location_code }))]} /></div>
        <Button variant={params.get('expiry') === '7d' ? 'default' : 'outline'} onClick={() => setParams((prev) => { const next = new URLSearchParams(prev); next.set('expiry', '7d'); return next; })}>{t('inventory.nearExpiry')}</Button>
        <Button variant="ghost" onClick={() => setParams(new URLSearchParams())}>{t('common.clear')}</Button>
      </Card>
      <DataTable data={filtered} columns={columns} />
    </>
  );
}

export function LotDetailPage() {
  const { lotId = '' } = useParams();
  const { t, formatNumber } = useI18n();
  const balances = useQuery({ queryKey: qk.balances(`lot:${lotId}`), queryFn: () => api.listBalances(), refetchInterval: 20000 });
  const rows = (balances.data ?? []).filter((row) => row.lot_id === lotId);
  const column = createColumnHelper<Balance>();
  const columns = [
    column.accessor('location_id', { header: t('master.locationId'), cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span> }),
    column.accessor('on_hand_qty', { header: t('common.quantity'), cell: (info) => <span className="tabular font-semibold">{formatNumber(info.getValue())}</span> }),
    column.accessor('expiry_date', { header: t('inventory.expiry'), cell: (info) => <ExpiryBadge expiryDate={info.getValue()} /> }),
  ];
  if (balances.isError) return <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />;
  return <><Header title={t('inventory.lotDetail.title')} /><Card className="mb-4 p-5"><div className="font-mono text-sm">{lotId}</div><div className="mt-2 text-lg font-bold">{rows[0]?.lot_code ?? '-'}</div></Card><DataTable data={rows} columns={columns} /></>;
}

export function MovementsPage() {
  const { t, formatNumber } = useI18n();
  const [params, setParams] = useSearchParams();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const queryParams = new URLSearchParams();
  if (params.get('location_id')) queryParams.set('location_id', params.get('location_id')!);
  if (params.get('lot_id')) queryParams.set('lot_id', params.get('lot_id')!);
  queryParams.set('limit', '100');
  const movements = useQuery({ queryKey: qk.movements(queryParams.toString()), queryFn: () => api.listMovements(queryParams), refetchInterval: 20000 });
  const locationById = new Map((locations.data ?? []).map((location) => [location.location_id, location]));
  const column = createColumnHelper<InventoryMovement>();
  const columns = [
    column.accessor('occurred_at', { header: t('movement.occurredAt'), cell: (info) => <span className="font-mono text-xs">{new Date(info.getValue()).toLocaleString()}</span> }),
    column.accessor('movement_type', { header: t('movement.type'), cell: (info) => <span className="font-semibold">{t(`movement.type.${info.getValue()}`)}</span> }),
    column.accessor('lot_code', { header: t('inventory.lotCode'), cell: (info) => <Link className="font-mono text-xs text-primary hover:underline" to={`/inventory/lots/${info.row.original.lot_id}`}>{info.getValue()}</Link> }),
    column.accessor('from_location_id', { header: t('movement.from'), cell: (info) => <span className="font-mono text-xs">{info.getValue() ? locationById.get(info.getValue()!)?.location_code ?? info.getValue() : '-'}</span> }),
    column.accessor('to_location_id', { header: t('movement.to'), cell: (info) => <span className="font-mono text-xs">{info.getValue() ? locationById.get(info.getValue()!)?.location_code ?? info.getValue() : '-'}</span> }),
    column.accessor('qty', { header: t('common.quantity'), cell: (info) => <span className="tabular font-semibold">{formatNumber(info.getValue())}</span> }),
  ];
  if (movements.isError) return <ErrorState error={movements.error} onRetry={() => void movements.refetch()} />;
  return (
    <>
      <Header title={t('inventory.movements.title')} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1"><label className="text-xs font-semibold">{t('master.locationId')}</label><SelectBase value={params.get('location_id') ?? ''} onValueChange={(value) => setParams((prev) => { const next = new URLSearchParams(prev); value ? next.set('location_id', value) : next.delete('location_id'); return next; })} options={[{ value: '', label: t('common.all') }, ...(locations.data ?? []).map((location) => ({ value: location.location_id, label: location.location_code }))]} /></div>
        <div className="space-y-1"><label className="text-xs font-semibold">{t('inventory.lotCode')}</label><Input value={params.get('lot_id') ?? ''} onChange={(event) => setParams((prev) => { const next = new URLSearchParams(prev); event.target.value ? next.set('lot_id', event.target.value) : next.delete('lot_id'); return next; })} /></div>
        <Button variant="ghost" onClick={() => setParams(new URLSearchParams())}>{t('common.clear')}</Button>
      </Card>
      <DataTable data={movements.data ?? []} columns={columns} />
    </>
  );
}

export function DiscrepanciesPage() {
  const { t } = useI18n();
  return <><Header title={t('inventory.discrepancies.title')} /><EmptyState backendGap title={t('common.backendGap')} body={t('common.todoVerify')} /></>;
}
