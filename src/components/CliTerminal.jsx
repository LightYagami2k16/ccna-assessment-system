import { useCallback, useEffect, useRef, useState } from 'react'
import QuizResult from './QuizResult'
import QuizTimer from './QuizTimer'
import ConfirmationDialog from './ConfirmationDialog'
import useExamIntegrityMonitor from '../hooks/useExamIntegrityMonitor'
import {
  getCliAttempt,
  saveCliCommand,
  submitCliAttempt,
} from '../services/cliLabService'
import {
  createDeviceState,
  executeCiscoCommand,
  executeTopologyCommand,
  getDevicePrompt,
} from '../simulator/ciscoSimulator'

export default function CliTerminal({ attemptId, onExit }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState(null)
  const [deviceStates, setDeviceStates] = useState({})
  const [activeDeviceId, setActiveDeviceId] = useState('')
  const [linesByDevice, setLinesByDevice] = useState({})
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [integrityWarning, setIntegrityWarning] = useState('')
  const [result, setResult] = useState(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
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
      const devices = attemptData.lab.devices?.length
        ? attemptData.lab.devices
        : [{
          id: 'device-1',
          label: attemptData.lab.initialHostname,
          hostname: attemptData.lab.initialHostname,
          type: attemptData.lab.deviceType,
        }]
      const persistedState = attemptData.attempt.state ?? {}
      const {
        deviceStates: persistedDeviceStates,
        activeDeviceId: persistedActiveDeviceId,
        ...legacyPrimaryState
      } = persistedState
      const restoredDeviceStates = Object.fromEntries(
        devices.map((device, index) => [
          device.id,
          persistedDeviceStates?.[device.id]
            ?? (index === 0 && legacyPrimaryState.hostname
              ? legacyPrimaryState
              : createDeviceState(device.hostname)),
        ]),
      )
      const restoredActiveDeviceId =
        restoredDeviceStates[persistedActiveDeviceId]
          ? persistedActiveDeviceId
          : devices[0].id
      const restoredLines = Object.fromEntries(
        devices.map((device) => [
          device.id,
          (attemptData.commands ?? [])
            .filter((item) => item.deviceId === device.id)
            .flatMap((item) => [
              item.command,
              ...(item.output ? item.output.split('\n') : []),
            ]),
        ]),
      )
      setData(attemptData)
      setDeviceStates(restoredDeviceStates)
      setActiveDeviceId(restoredActiveDeviceId)
      setState(restoredDeviceStates[restoredActiveDeviceId])
      setLinesByDevice(restoredLines)
    } catch (error) {
      setMessage(error.message)
    }
  }, [attemptId])

  useEffect(() => { void loadAttempt() }, [loadAttempt])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeDeviceId, linesByDevice])
  useEffect(() => {
    const frameId = window.requestAnimationFrame(focusCommandInput)
    return () => window.cancelAnimationFrame(frameId)
  }, [focusCommandInput, linesByDevice, state])

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
    const outcome = executeTopologyCommand({
      deviceStates,
      activeDeviceId,
      topology: data.lab.topology,
      rawCommand: entered,
    }) ?? executeCiscoCommand(state, entered)
    const nextDeviceStates = {
      ...deviceStates,
      [activeDeviceId]: outcome.state,
    }
    const primaryDeviceId = data.lab.devices[0].id
    const persistedState = {
      ...nextDeviceStates[primaryDeviceId],
      deviceStates: nextDeviceStates,
      activeDeviceId,
    }
    setBusy(true)
    setCommand('')
    setMessage('')
    try {
      await saveCliCommand({
        attemptId,
        deviceId: activeDeviceId,
        command: entered,
        ...outcome,
        state: persistedState,
      })
      setDeviceStates(nextDeviceStates)
      setState(outcome.state)
      setLinesByDevice((current) => ({
        ...current,
        [activeDeviceId]: [
          ...(current[activeDeviceId] ?? []),
          `${prompt} ${entered}`,
          ...(outcome.output ? outcome.output.split('\n') : []),
        ],
      }))
    } catch (error) {
      setMessage(error.message)
      setCommand(entered)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (busy || result) return
    setBusy(true)
    try {
      setResult(await submitCliAttempt(attemptId))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }, [attemptId, busy, result])

  if (result) {
    return (
      <QuizResult
        result={result}
        onReturn={() => onExit?.({ completed: true })}
      />
    )
  }
  if (!data || !state) return <main className="cli-focus-shell"><p>{message || 'Loading CLI practical...'}</p></main>

  const devices = data.lab.devices
  const activeDevice = devices.find(
    (device) => device.id === activeDeviceId,
  ) ?? devices[0]
  const activeLines = linesByDevice[activeDeviceId] ?? []

  return (
    <main className="cli-focus-shell">
      <header className="cli-practical-header">
        <div>
          <span className="eyebrow">CLI PRACTICAL · ATTEMPT {data.attempt.attemptNumber}</span>
          <h1>{data.lab.title}</h1>
        </div>
        <QuizTimer
          expiresAt={data.attempt.expiresAt}
          onTimeExpired={() => {
            setSubmitDialogOpen(false)
            void handleSubmit()
          }}
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
            <span>Device</span><strong>{activeDevice.label}</strong>
            <span>Type</span><strong>{activeDevice.type}</strong>
            <span>Current mode</span><strong>{state.mode.replaceAll('_', ' ')}</strong>
            <span>Saved</span><strong>{state.saved ? 'Yes' : 'No'}</strong>
          </div>
          {data.lab.topology?.links?.length > 0 && (
            <div className="cli-topology-summary">
              <strong>Topology links</strong>
              <ul>
                {data.lab.topology.links.map((link) => {
                  const fromDevice = devices.find(
                    (device) => device.id === link.fromDeviceId,
                  )
                  const toDevice = devices.find(
                    (device) => device.id === link.toDeviceId,
                  )
                  return (
                    <li key={link.id}>
                      {fromDevice?.label} {link.fromInterface}
                      {' ↔ '}
                      {toDevice?.label} {link.toInterface}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <button className="danger-button" type="button" disabled={busy}
            onClick={() => setSubmitDialogOpen(true)}>
            {busy ? 'Working...' : 'Submit practical'}
          </button>
        </aside>

        <section className="cisco-terminal" aria-label="Cisco CLI terminal">
          <div className="cisco-terminal__titlebar">
            <span>{activeDevice.label} · {state.hostname} — Cisco IOS</span>
            <button type="button" onClick={() => onExit?.()}>Exit</button>
          </div>
          {devices.length > 1 && (
            <div
              className="cli-device-tabs"
              role="tablist"
              aria-label="Topology devices"
            >
              {devices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  role="tab"
                  aria-selected={device.id === activeDeviceId}
                  onClick={() => {
                    setActiveDeviceId(device.id)
                    setState(deviceStates[device.id])
                    setCommand('')
                    window.requestAnimationFrame(focusCommandInput)
                  }}
                >
                  {device.label}
                </button>
              ))}
            </div>
          )}
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
              {activeLines.join('\n')}
              {activeLines.length ? '\n' : ''}
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
      <ConfirmationDialog
        open={submitDialogOpen}
        title="Submit CLI practical?"
        message="Submit the current device configuration for grading? Commands cannot be changed afterward."
        confirmLabel="Submit practical"
        tone="primary"
        onCancel={() => {
          setSubmitDialogOpen(false)
          window.requestAnimationFrame(focusCommandInput)
        }}
        onConfirm={() => {
          setSubmitDialogOpen(false)
          void handleSubmit()
        }}
      />
    </main>
  )
}
