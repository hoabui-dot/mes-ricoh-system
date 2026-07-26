import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Power, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { api } from '../../lib/api/client';
import { qk } from '../../lib/queryKeys';
import type { Bin, ItemUomMapping, Location, Warehouse, Zone } from '../../lib/api/types';
import { Button, Card, Dialog, DialogContent, DialogTitle, Input, SelectBase, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui';
import { ConfirmActionDialog } from '../../components/shared/ConfirmActionDialog';
import { DataTable } from '../../components/shared/DataTable';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { PurposeBadge, StatusBadge } from '../../components/shared/StatusBadge';
import { useAuth } from '../../context/AuthContext';

function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      {children}
    </div>
  );
}

function localizedName(value: string) {
  return { vi: value, en: value, ja: value, ko: value };
}

function confirmCreateBody(t: (key: string) => string, code?: string) {
  return code ? `${t('confirm.createBody')} ${code}` : t('confirm.createBody');
}

const warehouseSchema = z.object({ warehouse_code: z.string().min(1), warehouse_name: z.string().min(1), warehouse_description: z.string().optional(), site_id: z.string().min(1), status: z.string().default('Active') });
const zoneSchema = z.object({ warehouse_id: z.string().min(1), zone_code: z.string().min(1), zone_name: z.string().min(1), zone_type: z.string().min(1), status: z.string().default('Active') });
const locationSchema = z.object({
  zone_id: z.string().min(1),
  location_code: z.string().min(1),
  location_name: z.string().min(1),
  location_purpose: z.enum(['Storage', 'WorkCenterStaging']),
  staging_for_work_center_ref: z.string().optional(),
  status: z.string().default('Active'),
});
const binSchema = z.object({ location_id: z.string().min(1), bin_code: z.string().min(1), bin_name: z.string().optional(), capacity_qty: z.coerce.number().optional(), capacity_uom_id: z.string().optional(), status: z.string().default('Active') });
const mappingSchema = z.object({ item_revision_id: z.string().min(1), storage_uom_code: z.string().min(1), conversion_factor: z.coerce.number().positive(), default_bin_capacity_qty: z.coerce.number().optional() });

function CreateWarehouseDialog() {
  const [open, setOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<z.infer<typeof warehouseSchema> | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof warehouseSchema>>({ resolver: zodResolver(warehouseSchema), defaultValues: { status: 'Active' } });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof warehouseSchema>) => api.createWarehouse({ ...values, warehouse_name: localizedName(values.warehouse_name), warehouse_description: values.warehouse_description ? localizedName(values.warehouse_description) : null }),
    onSuccess: () => {
      toast.success(t('common.created'));
      setOpen(false);
      setPendingValues(null);
      form.reset({ status: 'Active', warehouse_description: '' });
      void qc.invalidateQueries({ queryKey: qk.warehouses });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.create')}</Button>
      <DialogContent>
        <DialogTitle>{t('master.warehouses.title')}</DialogTitle>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
          <Input placeholder={t('common.code')} {...form.register('warehouse_code')} />
          <Input placeholder={t('common.name')} {...form.register('warehouse_name')} />
          <Input placeholder={t('map.warehouseDescription')} {...form.register('warehouse_description')} />
          <Input placeholder={t('master.siteId')} {...form.register('site_id')} />
          <Button disabled={mutation.isPending}><Save className="h-4 w-4" />{t('common.submit')}</Button>
        </form>
      </DialogContent>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={confirmCreateBody(t, pendingValues?.warehouse_code)}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </Dialog>
  );
}

