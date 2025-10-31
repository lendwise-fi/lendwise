'use client'

import { Skeleton } from '@/components/ui/skeleton'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card'

export function PieChartDonutTextSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>
          <Skeleton className="h-5 w-40" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-3 w-30" />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <div className="grid h-full grid-cols-2">
          <div className="flex h-full w-full items-center justify-center">
            <Skeleton className="flex h-52 w-52 items-center justify-center rounded-full">
              <div className="bg-card flex h-3/5 w-3/5 items-center justify-center rounded-full">
                <Skeleton className="flex h-4 w-14 rounded-xl" />
              </div>
            </Skeleton>
          </div>

          <div className="flex h-full w-11/12 flex-col items-center justify-center space-y-2">
            <Skeleton className="h-3 w-50" />
            <Skeleton className="h-3 w-50" />
            <Skeleton className="h-3 w-50" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="text-muted-foreground leading-none">
          <Skeleton className="h-3 w-30" />
        </div>
      </CardFooter>
    </Card>
  )
}
