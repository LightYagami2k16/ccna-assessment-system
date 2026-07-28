import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthForm() {
  const [mode, setMode] = useState('sign-in')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        setMessage('Account created. Check your email if confirmation is enabled.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage(error.message || 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <span className="eyebrow">CCNA CLASSROOM</span>
        <h1>Assess ITN, SRWE, and ENSA skills.</h1>
        <p>Start with secure quizzes, then add Cisco-style CLI practical exams and network topologies.</p>
        <div className="course-pills">
          <span>ITN</span><span>SRWE</span><span>ENSA</span>
        </div>
      </section>

      <section className="auth-card">
        <h2>{mode === 'sign-in' ? 'Sign in' : 'Create student account'}</h2>
        <p className="muted">Use your class email and password.</p>
        <form onSubmit={handleSubmit}>
          {mode === 'sign-up' && (
            <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
        </form>
        {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
        <button className="link-button" type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
          {mode === 'sign-in' ? 'Create an account' : 'Return to sign in'}
        </button>
      </section>
    </main>
  )
}
