# InfoSidebar Configuration

The InfoSidebar is conditionally displayed based on the current page route. This provides contextual information, wallet management, and account details where it makes the most sense.

## Behavior

- **Closed by default**: The sidebar starts in a collapsed state (20px width) showing only wallet avatars
- **Hover to reveal**: When you hover over the sidebar area, a toggle button appears in the top-right corner
- **Click to expand**: Click the toggle button to expand the sidebar to full width (288px) showing detailed wallet information
- **Click to collapse**: Click again to return to the collapsed state

## Adding New Pages

To add the InfoSidebar to a new page, simply add the route to the `INFOSIDEBAR_PAGES` array in `/src/config/infoSidebar.ts`:

```typescript
export const INFOSIDEBAR_PAGES = [
  '/risk', // Risk management page
  '/portfolio', // Portfolio overview
  '/dashboard', // Main dashboard
  '/lending', // Lending positions
  '/borrowing', // Borrowing positions
  '/vaults', // Vault management
  // Add your new page here
  '/your-new-page',
] as const
```

## How it Works

1. The `MainContent` component uses Next.js's `usePathname` hook to get the current route
2. It checks if the current path starts with any of the configured pages using the `shouldShowInfoSidebar` function
3. If it matches, the InfoSidebar is rendered alongside the main content
4. The layout automatically adjusts to accommodate the sidebar when present
5. The sidebar uses local React state (not global state) since it's always closed by default and only opened when needed

## Current Pages with InfoSidebar

- **Risk** (`/risk`) - Risk monitoring and health factors
- **Portfolio** (`/portfolio`) - Portfolio optimization and allocation
- **Dashboard** (`/dashboard`) - Overview and key metrics
- **Lending** (`/lending`) - Lending positions and yield optimization
- **Borrowing** (`/borrowing`) - Borrowing strategies and collateral management
- **Vaults** (`/vaults`) - Vault management and positions
