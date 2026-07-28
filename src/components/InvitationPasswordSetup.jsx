import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InvitationPasswordSetup({
  user,
  onComplete,
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Your password must contain at least 8 characters.')
      return
    }

    if (password !== confirmation) {
      setMessage('The passwords do not match.')
      return
    }

    try {
      setBusy(true)

      const { data, error } = await supabase.auth.updateUser({
        password,
        data: {
          ...(user?.user_metadata ?? {}),
          password_initialized: true,
          invitation_pending: false,
        },
      })

      if (error) throw error
      onComplete(data.user)
    } catch (error) {
      setMessage(
        error?.message ?? 'Unable to create your password.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setMessage(error.message)
    }
  }

  return (
    <main className="invitation-setup-shell">
      <section className="invitation-setup-card">
        <span className="eyebrow">ACCOUNT INVITATION</span>
        <h1>Create your password</h1>
        <p>
          Your CCNA Assessment account is ready. Create a secure
          password before opening your workspace.
        </p>

        <div className="invitation-account">
          <span>Invited email</span>
          <strong>{user?.email}</strong>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            New password
            <input
              type="password"
              value={password}
              minLength="8"
              autoComplete="new-password"
              autoFocus
              required
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <small>Use at least 8 characters.</small>
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={confirmation}
              minLength="8"
              autoComplete="new-password"
              required
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>

          {message && (
            <p
              className="form-message form-message--error"
              role="alert"
            >
              {message}
            </p>
          )}

          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Creating password...' : 'Create password'}
          </button>
        </form>

        <button
          className="link-button"
          type="button"
          disabled={busy}
          onClick={() => void handleSignOut()}
        >
          Sign out and use another account
        </button>
      </section>
    </main>
  )
}
