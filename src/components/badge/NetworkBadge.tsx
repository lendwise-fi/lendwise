import { NetworkIcon } from '@/components/icon'
import { Badge } from '@/components/ui/badge'

export function NetworkBadge({ networkSlug }: { networkSlug: string }) {
  return (
    <Badge
      variant="outline"
      className="flex w-fit items-center gap-2 rounded-lg px-2 py-1.5 whitespace-nowrap"
    >
      <NetworkIcon networkSlug={networkSlug} />
      <span className="text-muted-foreground text-xs">
        {networkSlug.charAt(0).toUpperCase() + networkSlug.slice(1)}
      </span>
    </Badge>
  )
}
