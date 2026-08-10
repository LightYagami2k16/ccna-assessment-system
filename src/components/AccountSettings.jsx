import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPublicAppUrl } from '../config/publicAppUrl'
import { supabase } from '../lib/supabase'

export default function AccountSettings({
  user,
  profile,
  previewMode = false,
  onProfileUpdated,
  onClose,
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] =
    useState('')
  const [nameMessage, setNameMessage] = useState('')
  const [nameMessageTone, setNameMessageTone] = useState('success')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordMessageTone, setPasswordMessageTone] =
    useState('success')
  const [savingName, setSavingName] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const passwordEmailRequired = [
    'instructor',
    'administrator',
    'admin',
  ].includes(profile?.role)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
  }, [profile?.full_name])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusableElements?.length) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  async function handleNameSubmit(event) {
    event.preventDefault()
    const normalizedName = fullName.trim()

    if (!normalizedName) {
      setNameMessageTone('error')
      setNameMessage('Enter your full name.')
      return
    }

    try {
      setSavingName(true)
      setNameMessage('')

      if (!previewMode) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: normalizedName })
          .eq('id', user.id)
          .select('full_name')
          .single()

        if (profileError) throw profileError

        const { error: authError } = await supabase.auth.updateUser({
          data: {
            ...(user?.user_metadata ?? {}),
            full_name: normalizedName,
          },
        })

        if (authError) throw authError
      }

      setFullName(normalizedName)
      onProfileUpdated?.({ full_name: normalizedName })
      setNameMessageTone('success')
      setNameMessage('Your name was updated.')
    } catch (error) {
      setNameMessageTone('error')
      setNameMessage(error?.message ?? 'Unable to update your name.')
    } finally {
      setSavingName(false)
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordMessage('')

    if (newPassword.length < 8) {
      setPasswordMessageTone('error')
      setPasswordMessage(
        'Your new password must contain at least 8 characters.',
      )
      return
    }

    if (newPassword !== passwordConfirmation) {
      setPasswordMessageTone('error')
      setPasswordMessage('The passwords do not match.')
      return
    }

    try {
      setSavingPassword(true)

      if (!previewMode) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
          data: {
            ...(user?.user_metadata ?? {}),
            password_initialized: true,
            invitation_pending: false,
          },
        })

        if (error) throw error
      }

      setNewPassword('')
      setPasswordConfirmation('')
      setPasswordMessageTone('success')
      setPasswordMessage('Your password was changed successfully.')
    } catch (error) {
      setPasswordMessageTone('error')
      setPasswordMessage(
        error?.message ?? 'Unable to change your password.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  async function handlePasswordVerificationEmail() {
    setPasswordMessage('')

    try {
      setSavingPassword(true)

      if (!previewMode) {
        const { error } =
          await supabase.auth.resetPasswordForEmail(
            user.email,
            { redirectTo: getPublicAppUrl() },
          )

        if (error) throw error
      }

      setPasswordMessageTone('success')
      setPasswordMessage(
        `A verification link was sent to ${user.email}. Open that email to change your password.`,
      )
    } catch (error) {
      setPasswordMessageTone('error')
      setPasswordMessage(
        error?.message ??
          'Unable to send the password verification email.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  return createPortal(
    <div
      className="account-settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
    <section
      ref={dialogRef}
      className="account-settings-panel account-settings-modal"
      id="account-settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-title"
    >
      <header className="section-heading account-settings-heading">
        <div>
          <span className="eyebrow">ACCOUNT SETTINGS</span>
          <h2 id="account-settings-title">Profile and security</h2>
          <p>
            Update the name displayed in the platform or create a new
            sign-in password.
          </p>
        </div>

        <button
          ref={closeButtonRef}
          className="secondary"
          type="button"
          onClick={onClose}
        >
          Close settings
        </button>
      </header>

      <div className="account-settings-grid">
        <form
          className="account-settings-card"
          onSubmit={(event) => void handleNameSubmit(event)}
        >
          <div>
            <span className="eyebrow">PROFILE</span>
            <h3>Edit your name</h3>
            <p>Your email address remains {user?.email}.</p>
          </div>

          <label>
            Full name
            <input
              value={fullName}
              autoComplete="name"
              required
              disabled={savingName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>

          {nameMessage && (
            <p
              className={
                nameMessageTone === 'error'
                  ? 'form-message form-message--error'
                  : 'form-message form-message--success'
              }
              role="status"
            >
              {nameMessage}
            </p>
          )}

          <button
            className="primary"
            type="submit"
            disabled={savingName}
          >
            {savingName ? 'Saving name...' : 'Save name'}
          </button>
        </form>

        {passwordEmailRequired ? (
          <section className="account-settings-card">
            <div>
              <span className="eyebrow">SECURITY</span>
              <h3>Change your password</h3>
              <p>
                Instructor and administrator password changes require
                email verification.
              </p>
            </div>

            <div className="account-security-verification">
              <strong>Verify your account first</strong>
              <p>
                We will send a secure verification link to
                {' '}
                {user?.email}. Your password cannot be changed from
                this page.
              </p>
            </div>

            {passwordMessage && (
              <p
                className={
                  passwordMessageTone === 'error'
                    ? 'form-message form-message--error'
                    : 'form-message form-message--success'
                }
                role="status"
              >
                {passwordMessage}
              </p>
            )}

            <button
              className="primary"
              type="button"
              disabled={savingPassword}
              onClick={() =>
                void handlePasswordVerificationEmail()
              }
            >
              {savingPassword
                ? 'Sending verification email...'
                : 'Send verification email'}
            </button>
          </section>
        ) : (
          <form
            className="account-settings-card"
            onSubmit={(event) => void handlePasswordSubmit(event)}
          >
          <div>
            <span className="eyebrow">SECURITY</span>
            <h3>Change your password</h3>
            <p>Use a password that you do not use on other websites.</p>
          </div>

          <label>
            New password
            <input
              type="password"
              value={newPassword}
              minLength="8"
              autoComplete="new-password"
              required
              disabled={savingPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={passwordConfirmation}
              minLength="8"
              autoComplete="new-password"
              required
              disabled={savingPassword}
              onChange={(event) =>
                setPasswordConfirmation(event.target.value)
              }
            />
          </label>

          {passwordMessage && (
            <p
              className={
                passwordMessageTone === 'error'
                  ? 'form-message form-message--error'
                  : 'form-message form-message--success'
              }
              role="status"
            >
              {passwordMessage}
            </p>
          )}

          <button
            className="primary"
            type="submit"
            disabled={savingPassword}
          >
            {savingPassword
              ? 'Changing password...'
              : 'Change password'}
          </button>
          </form>
        )}
      </div>
    </section>
    </div>,
    document.body,
  )
}
