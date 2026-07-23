import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import { daysUntil } from '../../lib/utils';
import { Card } from '../../components/ui';
import { ErrorState } from '../../components/shared/ErrorState';

export function DashboardPage() {
  const { t, formatNumber } = useI18n();
  const balances = useQuery({ queryKey: qk.balances('dashboard'), queryFn: () => api.listBalances(), refetchInterval: 20000 });
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  if (balances.isError) return <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />;
  const rows = balances.data ?? [];
  const expiring = rows.filter((row) => { const days = daysUntil(row.expiry_date); return days !== null && days >= 0 && days <= 7; }).length;
  const total = rows.reduce((sum, row) => sum + row.on_hand_qty, 0);
  const staging = rows.filter((row) => locations.data?.find((location) => location.location_id === row.location_id)?.location_purpose === 'WorkCenterStaging').length;
  const byLocation = Array.from(rows.reduce((map, row) => map.set(row.location_id, (map.get(row.location_id) ?? 0) + row.on_hand_qty), new Map<string, number>())).slice(0, 8).map(([location, qty]) => ({ location: locations.data?.find((item) => item.location_id === location)?.location_code ?? location.slice(0, 8), qty }));
  return (
    <>
      <div className="mb-5"><h1 className="text-2xl font-black">{t('dashboard.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Kpi label={t('dashboard.totalQty')} value={formatNumber(total)} to="/inventory/balances" />
        <Kpi label={t('dashboard.expiring')} value={formatNumber(expiring)} to="/inventory/balances?expiry=7d" />
        <Kpi label={t('dashboard.shortages')} value="-" to="/outbound/requests?status=Shortage" />
        <Kpi label={t('dashboard.stagingStock')} value={formatNumber(staging)} to="/warehouse-map" />
      </div>
      <Card className="mt-4 h-80 p-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byLocation}><XAxis dataKey="location" /><YAxis /><Tooltip /><Bar dataKey="qty" fill="#ea6b2c" radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}

function Kpi({ label, value, to }: { label: string; value: string; to: string }) {
  return <Link to={to}><Card className="p-5 transition hover:border-action/60"><div className="text-xs font-semibold text-muted-foreground">{label}</div><div className="mt-3 text-3xl font-black tabular">{value}</div></Card></Link>;
}