function CreateZoneDialog({ warehouseId }: { warehouseId?: string }) {
  const [open, setOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<z.infer<typeof zoneSchema> | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const form = useForm<z.infer<typeof zoneSchema>>({ resolver: zodResolver(zoneSchema), values: { warehouse_id: warehouseId ?? '', zone_code: '', zone_name: '', zone_type: 'Storage', status: 'Active' } });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof zoneSchema>) => api.createZone(values.warehouse_id, { ...values, zone_name: localizedName(values.zone_name) }),
    onSuccess: (_row, values) => {
      toast.success(t('common.created'));
      setOpen(false);
      setPendingValues(null);
      void qc.invalidateQueries({ queryKey: qk.zones(values.warehouse_id) });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.create')}</Button>
      <DialogContent>
        <DialogTitle>{t('master.zones.title')}</DialogTitle>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
          <Controller control={form.control} name="warehouse_id" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} disabled={Boolean(warehouseId)} placeholder={t('topbar.warehouse')} options={[{ value: '', label: t('topbar.warehouse') }, ...(warehouses.data ?? []).map((warehouse) => ({ value: warehouse.warehouse_id, label: warehouse.warehouse_code }))]} />
          )} />
          <Input placeholder={t('common.code')} {...form.register('zone_code')} />
          <Input placeholder={t('common.name')} {...form.register('zone_name')} />
          <Controller control={form.control} name="zone_type" render={({ field }) => (
            <SelectBase
              value={field.value}
              onValueChange={field.onChange}
              options={['Receiving', 'Storage', 'Picking', 'Staging', 'Shipping'].map((type) => ({ value: type, label: t(`zone.type.${type}`) }))}
            />
          )} />
          <Button disabled={mutation.isPending}><Save className="h-4 w-4" />{t('common.submit')}</Button>
        </form>
      </DialogContent>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={confirmCreateBody(t, pendingValues?.zone_code)}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </Dialog>
  );
}

function CreateLocationDialog({ zoneId }: { zoneId?: string }) {
  const [open, setOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<z.infer<typeof locationSchema> | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const zoneQueries = useQueries({ queries: (warehouses.data ?? []).map((warehouse) => ({ queryKey: qk.zones(warehouse.warehouse_id), queryFn: () => api.listWarehouseZones(warehouse.warehouse_id) })) });
  const zones = zoneQueries.flatMap((query) => query.data ?? []);
  const form = useForm<z.infer<typeof locationSchema>>({ resolver: zodResolver(locationSchema), values: { zone_id: zoneId ?? '', location_code: '', location_name: '', location_purpose: 'Storage', status: 'Active', staging_for_work_center_ref: '' } });
  const purpose = form.watch('location_purpose');
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof locationSchema>) => api.createLocation(values.zone_id, { ...values, location_name: localizedName(values.location_name), staging_for_work_center_ref: values.location_purpose === 'WorkCenterStaging' ? values.staging_for_work_center_ref : null }),
    onSuccess: (_row, values) => {
      toast.success(t('common.created'));
      setOpen(false);
      setPendingValues(null);
      void qc.invalidateQueries({ queryKey: qk.zoneLocations(values.zone_id) });
      void qc.invalidateQueries({ queryKey: qk.locations });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.create')}</Button>
      <DialogContent>
        <DialogTitle>{t('master.locations.title')}</DialogTitle>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
          <Controller control={form.control} name="zone_id" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} disabled={Boolean(zoneId)} placeholder={t('master.zoneId')} options={[{ value: '', label: t('master.zoneId') }, ...zones.map((zone) => ({ value: zone.zone_id, label: zone.zone_code }))]} />
          )} />
          <Input placeholder={t('common.code')} {...form.register('location_code')} />
          <Input placeholder={t('common.name')} {...form.register('location_name')} />
          <Controller control={form.control} name="location_purpose" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} options={[{ value: 'Storage', label: t('purpose.Storage') }, { value: 'WorkCenterStaging', label: t('purpose.WorkCenterStaging') }]} />
          )} />
          {purpose === 'WorkCenterStaging' ? <Input placeholder={t('master.stagingRef')} {...form.register('staging_for_work_center_ref')} /> : null}
          <Button disabled={mutation.isPending}><Save className="h-4 w-4" />{t('common.submit')}</Button>
        </form>
      </DialogContent>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={confirmCreateBody(t, pendingValues?.location_code)}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </Dialog>
  );
}

