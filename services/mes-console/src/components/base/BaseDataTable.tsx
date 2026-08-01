import React, { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Table,
} from '@tanstack/react-table';
import { ArrowLeft, ArrowRight, ArrowUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SelectBase } from '../ui/select';
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export type BaseDataTableProps<T> = {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  toolbar?: React.ReactNode;
  search?: string;
  onSearchChange?: (value: string) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  pagination?: { pageIndex: number; pageSize: number };
  onPaginationChange?: OnChangeFn<{ pageIndex: number; pageSize: number }>;
  pageCount?: number;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (original: T, index: number) => string;
  onRowClick?: (row: T) => void;
  expandableRows?: boolean;
  renderExpandedRow?: (row: T) => React.ReactNode;
  stickyHeader?: boolean;
  emptyState?: React.ReactNode;
  pageSizeOptions?: number[];
  className?: string;
};

export type BaseDataTableColumn<T> = ColumnDef<T, any> & { align?: 'left' | 'center' | 'right' };

const DEFAULT_PAGE_SIZES = [10, 50, 100];

/** The only MES business-facing table API. TanStack remains an implementation detail here. */
export function BaseDataTable<T>({
  columns,
  data,
  loading = false,
  toolbar,
  search,
  onSearchChange,
  sorting,
  onSortingChange,
  pagination = { pageIndex: 0, pageSize: 10 },
  onPaginationChange,
  pageCount,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
  expandableRows = false,
  renderExpandedRow,
  stickyHeader = false,
  emptyState,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  className,
}: BaseDataTableProps<T>) {
  const { t } = useI18n();
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [internalPagination, setInternalPagination] = useState(pagination);
  const effectivePagination = onPaginationChange ? pagination : internalPagination;
  const effectiveSorting = sorting ?? internalSorting;
  const effectiveSelection = rowSelection ?? internalSelection;

  const table = useReactTable({
    data,
    columns,
    state: { sorting: effectiveSorting, pagination: effectivePagination, rowSelection: effectiveSelection, expanded },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onPaginationChange: (next) => { if (onPaginationChange) onPaginationChange(next); else setInternalPagination(next); },
    onRowSelectionChange: onRowSelectionChange ?? setInternalSelection,
    onExpandedChange: setExpanded,
    getRowId,
    enableRowSelection: Boolean(rowSelection || onRowSelectionChange),
    getRowCanExpand: () => expandableRows,
    manualPagination: pageCount !== undefined,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const pageTotal = pageCount ?? table.getPageCount();
  const from = rows.length ? effectivePagination.pageIndex * effectivePagination.pageSize + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;

  return (
    <div className={className}>
      {(toolbar || onSearchChange) && <div className="mb-3 flex flex-wrap items-center justify-between gap-3">{onSearchChange && <Input value={search ?? ''} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('topbar.search')} className="max-w-sm" />}{toolbar}</div>}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <UiTable>
          <TableHeader className={stickyHeader ? 'sticky top-0 z-10 bg-surface-subtle' : undefined}>
            {table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => { const align = (header.column.columnDef as BaseDataTableColumn<T>).align || 'left'; return <TableHead key={header.id} className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : undefined}>{header.isPlaceholder ? null : <Button type="button" variant="ghost" size="sm" className={`h-8 ${align === 'right' ? 'ml-auto' : '-ml-3'}`} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getCanSort() && <ArrowUpDown className="h-3 w-3" />}</Button>}</TableHead>; })}</TableRow>)}
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">{t('common.loading')}</TableCell></TableRow> : rows.map((row) => <React.Fragment key={row.id}><TableRow data-state={row.getIsSelected() ? 'selected' : undefined} className={onRowClick ? 'cursor-pointer' : undefined} onClick={() => onRowClick?.(row.original)}>{row.getVisibleCells().map((cell) => { const align = (cell.column.columnDef as BaseDataTableColumn<T>).align || 'left'; return <TableCell key={cell.id} className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>; })}</TableRow>{row.getIsExpanded() && renderExpandedRow ? <TableRow><TableCell colSpan={columns.length}>{renderExpandedRow(row.original)}</TableCell></TableRow> : null}</React.Fragment>)}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">{emptyState ?? t('common.empty')}</TableCell></TableRow>}
          </TableBody>
        </UiTable>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"><span className="text-xs text-muted-foreground">{from ? `${from}-${to}` : t('common.empty')}</span><div className="flex items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">{t('table.rowsPerPage')}</span><SelectBase value={String(effectivePagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))} className="h-8 w-24" aria-label={t('table.rowsPerPage')} options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))} /><Button type="button" variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ArrowLeft className="h-4 w-4" />{t('table.previous')}</Button><span className="min-w-20 text-center text-xs font-semibold text-muted-foreground">{effectivePagination.pageIndex + 1} / {Math.max(pageTotal, 1)}</span><Button type="button" variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>{t('table.next')}<ArrowRight className="h-4 w-4" /></Button></div></div>
    </div>
  );
}
