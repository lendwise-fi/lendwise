/**
 * Configuration for pages that should display the InfoSidebar
 *
 * The InfoSidebar provides contextual information, wallet management,
 * and account details. Add pages here that would benefit from this
 * additional context.
 */
export const INFOSIDEBAR_PAGES = [
  '/risk',
  '/portfolio',
  '/dashboard',
  '/vaults',
] as const

/**
 * Check if the current pathname should show the InfoSidebar
 *
 * @param pathname - The current pathname from Next.js usePathname hook
 * @returns boolean indicating whether to show the InfoSidebar
 */
export const shouldShowInfoSidebar = (pathname: string): boolean => {
  return INFOSIDEBAR_PAGES.some((page) => pathname.startsWith(page))
}
