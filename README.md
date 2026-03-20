# YieldImprove - DeFi Portfolio Optimization Platform

A modern Next.js 15 application for optimizing DeFi supplying and borrowing positions across multiple protocols and blockchains.

![YieldImprove](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwind-css)

## Features

- 📊 **Dashboard**: Real-time portfolio overview with key metrics
- 💰 **Supplying Optimization**: Find the best supplying rates across protocols
- 💳 **Borrowing Optimization**: Minimize borrowing costs with intelligent protocol selection
- 📈 **Portfolio Tracker**: Monitor all positions across chains in one place
- 🛡️ **Risk Monitor**: Track health factors and manage liquidation risks
- 🎨 **Modern UI**: Built with Shadcn UI components and Tailwind CSS
- ⚡ **Fast**: Powered by Next.js 15 with App Router

## Tech Stack

- **Framework**: Next.js 15.1.0
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS 3.4 + Shadcn UI
- **Charts**: Recharts 2.13
- **Icons**: Lucide React
- **UI Components**: Radix UI primitives

## Getting Started

### Prerequisites

- pnpm 9.x or higher

### Installation

1. **Clone or navigate to the project directory**

```bash
cd /Users/cedric/Projects/SmarttDev/yieldimprove
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Run ESLint**

```bash
pnpm lint
```

4. **Run the development server**

```bash
pnpm dev
```

5. **Open your browser**

Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
yieldimprove/
├── app/                      # Next.js 15 App Router
│   ├── layout.tsx           # Root layout with sidebar
│   ├── page.tsx             # Home page (redirects to dashboard)
│   ├── dashboard/           # Dashboard page
│   ├── supplying/             # Supplying optimization page
│   ├── borrowing/           # Borrowing optimization page
│   ├── portfolio/           # Portfolio tracker page
│   ├── risk/                # Risk monitor page
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── ui/                  # Shadcn UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── tabs.tsx
│   │   ├── select.tsx
│   │   ├── progress.tsx
│   │   └── alert.tsx
│   ├── dashboard/           # Dashboard-specific components
│   │   ├── metric-card.tsx
│   │   ├── portfolio-chart.tsx
│   │   └── protocol-allocation.tsx
│   └── app-sidebar.tsx      # Application sidebar
├── lib/                     # Utilities and data layer
│   ├── entities/            # Data models and API layer
│   │   ├── position.ts      # Position entity
│   │   ├── protocol.ts      # Protocol entity
│   │   ├── asset.ts         # Asset entity
│   │   └── index.ts
│   └── utils.ts             # Utility functions
├── Entities/                # Original JSON schemas
│   ├── Position.json
│   ├── Protocol.json
│   └── Asset.json
├── next.config.ts           # Next.js configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies
```

## Available Pages

### Dashboard (`/dashboard`)

- Portfolio overview with key metrics
- Total portfolio value, average yield, health factor
- Portfolio performance charts
- Protocol allocation visualization
- Optimization opportunities and risk alerts

### Supplying (`/supplying`)

- Best supplying rates across protocols
- Filter by blockchain, asset, and investment horizon
- Sort by APY, TVL, or risk score
- Current positions summary
- Diversification metrics

### Borrowing (`/borrowing`)

- Lowest borrowing rates
- Collateral and loan asset selection
- LTV and liquidation threshold comparison
- Health factor monitoring
- Current borrowing overview

### Portfolio (`/portfolio`)

- All supplying and borrowing positions
- Net worth calculation
- Position details with health factors
- Blockchain badges and risk indicators
- Quick access to position management

### Risk Monitor (`/risk`)

- Average health factor tracking
- Risk score calculation
- Health factor trend charts
- Collateral distribution
- Active risk alerts and recommendations
- Most at-risk position highlighting

## Development

### Adding New Components

To add new Shadcn UI components:

```bash
pnpm dlx shadcn@latest add [component-name]
```

### Customizing Theme

Edit `app/globals.css` to customize the color scheme and design tokens.

### Data Layer

The application currently uses mock data defined in `lib/entities/`. To connect to a real API:

1. Update the entity files in `lib/entities/`
2. Replace mock data with actual API calls
3. Add environment variables for API endpoints

## Building for Production

```bash
pnpm build
pnpm start
```

## Environment Variables

Create a `.env.local` file for environment-specific variables:

```env
NEXT_PUBLIC_API_URL=your_api_url
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
```

## Features Roadmap

- [ ] Real-time data integration
- [ ] Wallet connection (WalletConnect, MetaMask)
- [ ] Transaction execution
- [ ] Historical data analytics
- [ ] Notification system
- [ ] Multi-wallet support
- [ ] Mobile responsive enhancements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues or questions, please open an issue on the repository.

---

Built with ❤️ using Next.js 15, TypeScript, and Shadcn UI
