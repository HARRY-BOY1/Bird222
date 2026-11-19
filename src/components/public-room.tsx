"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { connectPublicRoom, getGuest, loadRoom, type Guest, type PublicMessage } from '@/lib/public-room-api'

function formatTime(value: string) { return new Intl.DateTimeFormat('ar-IQ', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function initials(name: string) { return name.slice(0, 1) }

export function PublicRoom() {
  const [guest, setGuest] = useState<Guest | null>(null)
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [online, setOnline] = useState(0)
  const [text, setText] = useState('')
  const [connected, setConnected] = useState(false)
  const [typing, setTyping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guestId = guest?.id

  useEffect(() => {
    const currentGuest = getGuest(); setGuest(currentGuest)
    let cancelled = false
    loadRoom().then(room => { if (!cancelled) { setMessages(room.messages); setOnline(room.online) } }).catch(() => { if (!cancelled) setError('تعذر الوصول للخادم حالياً') }).finally(() => { if (!cancelled) setLoading(false) })
    const socket = connectPublicRoom(currentGuest); socketRef.current = socket
    socket.on('connect', () => { setConnected(true); setError('') }); socket.on('disconnect', () => setConnected(false)); socket.on('connect_error', () => { setConnected(false); setError('الاتصال بالكروب غير متاح حالياً') })
    socket.on('public:history', (payload: { messages: PublicMessage[] }) => setMessages(prev => prev.length ? prev : payload.messages))
    socket.on('public:presence', (payload: { online: number }) => setOnline(payload.online))
    socket.on('public:message', (message: PublicMessage) => setMessages(prev => prev.some(item => item.id === message.id) ? prev : [...prev, message]))
    socket.on('public:typing', (payload: { guestId: string; typing: boolean }) => { if (payload.guestId !== currentGuest.id) setTyping(payload.typing) })
    return () => { cancelled = true; socket.removeAllListeners(); socket.disconnect(); if (typingTimer.current) clearTimeout(typingTimer.current) }
  }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])
  const send = useCallback(() => {
    const value = text.trim(); const socket = socketRef.current
    if (!value || !socket || !socket.connected) return
    socket.timeout(10000).emit('public:message', { text: value }, (timeout: Error | null, result: { error?: string }) => { if (timeout || result?.error) setError(result?.error || 'تعذر إرسال الرسالة') })
    setText(''); socket.emit('public:typing', { typing: false }); setTyping(false)
  }, [text])
  function onTextChange(value: string) { setText(value.slice(0, 2000)); const socket = socketRef.current; if (!socket?.connected) return; socket.emit('public:typing', { typing: Boolean(value.trim()) }); if (typingTimer.current) clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => { socket.emit('public:typing', { typing: false }); setTyping(false) }, 1800) }
  const sortedMessages = useMemo(() => messages, [messages])
  return <main className="room-page" dir="rtl">
    <div className="room-shell">
      <header className="room-header">
        <div className="brand-mark">B</div><div className="room-heading"><h1>الكروب العام</h1><p><span className={`status-dot ${connected ? 'on' : ''}`} /> {connected ? `${online} موجود الآن` : 'جاري الاتصال…'}</p></div><div className="public-pill">مفتوح للجميع</div>
      </header>
      <section className="room-notice"><span>✦</span><div><strong>أهلاً بك بالكروب العام</strong><p>كل شخص يدخل ينضم تلقائياً. احترم الآخرين وخلي الكلام لطيف.</p></div></section>
      <section className="message-area" aria-live="polite">
        {loading && <div className="loading-state">جاري تحميل الرسائل…</div>}
        {!loading && !sortedMessages.length && <div className="empty-state"><div className="empty-icon">✦</div><h2>ابدأ أول سالفة</h2><p>أنت أول شخص هنا حالياً. اكتب رسالة وخلّي الكروب يبدأ.</p></div>}
        {sortedMessages.map(message => { const own = message.guest_id === guestId; return <article className={`message-row ${own ? 'own' : ''}`} key={message.id}><div className="avatar">{initials(message.guest_name)}</div><div className="bubble"><div className="message-meta"><strong>{own ? 'أنت' : message.guest_name}</strong><time>{formatTime(message.created_at)}</time></div><p>{message.text}</p></div></article> })}
        {typing && <div className="typing-line"><span /> <span /> <span /> شخص يكتب الآن</div>}<div ref={bottomRef} />
      </section>
      <footer className="composer"><input value={text} maxLength={2000} onChange={event => onTextChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="اكتب رسالتك للكروب…" aria-label="رسالة جديدة"/><button type="button" onClick={send} disabled={!text.trim() || !connected} aria-label="إرسال">إرسال <span>↗</span></button></footer>
      {guest && <div className="guest-note">أنت داخل باسم <strong>{guest.name}</strong> · لا يحتاج دخول أو حساب</div>}
      {error && <div className="error-bar">{error}</div>}
    </div>
  </main>
}
