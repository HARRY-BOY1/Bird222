import type { Metadata } from "next";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { BirdSessionProvider } from "@/context/session-context";
import { ChatProvider } from "@/context/chat-context";
import "./globals.css";
export const metadata: Metadata = { title: "Bird Messenger", description: "Bird Messenger web client", icons: { icon: "/whatsapp-logo.svg" }, manifest: "/Bird222/manifest.json" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl" suppressHydrationWarning><body className="m-0 overflow-hidden antialiased"><ThemeProvider><BirdSessionProvider><ChatProvider>{children}</ChatProvider></BirdSessionProvider></ThemeProvider></body></html>; }
