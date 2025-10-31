'use client'

import { usePathname } from 'next/navigation'

import { InfoSidebar } from '@/components/info-sidebar'
import { shouldShowInfoSidebar } from '@/config/infoSidebar'

interface MainContentProps {
  children: React.ReactNode
}

export function MainContent({ children }: MainContentProps) {
  const pathname = usePathname()
  const showInfoSidebar = shouldShowInfoSidebar(pathname)

  return (
    <div className="flex flex-1">
      {showInfoSidebar && <InfoSidebar />}
      <div className="flex-1 p-6">{children}</div>
    </div>
  )
}