function CreateBinDialog({ locationId }: { locationId?: string }) {
  const [open, setOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<z.infer<typeof binSchema> | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const form = useForm<z.infer<typeof binSchema>>({ resolver: zodResolver(binSchema), values: { location_id: locationId ?? '', bin_code: '', bin_name: '', capacity_uom_id: 'PCS', status: 'Active' } });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof binSchema>) => api.createBin(values.location_id, { ...values, bin_name: values.bin_name ? localizedName(values.bin_name) : null }),
    onSuccess: (_row, values) => {
      toast.success(t('common.created'));
      setOpen(false);
      setPendingValues(null);
      void qc.invalidateQueries({ queryKey: qk.bins(values.location_id) });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.create')}</Button>
      <DialogContent>
        <DialogTitle>{t('master.bins.title')}</DialogTitle>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
          <Controller control={form.control} name="location_id" render={({ field }) => (
            <SelectBase value={field.value} onValueChange={field.onChange} disabled={Boolean(locationId)} placeholder={t('master.locationId')} options={[{ value: '', label: t('master.locationId') }, ...(locations.data ?? []).map((location) => ({ value: location.location_id, label: location.location_code }))]} />
          )} />
          <Input placeholder={t('common.code')} {...form.register('bin_code')} />
          <Input placeholder={t('common.name')} {...form.register('bin_name')} />
          <Input placeholder={t('master.capacity')} type="number" step="0.001" {...form.register('capacity_qty')} />
          <Input placeholder={t('master.uom')} {...form.register('capacity_uom_id')} />
          <Button disabled={mutation.isPending}><Save className="h-4 w-4" />{t('common.submit')}</Button>
        </form>
      </DialogContent>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={confirmCreateBody(t, pendingValues?.bin_code)}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </Dialog>
  );
}

function CreateMappingDialog() {
  const [open, setOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<z.infer<typeof mappingSchema> | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof mappingSchema>>({ resolver: zodResolver(mappingSchema), defaultValues: { storage_uom_code: 'PCS', conversion_factor: 1 } });
  const mutation = useMutation({
    mutationFn: api.createItemUomMapping,
    onSuccess: () => {
      toast.success(t('common.created'));
      setOpen(false);
      setPendingValues(null);
      void qc.invalidateQueries({ queryKey: qk.itemUom });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('common.create')}</Button>
      <DialogContent>
        <DialogTitle>{t('master.itemUom.title')}</DialogTitle>
        <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit((values) => setPendingValues(values))}>
          <Input placeholder={t('master.itemRevision')} {...form.register('item_revision_id')} />
          <Input placeholder={t('master.uom')} {...form.register('storage_uom_code')} />
          <Input placeholder="1" type="number" step="0.000001" {...form.register('conversion_factor')} />
          <Input placeholder={t('master.capacity')} type="number" step="0.001" {...form.register('default_bin_capacity_qty')} />
          <Button disabled={mutation.isPending}><Save className="h-4 w-4" />{t('common.submit')}</Button>
        </form>
      </DialogContent>
      <ConfirmActionDialog
        open={Boolean(pendingValues)}
        onOpenChange={(next) => !next && setPendingValues(null)}
        title={t('confirm.createTitle')}
        body={confirmCreateBody(t, pendingValues?.item_revision_id)}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => pendingValues && mutation.mutate(pendingValues)}
      />
    </Dialog>
  );
}

