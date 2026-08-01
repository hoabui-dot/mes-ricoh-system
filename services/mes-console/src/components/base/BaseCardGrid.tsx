import React, { useState } from 'react';
import { getCoreRowModel, getPaginationRowModel, useReactTable, type PaginationState } from '@tanstack/react-table';
import { SelectBase } from '../ui/select';
import { BasePagination } from './BasePagination';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export type BaseCardGridProps<T> = {
  data: T[];
  renderCard: (item: T) => React.ReactNode;
  getRowId?: (item: T, index: number) => string;
  loading?: boolean;
  emptyState?: React.ReactNode;
  pageSize?: number;
  pageSizeOptions?: number[];
  className?: string;
};

/** Paginated card surface backed by TanStack pagination, without exposing TanStack to feature pages. */
export function BaseCardGrid<T>({
  data,
  renderCard,
  getRowId,
  loading = false,
  emptyState,
  pageSize = 10,
  pageSizeOptions = [10, 50, 100],
  className,
}: BaseCardGridProps<T>) {
  const { t } = useI18n();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const table = useReactTable({
    data,
    columns: [{ id: 'card', accessorFn: (item) => item }],
    state: { pagination },
    onPaginationChange: setPagination,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return <div className={className}>
    {loading ? <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">{t('common.loading')}</div> : rows.length ? <div className="grid gap-2 md:grid-cols-2">{rows.map((row) => <React.Fragment key={row.id}>{renderCard(row.original)}</React.Fragment>)}</div> : <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">{emptyState ?? t('common.empty')}</div>}
    {!loading && data.length > 0 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{pagination.pageIndex * pagination.pageSize + 1}-{Math.min((pagination.pageIndex + 1) * pagination.pageSize, data.length)} / {data.length}</span>
      <div className="flex items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">{t('table.rowsPerPage')}</span><SelectBase value={String(pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))} className="h-8 w-20" aria-label={t('table.rowsPerPage')} options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))} /><BasePagination page={pagination.pageIndex + 1} pageCount={Math.max(pageCount, 1)} onPageChange={(page) => table.setPageIndex(page - 1)} /></div>
    </div> : null}
  </div>;
}
