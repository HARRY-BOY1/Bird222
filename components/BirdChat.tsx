'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useBirdSession } from '@/components/providers/session.provider'
import { api, avatarUrl, BirdMessage, BirdUser, mapMessage, SERVER_URL, uploadFile } from '@/http/bird-api'
import { Loader2, LogOut, MessageCircle, Paperclip, Search, Send, Settings, UserPlus, X } from 'lucide-react'

type Notice = { text: string; error?: boolean }
function displayName(user?: BirdUser | null) { return user?.display_name || (user?.username ? `@${user.username}` : 'مستخدم') }
function shortDate(value?: string) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) }
function attachmentUrl(id: string, token: string) { return `${SERVER_URL}/files/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}` }

export default function BirdChat() {
  const { user, token, loading, logout, setUser } = useBirdSession()
  const [contacts, setContacts] = useState<BirdUser[]>([])
  const [messages, setMessages] = useState<BirdMessage[]>([])
  const [active, setActive] = useState<BirdUser | null>(null)
  const [online, setOnline] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [searchUsername, setSearchUsername] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [socketState, setSocketState] = useState('جارٍ الاتصال…')
  const [typing, setTyping] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((text: string, error = false) => {
    setNotice({ text, error })
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3500)
  }, [])

  useEffect(() => {
    if (user) { setFirstName(user.first_name || user.display_name || ''); setLastName(user.last_name || ''); setBio(user.bio || '') }
  }, [user])

  const loadContacts = useCallback(async () => {
    if (!token) return
    try {
      const data = await api<{ contacts: BirdUser[] }>('/api/contacts', { token })
      setContacts(data.contacts.map(u => ({ ...u, id: Number(u.id) })))
    } catch (error) { notify(error instanceof Error ? error.message : 'تعذر تحميل جهات الاتصال.', true) }
  }, [token, notify])

  useEffect(() => { if (user && token) void loadContacts() }, [user, token, loadContacts])

  useEffect(() => {
    if (!user || !token) return
    const socket = io(SERVER_URL, { auth: { token }, reconnection: true, timeout: 10000 })
    socketRef.current = socket
    socket.on('connect', () => setSocketState('متصل'))
    socket.on('disconnect', () => setSocketState('يعيد الاتصال…'))
    socket.on('connect_error', () => setSocketState('تعذر الاتصال'))
    socket.on('presence', (event: { userId: number; status: string }) => setOnline(prev => {
      const next = new Set(prev); if (event.status === 'online') next.add(Number(event.userId)); else next.delete(Number(event.userId)); return next
    }))
    socket.on('message:new', (message: BirdMessage) => {
      const normalized = mapMessage(message, user.id)
      if (Number(normalized.sender_id) === Number(active?.id) || Number(normalized.receiver_id) === Number(active?.id)) {
        setMessages(prev => prev.some(m => m.id === normalized.id) ? prev : [...prev, normalized])
        if (Number(normalized.receiver_id) === Number(user.id)) socket.emit('message:read', { messageId: normalized.id })
      }
      void loadContacts()
    })
    socket.on('message:status', ({ messageId, status }: { messageId: number; status: BirdMessage['status'] }) => setMessages(prev => prev.map(m => m.id === Number(messageId) ? { ...m, status } : m)))
    socket.on('message:edited', ({ messageId, text: nextText, editedAt }: { messageId: number; text: string; editedAt: string }) => setMessages(prev => prev.map(m => m.id === Number(messageId) ? { ...m, text: nextText, edited_at: editedAt } : m)))
    socket.on('message:deleted', ({ messageId }: { messageId: number }) => setMessages(prev => prev.filter(m => m.id !== Number(messageId)))
    socket.on('message:reaction', ({ messageId, reaction }: { messageId: number; reaction: string | null }) => setMessages(prev => prev.map(m => m.id === Number(messageId) ? { ...m, sticker: reaction || null } : m)))
    socket.on('typing:start', ({ from }: { from: number }) => { if (Number(from) === active?.id) setTyping(true) })
    socket.on('typing:stop', ({ from }: { from: number }) => { if (Number(from) === active?.id) setTyping(false) })
    return () => { socket.removeAllListeners(); socket.disconnect(); socketRef.current = null }
  }, [user, token, active?.id, loadContacts])

  useEffect(() => {
    if (!active || !token) { setMessages([]); return }
    let cancelled = false
    setMessages([])
    api<{ messages: BirdMessage[] }>(`/api/messages/${active.id}`, { token })
      .then(data => { if (!cancelled) setMessages(data.messages.map(m => mapMessage(m, user?.id || 0))) })
      .catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : 'تعذر تحميل الرسائل.', true) })
    return () => { cancelled = true }
  }, [active, token, user?.id, notify])

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])
  const filtered = useMemo(() => contacts.filter(c => `${displayName(c)} ${c.username}`.toLowerCase().includes(query.toLowerCase())), [contacts, query])

  async function sendMessage(event?: FormEvent, attachment?: { id: string; kind: BirdMessage['kind'] }) {
    event?.preventDefault()
    if (!active || !socketRef.current?.connected || (!text.trim() && !attachment)) return
    const value = text.trim(); setText(''); setBusy(true)
    socketRef.current.timeout(20000).emit('message:send', { to: active.id, text: value, ...(attachment ? { attachmentId: attachment.id, kind: attachment.kind } : {}) }, (err: Error | null, response: { message?: BirdMessage; error?: string }) => {
      setBusy(false)
      if (err || response?.error || !response?.message) { setText(value); notify(response?.error || 'فشل إرسال الرسالة.', true); return }
      const normalized = mapMessage(response.message, user?.id || 0)
      setMessages(prev => prev.some(m => m.id === normalized.id) ? prev : [...prev, normalized])
      void loadContacts()
    })
  }

  async function onFile(file?: File, isAvatar = false) {
    if (!file || !token) return
    setBusy(true)
    try {
      if (isAvatar) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('اختر صورة JPG أو PNG أو WEBP أو GIF.')
        if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.')
        const result = await uploadFile(file, token, true)
        if (result.user) { setUser(result.user); notify('تم تحديث الصورة الشخصية.') }
      } else {
        if (file.size > 50 * 1024 * 1024) throw new Error('حجم الملف أكبر من الحد المسموح (50 ميجابايت).')
        const result = await uploadFile(file, token)
        const item = result.file
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file'
        await new Promise<void>((resolve, reject) => socketRef.current?.timeout(20000).emit('message:send', { to: active?.id, text: '', kind, attachmentId: item.id }, (err: Error | null, response: { message?: BirdMessage; error?: string }) => {
          if (err || response?.error || !response?.message) return reject(new Error(response?.error || 'فشل إرسال الملف.'))
          setMessages(prev => [...prev, mapMessage(response.message!, user?.id || 0)]); resolve()
        }) || reject(new Error('الاتصال بالخادم غير متاح.')))
        notify('تم إرسال الملف.')
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'فشل الرفع.', true) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; if (avatarRef.current) avatarRef.current.value = '' }
  }

  async function addContact(event: FormEvent) {
    event.preventDefault(); if (!token) return
    const name = searchUsername.trim().replace(/^@/, '')
    if (!name) return
    setBusy(true)
    try {
      const found = await api<{ users: BirdUser[] }>(`/api/users/search?q=${encodeURIComponent(name)}`, { token })
      const match = found.users.find(u => u.username.toLowerCase() === name.toLowerCase())
      if (!match) throw new Error('ما لكيت هذا المستخدم.')
      if (contacts.some(c => c.id === match.id)) throw new Error('هذا المستخدم موجود ضمن جهات اتصالك.')
      await api('/api/contacts', { method: 'POST', token, body: { contactId: match.id } })
      setContacts(prev => [...prev, match]); setSearchUsername(''); setShowAdd(false); notify('انضافت جهة الاتصال.')
    } catch (error) { notify(error instanceof Error ? error.message : 'تعذر إضافة جهة الاتصال.', true) }
    finally { setBusy(false) }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!token) return
    setBusy(true)
    try {
      const result = await api<{ user: BirdUser }>('/api/me', { method: 'PATCH', token, body: { first_name: firstName.trim(), last_name: lastName.trim() || null, bio: bio.trim() || null } })
      setUser(result.user); setShowSettings(false); notify('تم حفظ بيانات الحساب.')
    } catch (error) { notify(error instanceof Error ? error.message : 'تعذر حفظ بيانات الحساب.', true) }
    finally { setBusy(false) }
  }

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() }
    if (active && socketRef.current?.connected) socketRef.current.emit(event.currentTarget.value ? 'typing:start' : 'typing:stop', { to: active.id })
  }

  async function deleteMessage(message: BirdMessage) {
    if (!token || message.sender_id !== user?.id) return
    try { await api(`/api/messages/${message.id}/delete`, { method: 'POST', token, body: { mode: 'me' } }); socketRef.current?.emit('message:delete', { messageId: message.id, mode: 'me' }); setMessages(prev => prev.filter(m => m.id !== message.id)) }
    catch (error) { notify(error instanceof Error ? error.message : 'تعذر حذف الرسالة.', true) }
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#0e1621] text-sky-400"><Loader2 className="animate-spin" /></div>
  if (!user || !token) return <div className="grid min-h-screen place-items-center bg-[#0e1621] text-center text-slate-300"><div><MessageCircle className="mx-auto mb-3 text-sky-500" size={44} /><h1 className="mb-2 text-xl font-semibold">Bird Messenger</h1><p className="mb-5 text-sm text-slate-400">سجّل الدخول حتى تبدأ المحادثة.</p><a href="./auth/" className="rounded-lg bg-sky-600 px-5 py-2.5 text-white">تسجيل الدخول</a></div></div>

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#0e1621] text-[#f5f7fa]">
      <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/10 bg-[#17212b] md:w-[350px]`}>
        <header className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-600"><MessageCircle size={22} /></div>
          <div className="min-w-0 flex-1"><div className="font-semibold">Bird Messenger</div><div className="text-xs text-slate-400">{socketState}</div></div>
          <button title="إضافة جهة اتصال" onClick={() => setShowAdd(true)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><UserPlus size={19} /></button>
          <button title="إعدادات الحساب" onClick={() => setShowSettings(true)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Settings size={19} /></button>
          <button title="تسجيل الخروج" onClick={() => { logout(); window.location.assign('./auth/') }} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><LogOut size={18} /></button>
        </header>
        <div className="p-3"><label className="flex items-center gap-2 rounded-xl bg-[#0e1621] px-3 py-2 text-slate-400"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث في المحادثات" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></label></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map(contact => <button key={contact.id} onClick={() => setActive(contact)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 ${active?.id === contact.id ? 'bg-sky-500/10' : ''}`}>
            <Avatar user={contact} token={token} online={online.has(contact.id)} />
            <span className="min-w-0 flex-1 border-b border-white/5 pb-3"><span className="block truncate font-medium">{displayName(contact)}</span><span className="mt-1 block truncate text-xs text-slate-400">@{contact.username}</span></span>
          </button>)}
          {filtered.length === 0 && <div className="px-6 py-14 text-center text-sm text-slate-500">{query ? 'ماكو نتائج.' : 'قائمة المحادثات فارغة. أضف جهة اتصال للبدء.'}</div>}
        </div>
      </aside>

      <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#0e1621]`}>
        {active ? <>
          <header className="flex h-[68px] items-center gap-3 border-b border-white/10 bg-[#17212b] px-4">
            <button className="mr-1 rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden" onClick={() => setActive(null)} aria-label="رجوع"><X size={19} /></button>
            <Avatar user={active} token={token} online={online.has(active.id)} />
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{displayName(active)}</div><div className="text-xs text-slate-400">{typing ? 'يكتب الآن…' : online.has(active.id) ? 'متصل الآن' : `@${active.username}`}</div></div>
          </header>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(ellipse_at_center,_#17212b_0%,_#0e1621_75%)] px-3 py-5 md:px-8">
            {messages.map(message => <div key={message.id} className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow md:max-w-[70%] ${message.sender_id === user.id ? 'rounded-br-sm bg-[#2b5278]' : 'rounded-bl-sm bg-[#182533]'}`}>
                {message.kind === 'image' && message.attachment_id && <a href={attachmentUrl(message.attachment_id, token)} target="_blank" rel="noreferrer"><img src={attachmentUrl(message.attachment_id, token)} alt={message.attachment_name || 'صورة'} className="mb-2 max-h-[360px] max-w-full rounded-lg object-contain" /></a>}
                {['file','video','audio'].includes(message.kind) && message.attachment_id && <a className="mb-1 block underline" href={attachmentUrl(message.attachment_id, token)} target="_blank" rel="noreferrer">{message.attachment_name || `فتح ${message.kind}`}</a>}
                {message.text && <p className="whitespace-pre-wrap break-words text-[15px]">{message.text}</p>}
                <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-slate-300/70"><span>{message.edited_at ? 'معدّلة · ' : ''}{shortDate(message.created_at)}</span>{message.sender_id === user.id && <span>{message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : '✓'}</span>}{message.sender_id === user.id && <button onClick={() => void deleteMessage(message)} title="حذف الرسالة" className="hover:text-white">×</button>}</div>
              </div>
            </div>)}
            {messages.length === 0 && <div className="mx-auto mt-20 w-fit rounded-full bg-[#17212b]/80 px-5 py-2 text-center text-sm text-slate-400">ابدأ المحادثة بإرسال رسالة</div>}
          </div>
          <form onSubmit={e => void sendMessage(e)} className="flex items-center gap-2 border-t border-white/10 bg-[#17212b] p-3 md:px-6">
            <input ref={fileRef} type="file" className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
            <button type="button" title="إرفاق ملف" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl p-2.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"><Paperclip size={20} /></button>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onInputKey} placeholder="اكتب رسالة…" className="h-11 min-w-0 flex-1 rounded-xl bg-[#0e1621] px-4 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-sky-500" />
            <button disabled={busy || (!text.trim() && !active)} className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
          </form>
        </> : <div className="hidden flex-1 flex-col items-center justify-center text-slate-400 md:flex"><div className="mb-4 grid size-24 place-items-center rounded-full bg-[#17212b]"><MessageCircle size={44} className="text-sky-500" /></div><p>اختَر محادثة حتى تبدي</p></div>}
      </section>

      {notice && <div role="status" className={`fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-xl ${notice.error ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{notice.text}</div>}
      {showAdd && <Modal title="إضافة جهة اتصال" onClose={() => setShowAdd(false)}><form onSubmit={e => void addContact(e)} className="space-y-4"><label className="block text-sm">اسم المستخدم<input autoFocus value={searchUsername} onChange={e => setSearchUsername(e.target.value)} placeholder="username" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#0e1621] px-3 outline-none focus:border-sky-500" dir="ltr" /></label><button disabled={busy} className="w-full rounded-lg bg-sky-600 py-2.5 font-medium disabled:opacity-60">بحث وإضافة</button></form></Modal>}
      {showSettings && <Modal title="إعدادات الحساب" onClose={() => setShowSettings(false)}><form onSubmit={e => void saveProfile(e)} className="space-y-3"><div className="flex items-center gap-4"><Avatar user={user} token={token} /><div><div className="font-medium">{displayName(user)}</div><div className="text-sm text-slate-400">@{user.username}</div></div></div><input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => void onFile(e.target.files?.[0], true)} /><button type="button" disabled={busy} onClick={() => avatarRef.current?.click()} className="w-full rounded-lg border border-white/10 py-2 text-sm hover:bg-white/5">تغيير الصورة</button><label className="block text-sm">الاسم الأول<input value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={64} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0e1621] px-3 outline-none" /></label><label className="block text-sm">اسم العائلة<input value={lastName} onChange={e => setLastName(e.target.value)} maxLength={64} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0e1621] px-3 outline-none" /></label><label className="block text-sm">نبذة<textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 140))} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0e1621] p-3 outline-none" /></label><div className="flex justify-between text-xs text-slate-500"><span>النبذة الشخصية</span><span>{bio.length}/140</span></div><button disabled={busy} className="w-full rounded-lg bg-sky-600 py-2.5 font-medium disabled:opacity-60">حفظ</button></form></Modal>}
    </div>
  )
}

function Avatar({ user, token, online }: { user: BirdUser | null; token: string | null; online?: boolean }) {
  const src = user && token ? avatarUrl(user, token) : ''
  return <div className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-sky-700 font-semibold text-white">{src ? <img src={src} alt="" className="absolute inset-0 size-full object-cover" /> : (user?.display_name || user?.username || '?').slice(0, 1).toUpperCase()}{online && <i className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#17212b] bg-emerald-400" />}</div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17212b] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="إغلاق"><X size={19} /></button></div>{children}</div></div>
}
