import { AlertTriangle, Languages, LogOut, ShieldCheck } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { SUPPORTED_LOCALES, languageNames, useI18n } from '@mom-platform/i18n-ui-shared';
import { api, setTokenProvider } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import { useAuth } from '../../context/AuthContext';
import { useWarehouseFilter } from '../../context/WarehouseFilterContext';
import { useWmsRealtime } from '../../hooks/useWmsRealtime';
import { Button, SelectBase } from '../ui';
import { CommandPalette } from './CommandPalette';

export function Topbar() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { warehouseId, setWarehouseId } = useWarehouseFilter();
  const realtimeStatus = useWmsRealtime();
  const client = useQueryClient();
  setTokenProvider(() => user?.token);
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const degraded = client.getQueryCache().findAll().some((query) => query.state.status === 'error' && (query.state.error as any)?.status === 503);

  return (
    <header className="flex h-16 items-center gap-3 border-b bg-card px-4">
      <SelectBase
        value={warehouseId}
        onValueChange={setWarehouseId}
        className="w-64"
        aria-label={t('topbar.warehouse')}
        options={[
          { value: '', label: t('topbar.allWarehouses') },
          ...(warehouses.data ?? []).map((warehouse) => ({ value: warehouse.warehouse_id, label: warehouse.warehouse_code })),
        ]}
      />
      <CommandPalette />
      <div className="ml-auto flex items-center gap-2">
        <div className={degraded ? 'flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-amber-700' : 'flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success'}>
          {degraded ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {degraded ? t('topbar.breakerDegraded') : t('topbar.breakerHealthy')}
        </div>
        <div className={realtimeStatus === 'connected' ? 'hidden items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success xl:flex' : 'flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-amber-700'}>
          <span className="h-2 w-2 rounded-full bg-current" />
          {t(`topbar.realtime.${realtimeStatus}`)}
        </div>
        <Languages className="h-4 w-4 text-muted-foreground" />
        <SelectBase
          value={locale}
          onValueChange={(value) => setLocale(value as any)}
          className="w-36"
          aria-label="Language"
          options={SUPPORTED_LOCALES.map((item) => ({ value: item, label: languageNames[item] }))}
        />
        <div className="hidden text-right text-xs md:block">
          <div className="font-semibold">{user?.username}</div>
          <div className="text-muted-foreground">{user?.roles.slice(0, 2).join(', ')}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
