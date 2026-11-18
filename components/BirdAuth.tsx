'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api, BirdUser } from '@/http/bird-api'
import { useBirdSession } from '@/components/providers/session.provider'
import { Loader2, MessageCircle } from 'lucide-react'

const ROOT_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`

export default function BirdAuth() {
  const { setSession, user, loading } = useBirdSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!loading && user) window.location.replace(ROOT_PATH) }, [loading, user])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(username.trim())) { setError('اسم المستخدم لازم يكون 5–32 حرفًا إنجليزيًا أو رقمًا أو _.'); return }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError('كلمة المرور لازم تكون 8 أحرف على الأقل وبحد أقصى 72 بايت.'); return }
    setBusy(true)
    try {
      const data = await api<{ user: BirdUser; token: string }>(`/api/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { username: username.trim(), password } })
      setSession(data.user, data.token)
      window.location.replace(ROOT_PATH)
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="min-h-screen grid place-items-center bg-[#0e1621] text-sky-400"><Loader2 className="animate-spin" /></div>
  return (
    <div className="min-h-screen grid place-items-center bg-[#0e1621] px-4 text-white">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#17212b] p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid size-16 place-items-center rounded-full bg-sky-500"><MessageCircle size={30} /></div>
          <h1 className="text-2xl font-bold">Bird Messenger</h1>
          <p className="mt-2 text-sm text-slate-400">مراسلات فورية مرتبطة بحساب Bird</p>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#0e1621] p-1">
          <button type="button" onClick={() => { setMode('login'); setError('') }} className={`rounded-lg py-2 text-sm ${mode === 'login' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}>دخول</button>
          <button type="button" onClick={() => { setMode('register'); setError('') }} className={`rounded-lg py-2 text-sm ${mode === 'register' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}>حساب جديد</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">اسم المستخدم<input required autoComplete="username" minLength={5} maxLength={32} value={username} onChange={e => setUsername(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#0e1621] px-3 outline-none focus:border-sky-500" placeholder="username" dir="ltr" /></label>
          <label className="block text-sm">كلمة المرور<input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#0e1621] px-3 outline-none focus:border-sky-500" placeholder="••••••••" /></label>
          {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 font-semibold hover:bg-sky-500 disabled:opacity-60">{busy && <Loader2 size={17} className="animate-spin" />}{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">الخدمة متصلة بخادم Bird الحالي.</p>
      </div>
    </div>
  )
}
