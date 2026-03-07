import React from "react"
import type { Metadata, Viewport } from 'next'
import { Outfit, Cormorant_Garamond, Pinyon_Script } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const _outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });
const _cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: '--font-cormorant',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic']
});
const _pinyon = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pinyon",
});

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Orbit',
  description: 'A private space for couples to share love, memories, and moments together',
}

import { RomanticBackground } from '@/components/romantic-background'
import { ScrollManager } from '@/components/scroll-manager'
import { AuthProvider } from '@/contexts/auth-context'
import { StatusBarInit } from '@/components/status-bar-init'
import { DisableContextMenu } from '@/components/disable-context-menu'
import { GlobalBackHandler } from '@/components/global-back-handler'
import { OfflineIndicator } from '@/components/offline-indicator'
import { ViewportProvider } from '@/contexts/viewport-context'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${_outfit.variable} ${_cormorant.variable} ${_pinyon.variable} font-sans antialiased min-h-screen relative overflow-x-hidden bg-black text-white`}>
        <div
          className="fixed top-0 left-0 right-0 bg-black pointer-events-none z-[9999]"
          style={{ height: 'env(safe-area-inset-top, 44px)' }}
        />
        <ViewportProvider>
          <AuthProvider>
            <RomanticBackground />
            <div className="relative z-10">
              {children}
            </div>
            <Toaster />
            <ScrollManager />
            <StatusBarInit />
            <DisableContextMenu />
            <GlobalBackHandler />
            <OfflineIndicator />
          </AuthProvider>
        </ViewportProvider>
      </body>
    </html>
  )
}