function DeactivateButton({ id, type, currentStatus }: { id: string; type: 'warehouse' | 'zone' | 'location'; currentStatus?: string }) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();
  const nextStatus = currentStatus === 'Inactive' ? 'Active' : 'Inactive';
  const mutation = useMutation({
    mutationFn: async () => {
      if (type === 'warehouse') return api.updateWarehouse(id, { status: nextStatus });
      if (type === 'zone') return api.updateZone(id, { status: nextStatus });
      return api.updateLocation(id, { status: nextStatus });
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      setConfirmOpen(false);
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => setConfirmOpen(true)}><Power className="h-4 w-4" />{t(`status.${nextStatus}`)}</Button>
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirm.statusTitle')}
        body={`${t('confirm.statusBody')} ${t(`status.${nextStatus}`)}`}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.close')}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

export function WarehousesPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const navigate = useNavigate();
  const { canMutate } = useAuth();
  const query = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const column = createColumnHelper<Warehouse>();
  const columns = [
    column.accessor('warehouse_code', { header: t('common.code') }),
    column.accessor((row) => resolve(row.warehouse_name), { id: 'name', header: t('common.name') }),
    column.accessor('site_id', { header: t('master.siteId') }),
    column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
    column.display({ id: 'actions', header: t('common.actions'), cell: (info) => canMutate ? <DeactivateButton id={info.row.original.warehouse_id} type="warehouse" currentStatus={info.row.original.status} /> : null }),
  ];
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <><PageHeader title={t('master.warehouses.title')}>{canMutate ? <CreateWarehouseDialog /> : null}</PageHeader><DataTable data={query.data ?? []} columns={columns} onRowClick={(row) => navigate(`/master-data/warehouses/${row.warehouse_id}`)} /></>;
}

export function ZonesPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const navigate = useNavigate();
  const { canMutate } = useAuth();
  const warehouses = useQuery({ queryKey: qk.warehouses, queryFn: api.listWarehouses });
  const zoneQueries = useQueries({ queries: (warehouses.data ?? []).map((warehouse) => ({ queryKey: qk.zones(warehouse.warehouse_id), queryFn: () => api.listWarehouseZones(warehouse.warehouse_id) })) });
  const zones = zoneQueries.flatMap((query) => query.data ?? []);
  const column = createColumnHelper<Zone>();
  const columns = [
    column.accessor('zone_code', { header: t('common.code') }),
    column.accessor((row) => resolve(row.zone_name), { id: 'name', header: t('common.name') }),
    column.accessor('zone_type', { header: t('master.zoneType'), cell: (info) => t(`zone.type.${info.getValue()}`) }),
    column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
    column.display({ id: 'actions', header: t('common.actions'), cell: (info) => canMutate ? <DeactivateButton id={info.row.original.zone_id} type="zone" currentStatus={info.row.original.status} /> : null }),
  ];
  return <><PageHeader title={t('master.zones.title')}>{canMutate ? <CreateZoneDialog /> : null}</PageHeader><DataTable data={zones} columns={columns} onRowClick={(row) => navigate(`/master-data/zones/${row.zone_id}`)} /></>;
}

export function LocationsPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const navigate = useNavigate();
  const { canMutate } = useAuth();
  const query = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const column = createColumnHelper<Location>();
  const columns = [
    column.accessor('location_code', { header: t('common.code') }),
    column.accessor((row) => resolve(row.location_name), { id: 'name', header: t('common.name') }),
    column.accessor('location_purpose', { header: t('master.locationPurpose'), cell: (info) => <PurposeBadge purpose={info.getValue()} /> }),
    column.accessor('staging_for_work_center_ref', { header: t('master.stagingRef') }),
    column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
    column.display({ id: 'actions', header: t('common.actions'), cell: (info) => canMutate ? <DeactivateButton id={info.row.original.location_id} type="location" currentStatus={info.row.original.status} /> : null }),
  ];
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <><PageHeader title={t('master.locations.title')}>{canMutate ? <CreateLocationDialog /> : null}</PageHeader><DataTable data={query.data ?? []} columns={columns} onRowClick={(row) => navigate(`/master-data/locations/${row.location_id}`)} /></>;
}

