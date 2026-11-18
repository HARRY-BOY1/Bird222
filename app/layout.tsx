import type { Metadata } from 'next'
import SessionProvider from '@/components/providers/session.provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bird — Messenger',
  description: 'Bird messaging app powered by the Bird API.',
  icons: { icon: '/logo.svg' },
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
