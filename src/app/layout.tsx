import type { Metadata } from 'next'

import { Inter, JetBrains_Mono } from 'next/font/google'

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

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
  display: 'swap',
})

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
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Web3Provider>
            <CurrencyProvider defaultCurrency="USD">
              <WalletWatcherProvider>
                <div className="flex h-screen flex-col overflow-hidden">
                  <Navbar />
                  <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
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