export function BinsPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const { canMutate } = useAuth();
  const locations = useQuery({ queryKey: qk.locations, queryFn: api.listLocations });
  const binQueries = useQueries({ queries: (locations.data ?? []).map((location) => ({ queryKey: qk.bins(location.location_id), queryFn: () => api.listLocationBins(location.location_id) })) });
  const bins = binQueries.flatMap((query) => query.data ?? []);
  const column = createColumnHelper<Bin>();
  const columns = [
    column.accessor('bin_code', { header: t('common.code') }),
    column.accessor((row) => resolve(row.bin_name), { id: 'name', header: t('common.name') }),
    column.accessor('capacity_qty', { header: t('master.capacity'), cell: (info) => <span className="tabular">{info.getValue() ?? '-'}</span> }),
    column.accessor('capacity_uom_id', { header: t('master.uom') }),
    column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
  ];
  return <><PageHeader title={t('master.bins.title')}>{canMutate ? <CreateBinDialog /> : null}</PageHeader><DataTable data={bins} columns={columns} /></>;
}

export function ItemUomPage() {
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const { canMutate } = useAuth();
  const query = useQuery({ queryKey: qk.itemUom, queryFn: api.listItemUomMappings });
  const column = createColumnHelper<ItemUomMapping>();
  const columns = [
    column.accessor('item_revision_id', { header: t('master.itemRevision') }),
    column.accessor((row) => row.item_code ?? '-', { id: 'item_code', header: t('common.code') }),
    column.accessor((row) => resolve(row.item_name), { id: 'name', header: t('common.name') }),
    column.accessor('storage_uom_code', { header: t('master.uom') }),
    column.accessor('conversion_factor', { header: 'Factor', cell: (info) => <span className="tabular">{info.getValue()}</span> }),
  ];
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <><PageHeader title={t('master.itemUom.title')}>{canMutate ? <CreateMappingDialog /> : null}</PageHeader><DataTable data={query.data ?? []} columns={columns} /></>;
}

export function WarehouseDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const warehouse = useQuery({ queryKey: qk.warehouse(id), queryFn: () => api.getWarehouse(id), enabled: Boolean(id) });
  const zones = useQuery({ queryKey: qk.zones(id), queryFn: () => api.listWarehouseZones(id), enabled: Boolean(id) });
  const column = createColumnHelper<Zone>();
  const columns = [column.accessor('zone_code', { header: t('common.code') }), column.accessor((row) => resolve(row.zone_name), { id: 'name', header: t('common.name') }), column.accessor('status', { header: t('common.status'), cell: (info) => <StatusBadge status={info.getValue()} /> })];
  if (warehouse.isError) return <ErrorState error={warehouse.error} onRetry={() => void warehouse.refetch()} />;
  return (
    <><PageHeader title={warehouse.data?.warehouse_code ?? t('master.warehouses.title')}><Link to="/master-data/warehouses"><Button variant="outline">{t('common.back')}</Button></Link></PageHeader>
      <Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="zones">{t('nav.zones')}</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-4"><Card className="grid gap-2 p-5"><div>{resolve(warehouse.data?.warehouse_name)}</div>{warehouse.data?.warehouse_description ? <div className="max-w-2xl text-sm leading-6 text-muted-foreground">{resolve(warehouse.data.warehouse_description)}</div> : null}<div className="text-sm text-muted-foreground">{warehouse.data?.site_id}</div><StatusBadge status={warehouse.data?.status} /></Card></TabsContent>
        <TabsContent value="zones" className="mt-4"><div className="mb-3 flex justify-end"><CreateZoneDialog warehouseId={id} /></div><DataTable data={zones.data ?? []} columns={columns} /></TabsContent>
      </Tabs>
    </>
  );
}

