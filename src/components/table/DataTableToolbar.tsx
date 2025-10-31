'use client'

import type { Table } from '@tanstack/react-table'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { DataTableFacetedFilter } from './DataTableFacetedFilter'
import { DataTableViewOptions } from './DataTableViewOption'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchableColumn?: string
  filterableColumns?: {
    column: string
    title: string
    options: { value: string; label: string | React.ReactNode }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  searchableColumn,
  filterableColumns,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchableColumn && (
          <Input
            placeholder="Filter..."
            value={
              (table.getColumn(searchableColumn)?.getFilterValue() as string) ??
              ''
            }
            onChange={(event) =>
              table
                .getColumn(searchableColumn)
                ?.setFilterValue(event.target.value)
            }
            className="h-8 w-[150px] lg:w-[250px]"
          />
        )}
        {filterableColumns?.map(
          (col) =>
            table.getColumn(col.column) && (
              <DataTableFacetedFilter
                key={col.column}
                column={table.getColumn(col.column)}
                title={col.title}
                options={col.options.filter((o) => o.value)}
              />
            )
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  )
}
