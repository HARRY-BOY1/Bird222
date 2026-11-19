import { io, type Socket } from 'socket.io-client'

export const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://soakalshorja-production.up.railway.app').replace(/\/$/, '')
export type Guest = { id: string; name: string }
export type PublicMessage = { id: number; guest_id: string; guest_name: string; text: string; created_at: string }
export type PublicRoomResponse = { room: string; title: string; messages: PublicMessage[]; online: number }

const GUEST_KEY = 'bird.public.guest'
export function getGuest(): Guest {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(GUEST_KEY)
    if (saved) { try { return JSON.parse(saved) as Guest } catch { window.localStorage.removeItem(GUEST_KEY) } }
  }
  const guest: Guest = { id: `guest-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, name: `زائر-${Math.floor(1000 + Math.random() * 9000)}` }
  if (typeof window !== 'undefined') window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
  return guest
}
export async function loadRoom(): Promise<PublicRoomResponse> {
  const response = await fetch(`${SERVER_URL}/api/public/room`, { cache: 'no-store' })
  if (!response.ok) throw new Error('تعذر تحميل الكروب العام')
  return response.json() as Promise<PublicRoomResponse>
}
export function connectPublicRoom(guest: Guest): Socket { return io(SERVER_URL, { auth: { publicGuest: guest }, reconnection: true, timeout: 10000 }) }