export function ZoneDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const zone = useQuery({ queryKey: qk.zone(id), queryFn: () => api.getZone(id), enabled: Boolean(id) });
  const locations = useQuery({ queryKey: qk.zoneLocations(id), queryFn: () => api.listZoneLocations(id), enabled: Boolean(id) });
  const column = createColumnHelper<Location>();
  const columns = [column.accessor('location_code', { header: t('common.code') }), column.accessor((row) => resolve(row.location_name), { id: 'name', header: t('common.name') }), column.accessor('location_purpose', { header: t('master.locationPurpose'), cell: (info) => <PurposeBadge purpose={info.getValue()} /> })];
  if (zone.isError) return <ErrorState error={zone.error} onRetry={() => void zone.refetch()} />;
  return <><PageHeader title={zone.data?.zone_code ?? t('master.zones.title')}><Link to="/master-data/zones"><Button variant="outline">{t('common.back')}</Button></Link></PageHeader><div className="mb-3 flex justify-end"><CreateLocationDialog zoneId={id} /></div><DataTable data={locations.data ?? []} columns={columns} /></>;
}

export function LocationDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const location = useQuery({ queryKey: qk.location(id), queryFn: () => api.getLocation(id), enabled: Boolean(id) });
  const bins = useQuery({ queryKey: qk.bins(id), queryFn: () => api.listLocationBins(id), enabled: Boolean(id) });
  const column = createColumnHelper<Bin>();
  const columns = [column.accessor('bin_code', { header: t('common.code') }), column.accessor((row) => resolve(row.bin_name), { id: 'name', header: t('common.name') }), column.accessor('capacity_qty', { header: t('master.capacity') })];
  if (location.isError) return <ErrorState error={location.error} onRetry={() => void location.refetch()} />;
  return (
    <><PageHeader title={location.data?.location_code ?? t('master.locations.title')}><Link to="/master-data/locations"><Button variant="outline">{t('common.back')}</Button></Link></PageHeader>
      <Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="bins">{t('nav.bins')}</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-4"><Card className="grid gap-2 p-5"><div>{resolve(location.data?.location_name)}</div><PurposeBadge purpose={location.data?.location_purpose} /><div className="text-sm text-muted-foreground">{location.data?.staging_for_work_center_ref}</div></Card></TabsContent>
        <TabsContent value="bins" className="mt-4"><div className="mb-3 flex justify-end"><CreateBinDialog locationId={id} /></div><DataTable data={bins.data ?? []} columns={columns} /></TabsContent>
      </Tabs>
    </>
  );
}

export function BinDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const resolve = useLocalizedText();
  const bin = useQuery({ queryKey: ['wms', 'bin', id], queryFn: () => api.getBin(id), enabled: Boolean(id) });
  const location = useQuery({ queryKey: qk.locations, queryFn: api.listLocations, enabled: Boolean(bin.data?.location_id) });
  if (bin.isError) return <ErrorState error={bin.error} onRetry={() => void bin.refetch()} />;
  const parent = (location.data ?? []).find((item) => item.location_id === bin.data?.location_id);
  return <><PageHeader title={bin.data?.bin_code ?? t('master.bins.title')}><Link to={parent ? `/master-data/locations/${parent.location_id}` : '/master-data/bins'}><Button variant="outline">{t('common.back')}</Button></Link></PageHeader><Card className="grid gap-2 p-5"><div className="font-semibold">{resolve(bin.data?.bin_name) || t('common.notAvailable')}</div><div className="text-sm text-muted-foreground">{t('master.locationId')}: {parent?.location_code || t('common.notAvailable')}</div><div className="text-sm text-muted-foreground">{t('master.capacity')}: {bin.data?.capacity_qty ?? t('common.notAvailable')}</div><StatusBadge status={bin.data?.status} /></Card></>;
}

export function BackendGapPage({ titleKey }: { titleKey: string }) {
  const { t } = useI18n();
  return <><PageHeader title={t(titleKey)} /><EmptyState backendGap title={t('common.backendGap')} body={t('common.todoVerify')} /></>;
}
