export const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://soakalshorja-production.up.railway.app').replace(/\/$/, '')

export type BirdUser = {
  id: number
  username: string
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  last_seen?: string | null
}

export type BirdMessage = {
  id: number
  sender_id: number
  receiver_id: number
  text: string
  status: 'sent' | 'delivered' | 'read'
  created_at: string
  edited_at?: string | null
  kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker'
  attachment_id?: string | null
  attachment_name?: string | null
  attachment_size?: number | null
  attachment_mime?: string | null
  sticker?: string | null
  sender?: BirdUser
}

type RequestOptions = { method?: string; token?: string | null; body?: unknown }
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  let response: Response
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      method: options.method || 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    })
  } catch {
    throw new Error('الخادم غير متصل حاليًا. تحقق من اتصال الإنترنت وحاول مرة ثانية.')
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(String(data.error || `تعذر تنفيذ الطلب (${response.status})`)) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data as T
}

export function avatarUrl(user: Pick<BirdUser, 'id' | 'avatar_url'>, token: string) {
  return user.avatar_url ? `${SERVER_URL}/api/users/${user.id}/avatar?token=${encodeURIComponent(token)}&v=${encodeURIComponent(user.avatar_url)}` : ''
}

export async function uploadFile(file: File, token: string, avatar = false) {
  const body = new FormData()
  body.append(avatar ? 'avatar' : 'file', file)
  let response: Response
  try {
    response = await fetch(`${SERVER_URL}/api/${avatar ? 'me/avatar' : 'upload'}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
    })
  } catch {
    throw new Error('تعذر الاتصال بالخادم لرفع الملف.')
  }
  const data = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(data.error || `فشل رفع الملف (${response.status})`)
  return data
}

export function mapMessage(message: BirdMessage, me: number): BirdMessage {
  return {
    ...message,
    sender_id: Number(message.sender_id), receiver_id: Number(message.receiver_id),
    id: Number(message.id),
    text: message.text || '',
    kind: message.kind || 'text',
    status: message.status || 'sent',
    sender: message.sender,
  }
}
