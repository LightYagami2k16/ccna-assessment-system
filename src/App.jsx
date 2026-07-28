import { lazy, Suspense, useEffect, useState } from 'react'
import AuthForm from './components/AuthForm'
import InvitationPasswordSetup from './components/InvitationPasswordSetup'
import WorkspaceLoading from './components/WorkspaceLoading'
import { supabase } from './lib/supabase'

const Dashboard = lazy(() => import('./components/Dashboard'))

const uatRole = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('uat-role')
  : null
const activeUatRole = ['administrator', 'instructor', 'student'].includes(uatRole)
  ? uatRole
  : null

function getAuthenticationLinkError() {
  const hashParameters = new URLSearchParams(
    window.location.hash.replace(/^#/, ''),
  )

  return (
    hashParameters.get('error_description') ||
    hashParameters.get('error') ||
    ''
  ).replace(/\+/g, ' ')
}

function userNeedsInvitationPassword(user) {
  const metadata = user?.user_metadata ?? {}
  const invitationAccount =
    metadata.invitation_pending === true ||
    Boolean(user?.invited_at)

  return (
    invitationAccount &&
    metadata.password_initialized !== true
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [profileLoadVersion, setProfileLoadVersion] = useState(0)
  const [loading, setLoading] = useState(!activeUatRole)
  const [authenticationLinkError] = useState(
    getAuthenticationLinkError,
  )
  const userId = session?.user?.id ?? null
  const requiresInvitationPassword = userNeedsInvitationPassword(
    session?.user,
  )

  useEffect(() => {
    if (activeUatRole) return undefined

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
        setSession(nextSession)

        if (!nextSession) {
          setProfile(null)
          setProfileError('')
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
    if (activeUatRole) return undefined

    let active = true

    async function loadProfile() {
      if (!userId) return

      setLoading(true)
      setProfile(null)
      setProfileError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single()

      if (active) {
        if (error) {
          setProfileError(
            'We could not load your account profile. Check your connection and try again.',
          )
        } else {
          setProfile(data)
        }
        setLoading(false)
      }
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [profileLoadVersion, userId])

  async function handleRecoverySignOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setProfileError(`Unable to sign out: ${error.message}`)
    }
  }

  function handleInvitationPasswordComplete(updatedUser) {
    setSession((currentSession) =>
      currentSession
        ? { ...currentSession, user: updatedUser }
        : currentSession,
    )
  }

  function handleProfileUpdated(changes) {
    setProfile((currentProfile) =>
      currentProfile
        ? { ...currentProfile, ...changes }
        : currentProfile,
    )
  }

  if (activeUatRole) {
    const previewUser = {
      id: `uat-${activeUatRole}`,
      email: `uat.${activeUatRole}@example.test`,
    }
    const previewProfile = {
      id: previewUser.id,
      full_name:
        activeUatRole === 'administrator'
          ? 'UAT Administrator'
          : activeUatRole === 'instructor'
            ? 'UAT Instructor'
            : 'UAT Student',
      role: activeUatRole,
    }

    return (
      <div className="uat-preview-shell">
        <div className="uat-preview-banner" role="status">
          Development UI preview · {activeUatRole} workspace
        </div>

        <Suspense
          fallback={<WorkspaceLoading label="Loading UAT workspace..." />}
        >
          <Dashboard
            profile={previewProfile}
            user={previewUser}
            previewMode
          />
        </Suspense>
      </div>
    )
  }

  if (loading) {
    return <div className="loading-screen">Loading CCNA Assessment…</div>
  }
  if (!session) {
    return <AuthForm initialMessage={authenticationLinkError} />
  }
  if (requiresInvitationPassword) {
    return (
      <InvitationPasswordSetup
        user={session.user}
        onComplete={handleInvitationPasswordComplete}
      />
    )
  }
  if (profileError || !profile) {
    return (
      <main className="session-recovery-screen">
        <section className="session-recovery-card" role="alert">
          <span className="eyebrow">ACCOUNT CONNECTION</span>
          <h1>We could not open your workspace</h1>
          <p>
            {profileError ||
              'Your account profile is temporarily unavailable.'}
          </p>

          <div className="session-recovery-actions">
            <button
              className="primary"
              type="button"
              onClick={() =>
                setProfileLoadVersion((current) => current + 1)
              }
            >
              Try again
            </button>

            <button
              className="secondary"
              type="button"
              onClick={() => void handleRecoverySignOut()}
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    )
  }
  return (
    <Suspense fallback={<WorkspaceLoading label="Loading your dashboard..." />}>
      <Dashboard
        profile={profile}
        user={session.user}
        onProfileUpdated={handleProfileUpdated}
      />
    </Suspense>
  )
}
