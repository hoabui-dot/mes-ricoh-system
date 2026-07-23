import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import { Button, Card, Input, SelectBase } from '../../components/ui';
import { ConfirmActionDialog } from '../../components/shared/ConfirmActionDialog';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { PurposeBadge, StatusBadge } from '../../components/shared/StatusBadge';

const lineSchema = z.object({ item_revision_id: z.string().min(1), lot_code: z.string().min(1), qty: z.coerce.number().positive(), uom_code: z.string().min(1), expiry_date: z.string().optional() });
const receiptSchema = z.object({ receipt_code: z.string().optional(), warehouse_location_id: z.string().min(1), lines: z.array(lineSchema).min(1) });

export function ReceiptsListPage() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-black">{t('inbound.receipts.title')}</h1>
        <Link to="/inbound/receipts/new"><Button><Plus className="h-4 w-4" />{t('common.create')}</Button></Link>
      </div>
      <EmptyState backendGap title={t('common.backendGap')} body={t('common.todoVerify')} />
    </>
  );
}

export function NewReceiptPage() {
  const { t } = useI18n();
  const [pendingValues, setPendingValues] = useState<z.infer<typeof receiptSchema> | null>(null);
  const navigate = useNavigate();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const storageLocations = (locations.data ?? []).filter((location) => location.location_purpose === 'Storage' && location.status === 'Active');
  const form = useForm<z.infer<typeof receiptSchema>>({ resolver: zodResolver(receiptSchema), defaultValues: { lines: [{ item_revision_id: '', lot_code: '', qty: 1, uom_code: 'PCS', expiry_date: '' }] } });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const mutation = useMutation({
    mutationFn: api.createReceipt,
    onSuccess: (row) => {
      toast.success(t('common.created'));
      setPendingValues(null);
      navigate(`/inbound/receipts/${row.receipt_id}`);
    },
  });
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{t('inbound.new.title')}</h1><Link to="/inbound/receipts"><Button variant="outline">{t('common.back')}</Button></Link></div>
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
        <Card className="grid gap-3 p-5">
          <Input placeholder={t('inbound.receiptCode')} {...form.register('receipt_code')} />
          <Controller control={form.control} name="warehouse_location_id" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} placeholder={t('master.locationId')} options={[{ value: '', label: t('master.locationId') }, ...storageLocations.map((location) => ({ value: location.location_id, label: location.location_code }))]} />
          )} />
          <p className="text-sm text-muted-foreground">{t('inbound.storageOnly')}</p>
        </Card>
        <Card className="space-y-3 p-5">
          {lines.fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-5 gap-3">
              <Input placeholder={t('master.itemRevision')} {...form.register(`lines.${index}.item_revision_id`)} />
              <Input placeholder={t('inventory.lotCode')} {...form.register(`lines.${index}.lot_code`)} />
              <Input placeholder={t('common.quantity')} type="number" step="0.001" {...form.register(`lines.${index}.qty`)} />
              <Input placeholder={t('master.uom')} {...form.register(`lines.${index}.uom_code`)} />
              <Input type="date" {...form.register(`lines.${index}.expiry_date`)} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => lines.append({ item_revision_id: '', lot_code: '', qty: 1, uom_code: 'PCS', expiry_date: '' })}><Plus className="h-4 w-4" />{t('common.create')}</Button>
        </Card>
        {mutation.isError ? <ErrorState error={mutation.error} onRetry={() => mutation.reset()} /> : null}
        <Button disabled={mutation.isPending}><Send className="h-4 w-4" />{t('common.submit')}</Button>
      </form>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={pendingValues?.receipt_code ? `${t('confirm.createBody')} ${pendingValues.receipt_code}` : t('confirm.createBody')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </>
  );
}

export function ReceiptDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const query = useQuery({ queryKey: qk.receipt(id), queryFn: () => api.getReceipt(id), enabled: Boolean(id) });
  const confirm = useMutation({
    mutationFn: () => api.confirmReceipt(id),
    onSuccess: () => {
      toast.success(t('inbound.confirmed'));
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: qk.receipt(id) });
      void qc.invalidateQueries({ queryKey: qk.balances('') });
    },
  });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <div className="mb-5 flex items-center justify-between"><h1 className="text-2xl font-black">{query.data?.receipt_code ?? t('inbound.detail.title')}</h1><Link to="/inbound/receipts"><Button variant="outline">{t('common.back')}</Button></Link></div>
      <Card className="space-y-3 p-5">
        <div className="font-mono text-sm">{query.data?.receipt_id}</div>
        <StatusBadge status={query.data?.status} />
        <div className="text-sm text-muted-foreground">{query.data?.warehouse_location_id}</div>
        {query.data?.status === 'Draft' ? <Button disabled={confirm.isPending} onClick={() => setConfirmOpen(true)}><CheckCircle className="h-4 w-4" />{t('inbound.confirmReceipt')}</Button> : null}
      </Card>
      {confirm.isError ? <div className="mt-4"><ErrorState error={confirm.error} onRetry={() => confirm.mutate()} /></div> : null}
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirm.receiptTitle')}
        body={t('confirm.receiptBody')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={confirm.isPending}
        onConfirm={() => confirm.mutate()}
      />
    </>
  );
}
