import { useEffect, useState } from 'react'
import AuthForm from './components/AuthForm'
import Dashboard from './components/Dashboard'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    }

    void loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession((currentSession) => {
          const currentUserId = currentSession?.user?.id ?? null
          const nextUserId = nextSession?.user?.id ?? null

          return currentUserId === nextUserId
            ? currentSession
            : nextSession
        })

        if (!nextSession) {
          setProfile(null)
          setLoading(false)
        }
      },
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!userId) return

      setLoading(true)

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single()

      if (active) {
        if (!error) setProfile(data)
        setLoading(false)
      }
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [userId])

  if (loading) {
    return <div className="loading-screen">Loading CCNA Assessment…</div>
  }
  if (!session) return <AuthForm />
  return <Dashboard profile={profile} user={session.user} />
}
