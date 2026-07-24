import { useEffect, useState } from 'react'
import AuthForm from './components/AuthForm'
import Dashboard from './components/Dashboard'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    }

    loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) return
      setLoading(true)
      const { data, error } = await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).single()
      if (!error) setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [session])

  if (loading) return <div className="loading-screen">Loading CCNA Assessment…</div>
  if (!session) return <AuthForm />
  return <Dashboard profile={profile} user={session.user} />
}
