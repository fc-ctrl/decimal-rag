import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  email: string
  nom: string | null
  role: string
  allowed_modules: string[]
}

interface AuthContextType {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string, retries = 3): Promise<void> => {
    for (let i = 0; i < retries; i++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nom, role, allowed_modules')
        .eq('id', userId)
        .single()
      if (!error && data) {
        setProfile({
          ...data,
          allowed_modules: data.allowed_modules || [],
        })
        return
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500))
    }
    setProfile(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const isAdmin = profile?.role === 'admin'

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      setSession(data.session)
      await fetchProfile(data.user.id)
    }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
