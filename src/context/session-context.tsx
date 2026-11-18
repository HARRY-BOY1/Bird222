"use client"
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { birdApi, type BirdUser } from '@/lib/bird-api'

type SessionValue = {
  user: BirdUser | null
  token: string | null
  loading: boolean
  setSession: (user: BirdUser, token: string) => void
  logout: () => void
}
const SessionContext = createContext<SessionValue | null>(null)
const TOKEN_KEY = 'bird.jwt'
const USER_KEY = 'bird.user'

export function useBirdSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useBirdSession must be used inside BirdSessionProvider')
  return value
}

export function BirdSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BirdUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    if (!storedToken) { setLoading(false); return }
    setToken(storedToken)
    if (storedUser) try { setUser(JSON.parse(storedUser) as BirdUser) } catch { localStorage.removeItem(USER_KEY) }
    birdApi<{ user: BirdUser }>('/api/me', { token: storedToken })
      .then(({ user: freshUser }) => { setUser(freshUser); localStorage.setItem(USER_KEY, JSON.stringify(freshUser)) })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setToken(null); setUser(null) })
      .finally(() => setLoading(false))
  }, [])
  const setSession = (nextUser: BirdUser, nextToken: string) => {
    localStorage.setItem(TOKEN_KEY, nextToken); localStorage.setItem(USER_KEY, JSON.stringify(nextUser)); setToken(nextToken); setUser(nextUser)
  }
  const logout = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setToken(null); setUser(null) }
  const value = useMemo(() => ({ user, token, loading, setSession, logout }), [user, token, loading])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
