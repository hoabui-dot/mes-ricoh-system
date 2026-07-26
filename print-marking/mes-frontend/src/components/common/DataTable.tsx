import React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { cn } from '@/utils/cn'
import { EmptyState, Spinner } from '@/components/common'

interface DataTableProps<TData extends object> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  pageSize?: number
  showPagination?: boolean
  showSearch?: boolean
  searchPlaceholder?: string
  className?: string
  onRowClick?: (row: TData) => void
  selectable?: boolean
  onSelectionChange?: (selected: TData[]) => void
  stickyHeader?: boolean
}

export function DataTable<TData extends object>({
  data,
  columns,
  loading,
  emptyMessage = 'No data found',
  emptyDescription,
  pageSize = 25,
  showPagination = true,
  showSearch = true,
  searchPlaceholder = 'Search...',
  className,
  onRowClick,
  selectable,
  onSelectionChange,
  stickyHeader = true,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = React.useState('')

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    enableRowSelection: selectable,
  })

  React.useEffect(() => {
    if (onSelectionChange) {
      const selected = table.getSelectedRowModel().rows.map((r) => r.original)
      onSelectionChange(selected)
    }
  }, [rowSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex + 1

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      {showSearch && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-elevated)',
          borderRadius: '8px 8px 0 0',
        }}>
          <input
            className="input"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            style={{ maxWidth: 280 }}
            aria-label={searchPlaceholder}
          />
        </div>
      )}

      {/* Table container */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(10,12,15,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}>
            <Spinner size={28} />
          </div>
        )}
        <table className="mes-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      position: stickyHeader ? 'sticky' : undefined,
                      top: stickyHeader ? 0 : undefined,
                      zIndex: stickyHeader ? 10 : undefined,
                      width: header.column.getSize(),
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                          {header.column.getIsSorted() === 'asc'
                            ? '↑'
                            : header.column.getIsSorted() === 'desc'
                              ? '↓'
                              : '⇅'}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ border: 'none', padding: 0 }}>
                  <EmptyState
                    title={emptyMessage}
                    description={emptyDescription}
                  />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  style={{ cursor: onRowClick ? 'pointer' : undefined }}
                  className={row.getIsSelected() ? 'bg-orange-500/5' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showPagination && totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-elevated)',
          borderRadius: '0 0 8px 8px',
        }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {table.getFilteredRowModel().rows.length} rows
            {selectable && rowSelection && Object.keys(rowSelection).length > 0 &&
              ` · ${Object.keys(rowSelection).length} selected`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              «
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              ‹
            </button>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', padding: '0 8px' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              ›
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => table.setPageIndex(totalPages - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
