"use client";
import { AppShell } from "@/components/app-shell";
import { BirdAuth } from "@/components/auth/bird-auth";
import { useBirdSession } from "@/context/session-context";
export default function Home() { const { user, loading } = useBirdSession(); if (loading) return <div className="grid min-h-screen place-items-center bg-[#0b141a] text-[#00a884]">جارٍ الاتصال بالخادم…</div>; return user ? <AppShell /> : <BirdAuth />; }
