import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppSidebar } from '@/components/app-sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { Web3Provider } from '@/components/providers'
import { Navbar } from '@/components/navbar'
import { MainContent } from '@/components/main-content'
import { Toaster } from 'sonner'
import { WalletWatcherProvider } from '@/components/wallet-watcher-provider'

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
            <WalletWatcherProvider>
              <div className="flex min-h-screen bg-background">
                <AppSidebar />
                <main className="flex-1 flex flex-col">
                  <Navbar />
                  <MainContent>{children}</MainContent>
                </main>
              </div>
              <Toaster position="top-right" richColors />
            </WalletWatcherProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
