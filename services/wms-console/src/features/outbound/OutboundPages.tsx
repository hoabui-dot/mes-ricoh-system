import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { PackageCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import { Button, Card, Input, SelectBase } from '../../components/ui';
import { ConfirmActionDialog } from '../../components/shared/ConfirmActionDialog';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { StatusBadge } from '../../components/shared/StatusBadge';

const requestSchema = z.object({ wo_id: z.string().min(1), work_center_ref: z.string().min(1), item_revision_id: z.string().min(1), required_qty: z.coerce.number().positive(), uom_code: z.string().optional() });

export function RequestsListPage() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('outbound.requests.title')}</h1><Link to="/outbound/requests/new"><Button><Plus className="h-4 w-4" />{t('common.create')}</Button></Link></div>
      <EmptyState backendGap title={t('common.backendGap')} body={t('common.todoVerify')} />
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
  const { t, formatNumber } = useI18n();
  const query = useQuery({ queryKey: qk.request(id), queryFn: () => api.getMaterialRequest(id), enabled: Boolean(id) });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const row = query.data;
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('outbound.detail.title')}</h1><Link to="/outbound/requests"><Button variant="outline">{t('common.back')}</Button></Link></div>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3"><span className="font-mono text-sm">{row?.request_id}</span><StatusBadge status={row?.status} /></div>
        <div className="grid grid-cols-4 gap-4">
          <Metric label={t('outbound.alreadyStaged')} value={formatNumber(row?.already_staged_qty ?? 0)} />
          <Metric label={t('outbound.transferred')} value={formatNumber(row?.transferred_qty ?? 0)} />
          <Metric label={t('outbound.available')} value={formatNumber(row?.available_qty ?? 0)} />
          <Metric label={t('outbound.shortfall')} value={formatNumber(row?.shortfall_qty ?? 0)} danger={row?.status === 'Shortage'} />
        </div>
      </Card>
    </>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className={danger ? 'rounded-md border border-destructive/30 bg-destructive/10 p-4' : 'rounded-md border bg-secondary p-4'}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-black tabular">{value}</div></div>;
}
