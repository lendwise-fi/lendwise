# Quick Start Guide

## Installation Steps

Follow these steps to get YieldImprove up and running:

### 1. Install Dependencies

**Important:** This project uses pnpm as the package manager.

```bash
# Install project dependencies
pnpm install
```

This will install all required packages including:
- Next.js 15
- React 19
- Tailwind CSS
- Shadcn UI components
- Recharts for data visualization
- All Radix UI primitives

### 2. Start Development Server

```bash
pnpm dev
```

The application will start on [http://localhost:3000](http://localhost:3000)

### 3. Explore the Application

Navigate through the sidebar to explore different features:

- **Dashboard** (`/dashboard`) - Portfolio overview and analytics
- **Lending** (`/lending`) - Find best lending opportunities
- **Borrowing** (`/borrowing`) - Compare borrowing rates
- **Portfolio** (`/portfolio`) - View all your positions
- **Risk Monitor** (`/risk`) - Track health factors and risks

## First Time Setup

### Understanding the Data

The application currently uses **mock data** defined in `lib/entities/`:
- `position.ts` - Sample lending and borrowing positions
- `protocol.ts` - DeFi protocols (Aave, Compound, etc.)
- `asset.ts` - Cryptocurrency assets

### Customizing Mock Data

To customize the mock data, edit the files in `lib/entities/`:

```typescript
// lib/entities/position.ts
const mockPositions: Position[] = [
  {
    protocol: 'Your Protocol',
    blockchain: 'ethereum',
    position_type: 'lending',
    // ... add your data
  }
]
```

## Next Steps

### Connect to Real Data

1. **Create API endpoints** in `app/api/` directory
2. **Update entity files** to fetch from your API
3. **Add environment variables** for API URLs

### Add Wallet Connection

1. Install wallet libraries:
   ```bash
   pnpm add wagmi viem @rainbow-me/rainbowkit
   ```

2. Configure providers in `app/layout.tsx`

3. Add wallet connect button to sidebar

### Deploy to Production

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

Or deploy to Vercel with one click:
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/yieldimprove)

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:
```bash
pnpm dev -- -p 3001
```

### Module Not Found Errors

Clear Next.js cache and reinstall:
```bash
rm -rf .next node_modules
pnpm install
pnpm dev
```

### TypeScript Errors

If you see TypeScript errors, ensure all dependencies are installed:
```bash
pnpm install --save-dev @types/node @types/react @types/react-dom
```

## Development Tips

### Hot Reload

Next.js has built-in hot reload. Changes to files will automatically refresh the browser.

### Adding New Pages

Create a new folder in `app/` directory:
```
app/
  ├── your-page/
  │   └── page.tsx
```

### Adding New Components

Store reusable components in `components/`:
```
components/
  ├── your-component.tsx
```

### Styling

- Use Tailwind utility classes
- Customize theme in `tailwind.config.ts`
- Global styles in `app/globals.css`

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Shadcn UI Components](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Recharts Documentation](https://recharts.org)

---

Happy coding! 🚀
