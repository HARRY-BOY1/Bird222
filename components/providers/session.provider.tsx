'use client'

import { api, BirdUser } from '@/http/bird-api'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type SessionValue = {
  user: BirdUser | null
  token: string | null
  loading: boolean
  setSession: (user: BirdUser, token: string) => void
  setUser: (user: BirdUser) => void
  logout: () => void
}
const SessionContext = createContext<SessionValue | null>(null)
const TOKEN_KEY = 'bird.jwt'
const USER_KEY = 'bird.user'

export function useBirdSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useBirdSession must be used inside SessionProvider')
  return value
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<BirdUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)
    if (!storedToken) { setLoading(false); return }
    setToken(storedToken)
    if (storedUser) {
      try {
        setUserState(JSON.parse(storedUser) as BirdUser)
        setLoading(false)
      } catch {
        localStorage.removeItem(USER_KEY)
      }
    }
    api<{ user: BirdUser }>('/api/me', { token: storedToken })
      .then((data) => {
        if (!data.user) throw new Error('Invalid session response')
        setUserState(data.user)
        localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      })
      .catch(() => {
        // Keep the locally stored session during transient API or network failures.
        // Requests made by the chat surface will show the actionable server error.
      })
      .finally(() => setLoading(false))
  }, [])

  const setSession = (nextUser: BirdUser, nextToken: string) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setToken(nextToken); setUserState(nextUser)
  }
  const setUser = (nextUser: BirdUser) => {
    setUserState(nextUser); localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
  }
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY)
    setToken(null); setUserState(null)
  }
  const value = useMemo(() => ({ user, token, loading, setSession, setUser, logout }), [user, token, loading])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
