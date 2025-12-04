import { ChainIcon } from '@/components/icon'
import { Badge } from '@/components/ui/badge'

export function ChainBadge({ chainSlug }: { chainSlug: string }) {
  return (
    <Badge
      variant="outline"
      className="flex w-fit items-center gap-2 rounded-lg px-2 py-1.5 whitespace-nowrap"
    >
      <ChainIcon chainSlug={chainSlug} />
      <span className="text-muted-foreground text-xs">
        {chainSlug.charAt(0).toUpperCase() + chainSlug.slice(1)}
      </span>
    </Badge>
  )
}
