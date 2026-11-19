import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Bird · الكروب العام', description: 'كروب Bird العام المفتوح للجميع', manifest: '/Bird222/manifest.json' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><body>{children}</body></html> }
