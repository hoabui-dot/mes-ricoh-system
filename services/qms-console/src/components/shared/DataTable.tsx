import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type PaginationState } from '@tanstack/react-table';
import { ArrowLeft, ArrowRight, ArrowUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { Button, Input, SelectBase, Table, TBody, TD, TH, THead, TR } from '../ui';
import { EmptyState } from './EmptyState';

const PAGE_SIZE_OPTIONS = [10, 50, 100];

export function DataTable<T>({ data, columns, searchPlaceholder, onRowClick }: { data: T[]; columns: ColumnDef<T, any>[]; searchPlaceholder?: string; onRowClick?: (row: T) => void }) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPageSize = [10, 50, 100].includes(Number(searchParams.get('pageSize'))) ? Number(searchParams.get('pageSize')) : 10;
  const initialPageIndex = Math.max(Number(searchParams.get('page') ?? 1) - 1, 0);
  const [globalFilter, setGlobalFilter] = useState(searchParams.get('q') ?? '');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: initialPageIndex, pageSize: initialPageSize });
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (globalFilter) next.set('q', globalFilter); else next.delete('q');
    next.set('page', String(pagination.pageIndex + 1));
    next.set('pageSize', String(pagination.pageSize));
    setSearchParams(next, { replace: true });
  }, [globalFilter, pagination.pageIndex, pagination.pageSize]);
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, pagination },
    onGlobalFilterChange: (value) => { setGlobalFilter(String(value ?? '')); setPagination((current) => ({ ...current, pageIndex: 0 })); },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const filteredCount = table.getFilteredRowModel().rows.length;
  const firstRow = filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(filteredCount, (pagination.pageIndex + 1) * pagination.pageSize);

  return (
    <div className="space-y-3">
      <Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder={searchPlaceholder ?? t('topbar.search')} className="max-w-sm" />
      <div className="rounded-md border bg-card">
        <Table>
          <THead>
            {table.getHeaderGroups().map((group) => (
              <TR key={group.id}>
                {group.headers.map((header) => (
                  <TH key={header.id}>
                    {header.isPlaceholder ? null : (
                      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() ? <ArrowUpDown className="h-3 w-3" /> : null}
                      </Button>
                    )}
                  </TH>
                ))}
              </TR>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.map((row) => (
              <TR key={row.id} className={onRowClick ? 'cursor-pointer' : undefined} onClick={() => onRowClick?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {filteredCount === 0 ? t('table.noRows') : t('table.range', { from: firstRow, to: lastRow, total: filteredCount })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t('table.rowsPerPage')}</span>
          <SelectBase
            value={String(pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
            className="h-8 w-24"
            aria-label={t('table.rowsPerPage')}
            options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
          />
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ArrowLeft className="h-4 w-4" />
            {t('table.previous')}
          </Button>
          <span className="min-w-20 text-center text-xs font-semibold text-muted-foreground">
            {t('table.page', { page: table.getState().pagination.pageIndex + 1, pages: Math.max(table.getPageCount(), 1) })}
          </span>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            {t('table.next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {table.getRowModel().rows.length === 0 ? <EmptyState title={t('common.empty')} body={t('common.empty')} /> : null}
    </div>
  );
}
