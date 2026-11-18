"use client"
import { FormEvent, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { birdApi, type BirdUser } from '@/lib/bird-api'
import { useBirdSession } from '@/context/session-context'

export function BirdAuth() {
  const { setSession } = useBirdSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(username.trim())) return setError('اسم المستخدم يجب أن يكون من 5 إلى 32 حرفاً إنجليزياً أو رقماً أو _.')
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) return setError('كلمة المرور يجب أن تكون من 8 أحرف على الأقل وبحد أقصى 72 بايت.')
    setBusy(true)
    try {
      const data = await birdApi<{ user: BirdUser; token: string }>(`/api/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { username: username.trim(), password } })
      setSession(data.user, data.token)
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.') }
    finally { setBusy(false) }
  }
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#0b141a] px-4 text-white">
    <section className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#202c33] p-7 shadow-2xl">
      <div className="mb-6 flex flex-col items-center text-center"><div className="mb-3 grid size-16 place-items-center rounded-full bg-[#00a884]"><MessageCircle size={30} /></div><h1 className="text-2xl font-bold">Bird Messenger</h1><p className="mt-2 text-sm text-slate-400">واجهة WhatsApp متصلة بخادم Bird الحالي</p></div>
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#111b21] p-1"><button type="button" onClick={() => { setMode('login'); setError('') }} className={`rounded-lg py-2 text-sm ${mode === 'login' ? 'bg-[#00a884] text-white' : 'text-slate-400'}`}>دخول</button><button type="button" onClick={() => { setMode('register'); setError('') }} className={`rounded-lg py-2 text-sm ${mode === 'register' ? 'bg-[#00a884] text-white' : 'text-slate-400'}`}>حساب جديد</button></div>
      <form onSubmit={submit} className="space-y-4"><label className="block text-sm">اسم المستخدم<input required autoComplete="username" minLength={5} maxLength={32} value={username} onChange={e => setUsername(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#111b21] px-3 outline-none focus:border-[#00a884]" dir="ltr" placeholder="username" /></label><label className="block text-sm">كلمة المرور<input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#111b21] px-3 outline-none focus:border-[#00a884]" placeholder="••••••••" /></label>{error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}<button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#00a884] font-semibold hover:bg-[#06cf9c] disabled:opacity-60">{busy && <Loader2 size={17} className="animate-spin" />}{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</button></form>
    </section>
  </main>
}
