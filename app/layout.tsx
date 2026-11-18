import type { Metadata } from 'next'
import SessionProvider from '@/components/providers/session.provider'
import './globals.css'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export const metadata: Metadata = {
  title: 'Bird — Messenger',
  description: 'Bird messaging app powered by the Bird API.',
  icons: { icon: `${BASE_PATH}/logo.svg` },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased sidebar-custom-scrollbar" suppressHydrationWarning>
        <SessionProvider>
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
}
