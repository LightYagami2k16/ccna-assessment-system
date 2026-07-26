import { useCallback, useEffect, useRef, useState } from 'react'
import QuizResult from './QuizResult'
import QuizTimer from './QuizTimer'
import useExamIntegrityMonitor from '../hooks/useExamIntegrityMonitor'
import {
  getCliAttempt,
  saveCliCommand,
  submitCliAttempt,
} from '../services/cliLabService'
import {
  executeCiscoCommand,
  getDevicePrompt,
} from '../simulator/ciscoSimulator'

export default function CliTerminal({ attemptId, onExit }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState(null)
  const [lines, setLines] = useState([])
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [integrityWarning, setIntegrityWarning] = useState('')
  const [result, setResult] = useState(null)
  const endRef = useRef(null)
  const commandInputRef = useRef(null)

  const focusCommandInput = useCallback(() => {
    if (
      !busy
      && !result
      && data?.attempt?.status === 'in_progress'
      && document.visibilityState === 'visible'
    ) {
      commandInputRef.current?.focus({ preventScroll: true })
    }
  }, [busy, data?.attempt?.status, result])

  const handleIntegrityIncident = useCallback((eventType) => {
    const messages = {
      page_hidden:
        'The CLI practical page became hidden. This event was recorded for instructor review.',
      fullscreen_exited:
        'Fullscreen was exited. This event was recorded for instructor review.',
      connection_lost:
        'Your connection was lost. Return online before entering another command.',
    }
    setIntegrityWarning(
      messages[eventType] ?? 'An exam integrity event was recorded.',
    )
  }, [])

  useExamIntegrityMonitor({
    attemptId,
    attemptType: 'cli',
    enabled: data?.attempt?.status === 'in_progress' && !result,
    onIncident: handleIntegrityIncident,
  })

  const loadAttempt = useCallback(async () => {
    try {
      const attemptData = await getCliAttempt(attemptId)
      setData(attemptData)
      setState(attemptData.attempt.state)
      setLines((attemptData.commands ?? []).flatMap((item) => [
        `${attemptData.lab.initialHostname}> ${item.command}`,
        ...(item.output ? item.output.split('\n') : []),
      ]))
    } catch (error) {
      setMessage(error.message)
    }
  }, [attemptId])

  useEffect(() => { void loadAttempt() }, [loadAttempt])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])
  useEffect(() => {
    const frameId = window.requestAnimationFrame(focusCommandInput)
    return () => window.cancelAnimationFrame(frameId)
  }, [focusCommandInput, lines, state])

  useEffect(() => {
    function restoreFocus() {
      window.requestAnimationFrame(focusCommandInput)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') restoreFocus()
    }

    window.addEventListener('focus', restoreFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', restoreFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [focusCommandInput])

  async function handleCommand(event) {
    event.preventDefault()
    if (!command.trim() || busy || !state) return
    const entered = command
    const prompt = getDevicePrompt(state)
    const outcome = executeCiscoCommand(state, entered)
    setBusy(true)
    setCommand('')
    setMessage('')
    try {
      await saveCliCommand({ attemptId, command: entered, ...outcome })
      setState(outcome.state)
      setLines((current) => [
        ...current,
        `${prompt} ${entered}`,
        ...(outcome.output ? outcome.output.split('\n') : []),
      ])
    } catch (error) {
      setMessage(error.message)
      setCommand(entered)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = useCallback(async (skipConfirmation = false) => {
    if (busy || result) return
    if (!skipConfirmation && !window.confirm('Submit this CLI practical for grading?')) return
    setBusy(true)
    try {
      setResult(await submitCliAttempt(attemptId))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }, [attemptId, busy, result])

  if (result) return <QuizResult result={result} onReturn={onExit} />
  if (!data || !state) return <main className="cli-focus-shell"><p>{message || 'Loading CLI practical...'}</p></main>

  return (
    <main className="cli-focus-shell">
      <header className="cli-practical-header">
        <div>
          <span className="eyebrow">CLI PRACTICAL · ATTEMPT {data.attempt.attemptNumber}</span>
          <h1>{data.lab.title}</h1>
        </div>
        <QuizTimer
          expiresAt={data.attempt.expiresAt}
          onTimeExpired={() => void handleSubmit(true)}
        />
      </header>

      {integrityWarning && (
        <div className="integrity-warning" role="alert">
          <span>{integrityWarning}</span>
          <button
            type="button"
            onClick={() => {
              setIntegrityWarning('')
              window.requestAnimationFrame(focusCommandInput)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="cli-practical-layout">
        <aside className="cli-instructions">
          <h2>Requirements</h2>
          <p>{data.lab.instructions}</p>
          <div className="cli-device-summary">
            <span>Device</span><strong>{data.lab.deviceType}</strong>
            <span>Current mode</span><strong>{state.mode.replaceAll('_', ' ')}</strong>
            <span>Saved</span><strong>{state.saved ? 'Yes' : 'No'}</strong>
          </div>
          <button className="danger-button" type="button" disabled={busy}
            onClick={() => void handleSubmit(false)}>
            {busy ? 'Working...' : 'Submit practical'}
          </button>
        </aside>

        <section className="cisco-terminal" aria-label="Cisco CLI terminal">
          <div className="cisco-terminal__titlebar">
            <span>{state.hostname} — Cisco IOS</span>
            <button type="button" onClick={onExit}>Exit</button>
          </div>
          <div
            className="cisco-terminal__screen"
            onMouseDown={(event) => {
              if (!event.target.closest('button, input, a')) {
                event.preventDefault()
                focusCommandInput()
              }
            }}
          >
            <pre>
              {`Cisco IOS Software, CCNA Assessment Simulator\nType commands at the prompt.\n\n`}
              {lines.join('\n')}
              {lines.length ? '\n' : ''}
            </pre>
            <form onSubmit={handleCommand}>
              <label htmlFor="cli-command">{getDevicePrompt(state)}</label>
              <input
                id="cli-command"
                ref={commandInputRef}
                autoFocus
                autoComplete="off"
                spellCheck="false"
                disabled={busy}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget
                  const movedToControl = nextTarget instanceof HTMLElement
                    && nextTarget.closest('button, a, select, textarea')

                  if (!movedToControl) {
                    window.requestAnimationFrame(focusCommandInput)
                  }
                }}
              />
            </form>
            <div ref={endRef} />
          </div>
        </section>
      </div>
      {message && <p className="form-message form-message--error">{message}</p>}
    </main>
  )
}
