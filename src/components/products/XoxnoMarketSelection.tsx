'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { XoxnoSelection } from '@/lib/protocols/xoxno/v1/types'
import type { BorrowProduct, SupplyProduct } from '@/types'

export function XoxnoMarketSelection({
  item,
  kind,
  onChange,
}: {
  item: SupplyProduct | BorrowProduct
  kind: 'supply' | 'borrow'
  onChange: (selection: XoxnoSelection) => void
}) {
  if (!item.xoxno) return null
  const selected = item.xoxnoSelection
  const spoke = item.xoxno.spokes.find((s) => s.spokeId === selected?.spokeId)
  const capacity =
    kind === 'supply' ? spoke?.supplyCapacity : spoke?.borrowCapacity
  const collateral = spoke?.collaterals.find(
    (c) =>
      c.hubId === selected?.collateralHubId &&
      c.asset === selected?.collateralAsset
  )
  const context = `${item.assetSymbol} in ${item.xoxno.hubName}`
  return (
    <div className="space-y-3 py-3">
      <p className="text-sm font-medium">
        Account rules for {item.assetSymbol}
      </p>
      <p className="text-muted-foreground text-xs">
        Choose which collateral permissions and limits apply to this account.
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        className="grid w-full grid-cols-2 sm:grid-cols-3"
        aria-label={`XOXNO spoke for ${context}`}
        value={spoke ? String(spoke.spokeId) : ''}
        onValueChange={(value) => {
          if (value) onChange({ spokeId: Number(value) })
        }}
      >
        {item.xoxno.spokes.map((s) => {
          const unavailable =
            !s.canOpenAccount ||
            !(kind === 'supply' ? s.canSupply : s.canBorrow) ||
            s.paused ||
            s.frozen
          return (
            <ToggleGroupItem
              key={s.spokeId}
              value={String(s.spokeId)}
              disabled={unavailable}
              className="h-auto min-h-10 justify-start text-left text-xs whitespace-normal"
            >
              {s.spokeName}
              {unavailable && <span className="ml-1">· unavailable</span>}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      {kind === 'borrow' && spoke && (
        <Select
          value={
            selected?.collateralAsset
              ? `${selected.collateralHubId}:${selected.collateralAsset}`
              : ''
          }
          onValueChange={(value) => {
            const collateral = spoke.collaterals.find(
              (c) => `${c.hubId}:${c.asset}` === value
            )
            if (collateral)
              onChange({
                spokeId: spoke.spokeId,
                collateralHubId: collateral.hubId,
                collateralAsset: collateral.asset,
              })
          }}
        >
          <SelectTrigger aria-label={`XOXNO collateral for ${context}`}>
            <SelectValue placeholder="Choose collateral" />
          </SelectTrigger>
          <SelectContent>
            {spoke.collaterals.map((c) => (
              <SelectItem
                key={`${c.hubId}:${c.asset}`}
                value={`${c.hubId}:${c.asset}`}
                disabled={
                  !c.canSupply || !c.canBeCollateral || c.paused || c.frozen
                }
              >
                {c.symbol} · Hub {c.hubId} · LTV {(c.ltv * 100).toFixed(1)}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {collateral && (
        <p className="text-sm">
          Max LTV {(collateral.ltv * 100).toFixed(1)}% · Liquidation threshold{' '}
          {(collateral.lltv * 100).toFixed(1)}%
        </p>
      )}
      {spoke && (
        <p className="text-muted-foreground text-xs">
          Estimated {kind === 'supply' ? 'supply' : 'borrow'} capacity:{' '}
          {capacity?.usd == null
            ? '—'
            : formatCompactCurrency(capacity.usd, 'USD')}{' '}
        </p>
      )}
    </div>
  )
}
