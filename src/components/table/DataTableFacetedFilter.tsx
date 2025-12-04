import * as React from 'react'

import { Column } from '@tanstack/react-table'
import { CheckIcon, PlusCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export type FilterOption = {
  label: string | React.ReactNode
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface DataTableFacetedFilter<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  options: FilterOption[]
  multiSelect?: boolean // New prop to enable/disable multi-selection
}

export function getUniqueColumnValues<TData>(
  data: TData[],
  columnId: keyof TData
) {
  return Array.from(new Set(data.map((row) => String(row[columnId])))).map(
    String
  )
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  multiSelect = true, // Default to multi-select for backward compatibility
}: DataTableFacetedFilter<TData, TValue>) {
  const facets = new Map(
    Array.from(column?.getFacetedUniqueValues() ?? []).map(([key, count]) => [
      String(key),
      count,
    ])
  )

  // Handle both single and multi-select modes
  const filterValue = column?.getFilterValue()
  const selectedValues = multiSelect
    ? new Set<string>(filterValue as string[])
    : new Set<string>(filterValue ? [filterValue as string] : [])

  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) =>
                      selectedValues.has(String(option.value))
                    )
                    .map((option) => {
                      return (
                        <Badge
                          variant="secondary"
                          key={option.value}
                          className="rounded-sm px-1 font-normal"
                        >
                          {option.label}
                        </Badge>
                      )
                    })
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(String(option.value))
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (multiSelect) {
                        // Multi-select mode: toggle selection
                        if (isSelected) {
                          selectedValues.delete(option.value)
                        } else {
                          selectedValues.add(option.value)
                        }
                        const filterValues = Array.from(selectedValues)
                        column?.setFilterValue(
                          filterValues.length ? filterValues : undefined
                        )
                      } else {
                        // Single-select mode: set only this value
                        if (isSelected) {
                          // Clicking selected item clears filter
                          column?.setFilterValue(undefined)
                        } else {
                          // Set single value as string, not array
                          column?.setFilterValue(option.value)
                        }
                        setOpen(false) // Close popover after selection
                      }
                    }}
                  >
                    <div
                      className={cn(
                        'border-primary mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <CheckIcon className={cn('h-4 w-4')} />
                    </div>
                    {option.icon && (
                      <option.icon className="text-muted-foreground mr-2 h-4 w-4" />
                    )}
                    <span>{option.label}</span>

                    <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                      {facets?.get(option.value) ?? 0}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      column?.setFilterValue(undefined)
                      if (!multiSelect) setOpen(false)
                    }}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
