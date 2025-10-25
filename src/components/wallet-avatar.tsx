'use client'

import { useEnsAvatar } from 'wagmi'
import JazzIcon from 'react-jazzicon'
import makeBlockie from 'ethereum-blockies-base64'
import Image from 'next/image'

export function WalletAvatar({
  size = 40,
  address,
}: {
  size?: number
  address: string
}) {
  const { data: ensAvatar } = useEnsAvatar({ name: address })

  if (ensAvatar) {
    return (
      <Image
        src={ensAvatar}
        alt="ENS Avatar"
        width={size}
        height={size}
        className="rounded-full"
      />
    )
  }

  const walletIconType = 'Blockies' // 'Blockies' | 'Jazzicons' | 'Polycons'

  if (walletIconType === ('Blockies' as string)) {
    return (
      <Image
        src={makeBlockie(address)}
        alt="Blockie Avatar"
        width={size}
        height={size}
        className="rounded-full"
      />
    )
  } else if (walletIconType === ('Jazzicons' as string)) {
    return (
      <JazzIcon diameter={size} seed={parseInt(address.slice(2, 10), 16)} />
    )
  } else {
    return (
      <Image
        src={makeBlockie(address)}
        alt="Blockie Avatar"
        width={size}
        height={size}
        className="rounded-full"
      />
    )
  }
}
