import { CopyButton } from '@/components/ui/shadcn-io/copy-button'
import { WalletAvatar } from '@/components/wallet/WalletAvatar'
import { cn } from '@/lib/utils'
import { formatAddress } from '@/lib/utils'

export function AddressBadge({
  address,
  noCopy,
  border,
}: {
  address: string
  noCopy?: boolean
  border?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5',
        border && 'border'
      )}
    >
      <WalletAvatar address={address} size={20} />
      <span className="font-mono">{formatAddress(address)}</span>
      {!noCopy && <CopyButton content={address} variant="ghost" size="sm" />}
    </div>
  )
}
