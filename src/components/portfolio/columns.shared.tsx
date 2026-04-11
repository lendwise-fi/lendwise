import { ColumnDef } from '@tanstack/react-table'

import { AddressBadge } from '@/components/badge/AddressBadge'

/** Reusable address column for any position table that has a `userAddress` field */
export function addressColumn<T extends { userAddress: string }>(
  isMobileHidden = true
): ColumnDef<T> {
  return {
    accessorKey: 'userAddress',
    header: 'Address',
    cell: ({ row }) => <AddressBadge address={row.original.userAddress} />,
    enableHiding: false,
    meta: {
      isMobileHidden,
    },
  }
}
