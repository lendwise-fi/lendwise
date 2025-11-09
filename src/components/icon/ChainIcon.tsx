'use client'

import { useState } from 'react'

import Image from 'next/image'

type ChainIconProps = {
  chainSlug: string
  size?: number
  className?: string
}

/**
 * ChainIcon component
 * Displays chain logos from /public/icons/chain/
 *
 * Usage:
 * <ChainIcon chainSlug="ethereum" size={32} />
 * <ChainIcon chainSlug="polygon" size={24} />
 */
export const ChainIcon = ({
  chainSlug,
  size = 18,
  className = '',
}: ChainIconProps) => {
  const [error, setError] = useState(false)

  // Normalize protocol name to lowercase for file matching
  const normalizedChainSlug = chainSlug.toLowerCase()
  const iconPath = `/icons/chain/${normalizedChainSlug}.svg`

  const handleError = () => {
    setError(true)
  }

  // Error state - show fallback with protocol initials
  if (error) {
    return (
      <div
        className={`bg-muted flex items-center justify-center rounded-full ${className}`}
        style={{ width: size, height: size }}
        title={chainSlug}
      >
        <span
          className="text-muted-foreground font-bold uppercase"
          style={{ fontSize: size * 0.35 }}
        >
          {chainSlug.slice(0, 2)}
        </span>
      </div>
    )
  }

  // Success state - show chain logo
  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      title={chainSlug}
    >
      <Image
        src={iconPath}
        alt={`${chainSlug} logo`}
        fill
        onError={handleError}
        className="object-cover"
      />
    </div>
  )
}
