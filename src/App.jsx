import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'
import AuthForm from './components/AuthForm'
import InvitationPasswordSetup from './components/InvitationPasswordSetup'
import WorkspaceLoading from './components/WorkspaceLoading'
import useInactivityLogout from './hooks/useInactivityLogout'
import { supabase } from './lib/supabase'
import {
  clearWorkspacePath,
  replaceWorkspacePath,
  workspaceDefaultPathForRole,
} from './routing/workspaceRoutes'

const Dashboard = lazy(() => import('./components/Dashboard'))

const uatRole = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('uat-role')
  : null
const activeUatRole = ['administrator', 'instructor', 'student'].includes(uatRole)
  ? uatRole
  : null

function getCachedSupabaseSession() {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const stored = JSON.parse(window.localStorage.getItem(key))
      const session = stored?.currentSession ?? stored
      if (session?.access_token && session?.user) return session
    }
  } catch {
    // A sign-in screen is used when cached authentication is unavailable.
  }
  return null
}

function profileCacheKey(userId) {
  return `ccna-profile:${userId}`
}

function getCachedProfile(userId) {
  if (!userId) return null
  try {
    return JSON.parse(
      window.localStorage.getItem(profileCacheKey(userId)),
    )
  } catch {
    return null
  }
}

function cacheProfile(profile) {
  if (!profile?.id) return
  try {
    window.localStorage.setItem(
      profileCacheKey(profile.id),
      JSON.stringify(profile),
    )
  } catch {
    // Online profile loading remains available without local storage.
  }
}

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

function getStoredPasswordRecoveryState() {
  try {
    return (
      window.sessionStorage.getItem(
        'ccna-password-recovery-active',
      ) === 'true'
    )
  } catch {
    return false
  }
}

function storePasswordRecoveryState(active) {
  try {
    if (active) {
      window.sessionStorage.setItem(
        'ccna-password-recovery-active',
        'true',
      )
    } else {
      window.sessionStorage.removeItem(
        'ccna-password-recovery-active',
      )
    }
  } catch {
    // Recovery remains available for the current render.
  }
}

export default function App() {
  const [session, setSession] = useState(() =>
    !activeUatRole && !navigator.onLine
      ? getCachedSupabaseSession()
      : null,
  )
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')
  const [profileLoadVersion, setProfileLoadVersion] = useState(0)
  const [loading, setLoading] = useState(!activeUatRole)
  const [authenticationLinkError] = useState(
    getAuthenticationLinkError,
  )
  const [passwordRecoveryActive, setPasswordRecoveryActive] =
    useState(getStoredPasswordRecoveryState)
  const [overviewRedirectPending, setOverviewRedirectPending] =
    useState(false)
  const userId = session?.user?.id ?? null
  const requiresInvitationPassword = userNeedsInvitationPassword(
    session?.user,
  )
  const requiresPasswordChange =
    session?.user?.user_metadata?.password_change_required === true ||
    profile?.password_change_required === true

  const handleInactivityLogout = useCallback(async () => {
    setSessionMessage(
      'You were signed out after 15 minutes without activity. Sign in again to continue.',
    )

    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      setSession(null)
      setProfile(null)
      setLoading(false)
    }
  }, [])

  useInactivityLogout({
    userId,
    enabled: Boolean(userId) && !activeUatRole,
    onInactive: handleInactivityLogout,
  })

  useEffect(() => {
    if (activeUatRole) return undefined

    let active = true

    async function loadSession() {
      const request = supabase.auth.getSession()
      const timeout = new Promise((resolve) => {
        window.setTimeout(
          () => resolve({ data: { session: getCachedSupabaseSession() } }),
          navigator.onLine ? 8_000 : 750,
        )
      })
      const { data } = await Promise.race([request, timeout])
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    }

    void loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession)

        if (nextSession && event === 'SIGNED_IN') {
          setSessionMessage('')
        }

        if (event === 'PASSWORD_RECOVERY' && nextSession) {
          setPasswordRecoveryActive(true)
          storePasswordRecoveryState(true)
        }

        if (!nextSession) {
          setPasswordRecoveryActive(false)
          storePasswordRecoveryState(false)
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
    if (activeUatRole || loading || session) return
    clearWorkspacePath()
  }, [loading, session])

  useEffect(() => {
    if (
      !overviewRedirectPending ||
      !session ||
      !profile ||
      requiresInvitationPassword ||
      passwordRecoveryActive ||
      requiresPasswordChange
    ) {
      return
    }

    replaceWorkspacePath(workspaceDefaultPathForRole(profile.role))
    setOverviewRedirectPending(false)
  }, [
    overviewRedirectPending,
    passwordRecoveryActive,
    profile,
    requiresInvitationPassword,
    requiresPasswordChange,
    session,
  ])

  useEffect(() => {
    if (activeUatRole) return undefined

    let active = true

    async function loadProfile() {
      if (!userId) return

      setLoading(true)
      setProfile(null)
      setProfileError('')

      let { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, role, password_change_required',
        )
        .eq('id', userId)
        .single()

      if (['42703', 'PGRST204'].includes(error?.code)) {
        const fallback = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', userId)
          .single()
        data = fallback.data
          ? {
              ...fallback.data,
              password_change_required: false,
            }
          : null
        error = fallback.error
      }

      if (active) {
        if (error) {
          const cachedProfile = getCachedProfile(userId)
          if (cachedProfile) {
            setProfile(cachedProfile)
            setProfileError(
              navigator.onLine
                ? 'A saved profile is shown while the server reconnects.'
                : 'Offline continuation is using the profile saved on this device.',
            )
          } else {
            setProfileError(
              'We could not load your account profile. Check your connection and try again.',
            )
          }
        } else {
          setProfile(data)
          cacheProfile(data)
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
    setPasswordRecoveryActive(false)
    storePasswordRecoveryState(false)
    const { error } = await supabase.auth.signOut()

    if (error) {
      setProfileError(`Unable to sign out: ${error.message}`)
    }
  }

  function handlePasswordSetupComplete(updatedUser) {
    setPasswordRecoveryActive(false)
    storePasswordRecoveryState(false)
    setSession((currentSession) =>
      currentSession
        ? { ...currentSession, user: updatedUser }
        : currentSession,
    )
    setProfile((currentProfile) =>
      currentProfile
        ? {
            ...currentProfile,
            password_change_required: false,
          }
        : currentProfile,
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
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        Loading CCNA Assessment…
      </div>
    )
  }
  if (!session) {
    return (
      <AuthForm
        initialMessage={authenticationLinkError || sessionMessage}
        onSignedIn={() => setOverviewRedirectPending(true)}
      />
    )
  }
  if (
    requiresInvitationPassword ||
    passwordRecoveryActive ||
    requiresPasswordChange
  ) {
    return (
      <InvitationPasswordSetup
        user={session.user}
        mode={
          passwordRecoveryActive
            ? 'recovery'
            : requiresPasswordChange
              ? 'required'
              : 'invitation'
        }
        onComplete={handlePasswordSetupComplete}
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
