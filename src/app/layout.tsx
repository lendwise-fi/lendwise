import type { Metadata } from 'next'

import { Inter } from 'next/font/google'

import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'

import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar'
import {
  CurrencyProvider,
  ThemeProvider,
  WalletWatcherProvider,
  Web3Provider,
} from '@/contexts'

import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Yield Optimizer - DeFi Portfolio Optimization',
  description: 'Maximize yields and minimize costs across DeFi protocols',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Web3Provider>
            <CurrencyProvider defaultCurrency="USD">
              <WalletWatcherProvider>
                <div className="flex min-h-screen flex-col">
                  <Navbar />
                  <main className="flex-1">{children}</main>
                  <Footer />
                </div>
                <Toaster position="top-right" richColors />
              </WalletWatcherProvider>
            </CurrencyProvider>
          </Web3Provider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
