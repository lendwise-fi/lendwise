import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function DataTableEmpty() {
  return (
    <div className="rounded-lg border">
      <Table className="mx-auto">
        <TableHeader>
          <TableRow>
            <TableHead>
              <Skeleton className="h-4 w-full" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-full" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-full" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-full" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(3)].map(() => (
            <TableRow key={Math.random()}>
              <TableCell>
                <Skeleton className="h-6 w-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
