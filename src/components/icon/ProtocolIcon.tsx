'use client'

import { useState } from 'react'

import Image from 'next/image'

type ProtocolIconProps = {
  protocol: string
  size?: number
  className?: string
}

/**
 * ProtocolIcon component
 * Displays protocol logos from /public/icons/protocol/
 *
 * Usage:
 * <ProtocolIcon protocol="morpho" size={32} />
 * <ProtocolIcon protocol="aave" size={24} />
 */
export const ProtocolIcon = ({
  protocol,
  size = 20,
  className = '',
}: ProtocolIconProps) => {
  const [error, setError] = useState(false)

  // Normalize protocol name to lowercase for file matching
  const normalizedProtocol = protocol.split('_')[0]
  const iconPath = `/icons/protocol/${normalizedProtocol}.svg`

  const handleError = () => {
    setError(true)
  }

  // Error state - show fallback with protocol initials
  if (error) {
    return (
      <div
        className={`bg-muted flex items-center justify-center rounded-full ${className}`}
        style={{ width: size, height: size }}
        title={protocol}
      >
        <span
          className="text-muted-foreground font-bold uppercase"
          style={{ fontSize: size * 0.35 }}
        >
          {normalizedProtocol.slice(0, 2)}
        </span>
      </div>
    )
  }

  // Success state - show protocol logo
  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
      title={protocol}
    >
      <Image
        src={iconPath}
        alt={`${protocol} logo`}
        fill
        onError={handleError}
        className="object-cover"
      />
    </div>
  )
}
