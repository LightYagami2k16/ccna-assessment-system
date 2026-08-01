import { useCallback, useEffect, useRef, useState } from 'react'
import QuizResult from './QuizResult'
import QuizTimer from './QuizTimer'
import ConfirmationDialog from './ConfirmationDialog'
import useExamIntegrityMonitor from '../hooks/useExamIntegrityMonitor'
import useAssessmentClientSession from '../hooks/useAssessmentClientSession'
import useAssessmentFocusMode from '../hooks/useAssessmentFocusMode'
import {
  getCliAttempt,
  saveCliCommand,
  submitCliAttempt,
} from '../services/cliLabService'
import {
  configurePcState,
  createDeviceState,
  executeCiscoCommand,
  executePcCommand,
  executeTopologyCommand,
  getDevicePrompt,
} from '../simulator/ciscoSimulator'

export default function CliTerminal({ attemptId, onSubmitted, onExit }) {
  useAssessmentFocusMode()

  const [data, setData] = useState(null)
  const [state, setState] = useState(null)
  const [deviceStates, setDeviceStates] = useState({})
  const [activeDeviceId, setActiveDeviceId] = useState('')
  const [linesByDevice, setLinesByDevice] = useState({})
  const [command, setCommand] = useState('')
  const [pcView, setPcView] = useState('configuration')
  const [pcSettings, setPcSettings] = useState({
    ipAddress: '',
    subnetMask: '',
    defaultGateway: '',
    preferredDns: '',
    alternateDns: '',
  })
  const [pcSettingsMessage, setPcSettingsMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [integrityWarning, setIntegrityWarning] = useState('')
  const [result, setResult] = useState(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const endRef = useRef(null)
  const commandInputRef = useRef(null)
  const onExitRef = useRef(onExit)
  const clientSession = useAssessmentClientSession({
    assessmentType: 'cli',
    attemptId,
    enabled: !result,
  })

  const handleExit = useCallback(async (options) => {
    await clientSession.release()
    onExitRef.current?.(options)
  }, [clientSession])

  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

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
    if (clientSession.status !== 'active') return

    try {
      const attemptData = await getCliAttempt(
        attemptId,
        clientSession.clientId,
      )
      if (attemptData.attempt.status !== 'in_progress') {
        onExitRef.current?.({ completed: true })
        return
      }
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
              : createDeviceState(device.hostname, device.type)),
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
  }, [attemptId, clientSession.clientId, clientSession.status])

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

  useEffect(() => {
    if (state?.deviceType !== 'pc') return
    setPcSettings({
      ipAddress: state.interfaces?.Ethernet0?.ipAddress ?? '',
      subnetMask: state.interfaces?.Ethernet0?.subnetMask ?? '',
      defaultGateway: state.defaultGateway ?? '',
      preferredDns: state.dnsServers?.[0] ?? '',
      alternateDns: state.dnsServers?.[1] ?? '',
    })
  }, [activeDeviceId, state])

  async function handleCommand(event) {
    event.preventDefault()
    if (!command.trim() || busy || !state) return
    const entered = command
    const prompt = getDevicePrompt(state)
    const topologyOutcome = executeTopologyCommand({
      deviceStates,
      activeDeviceId,
      devices: data.lab.devices,
      topology: data.lab.topology,
      rawCommand: entered,
    })
    const pcCommandAllowed = /^(?:ping|tracert|traceroute)\s+\S+$|^ipconfig(?:\s+\/all)?$|^(?:help|\?)$/i
      .test(entered.trim())
    const outcome = topologyOutcome ?? (activeDevice?.type === 'pc'
      ? pcCommandAllowed
        ? executePcCommand(state, entered)
        : {
            state: structuredClone(state),
            accepted: false,
            output: 'Use the IP Configuration tab to change this PC. CMD accepts ping, tracert, ipconfig, and help.',
            modeBefore: state.mode,
            modeAfter: state.mode,
          }
      : executeCiscoCommand(state, entered))
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
        clientId: clientSession.clientId,
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

  async function handlePcConfiguration(event) {
    event.preventDefault()
    if (busy || state?.deviceType !== 'pc') return

    const outcome = configurePcState(state, pcSettings)
    if (!outcome.accepted) {
      setPcSettingsMessage(outcome.error)
      return
    }

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
    setMessage('')
    setPcSettingsMessage('')
    try {
      await saveCliCommand({
        attemptId,
        clientId: clientSession.clientId,
        deviceId: activeDeviceId,
        command: 'Applied IPv4 settings',
        ...outcome,
        state: persistedState,
      })
      setDeviceStates(nextDeviceStates)
      setState(outcome.state)
      setPcSettingsMessage('IPv4 settings saved successfully.')
      setLinesByDevice((current) => ({
        ...current,
        [activeDeviceId]: [
          ...(current[activeDeviceId] ?? []),
          '[IPv4 settings updated through IP Configuration]',
        ],
      }))
    } catch (error) {
      setPcSettingsMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (busy || result) return
    setBusy(true)
    try {
      const submissionResult = await submitCliAttempt(
        attemptId,
        clientSession.clientId,
      )
      setResult(submissionResult)
      onSubmitted?.(submissionResult)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }, [attemptId, busy, clientSession.clientId, onSubmitted, result])

  if (clientSession.status === 'claiming') {
    return (
      <main className="cli-focus-shell assessment-session-state">
        <h1>Securing CLI session</h1>
        <p>Confirming that this browser can continue the practical...</p>
      </main>
    )
  }

  if (clientSession.status === 'blocked') {
    return (
      <main className="cli-focus-shell assessment-session-state">
        <h1>CLI practical open elsewhere</h1>
        <p className="form-message form-message--error">
          {clientSession.message}
        </p>
        <div className="assessment-session-state__actions">
          <button type="button" onClick={clientSession.retry}>
            Try again
          </button>
          <button type="button" className="secondary" onClick={() => onExit?.()}>
            Return to practicals
          </button>
        </div>
      </main>
    )
  }

  if (result) {
    return (
      <QuizResult
        result={result}
        onReturn={() => void handleExit({ completed: true })}
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
      {clientSession.message && (
        <div
          className={`assessment-connection-notice assessment-connection-notice--${clientSession.connectionStatus}`}
          role="status"
        >
          {clientSession.message}
        </div>
      )}
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
            {activeDevice.type === 'pc' ? (
              <>
                <span>IPv4 address</span>
                <strong>{state.interfaces?.Ethernet0?.ipAddress || 'Not configured'}</strong>
                <span>Default gateway</span>
                <strong>{state.defaultGateway || 'Not configured'}</strong>
              </>
            ) : (
              <>
                <span>Current mode</span><strong>{state.mode.replaceAll('_', ' ')}</strong>
                <span>Saved</span><strong>{state.saved ? 'Yes' : 'No'}</strong>
              </>
            )}
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
            <span>
              {activeDevice.label} · {state.hostname} —{' '}
              {activeDevice.type === 'pc' ? 'PC Command Prompt' : 'Cisco IOS'}
            </span>
            <button type="button" onClick={() => void handleExit()}>Exit</button>
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
                    setPcView(device.type === 'pc' ? 'configuration' : 'command')
                    setPcSettingsMessage('')
                    if (device.type !== 'pc') {
                      window.requestAnimationFrame(focusCommandInput)
                    }
                  }}
                >
                  {device.label}
                </button>
              ))}
            </div>
          )}
          {activeDevice.type === 'pc' && (
            <div className="pc-workspace-tabs" role="tablist" aria-label="PC tools">
              <button
                type="button"
                role="tab"
                aria-selected={pcView === 'configuration'}
                onClick={() => setPcView('configuration')}
              >
                IP Configuration
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pcView === 'command'}
                onClick={() => {
                  setPcView('command')
                  window.requestAnimationFrame(focusCommandInput)
                }}
              >
                Command Prompt
              </button>
            </div>
          )}

          {activeDevice.type === 'pc' && pcView === 'configuration' ? (
            <form className="pc-ipv4-panel" onSubmit={handlePcConfiguration}>
              <div className="pc-ipv4-panel__heading">
                <div>
                  <span className="eyebrow">PC NETWORK ADAPTER</span>
                  <h2>Internet Protocol Version 4 (TCP/IPv4)</h2>
                  <p>Enter the static network settings required by the practical.</p>
                </div>
                <span className="pc-ipv4-panel__adapter">Ethernet0</span>
              </div>

              <fieldset>
                <legend>IP address settings</legend>
                <p className="pc-setting-choice">
                  <span aria-hidden="true" /> Use the following IP address
                </p>
                <div className="pc-ipv4-fields">
                  <label>
                    IP address <span className="required-mark">*</span>
                    <input
                      required
                      inputMode="decimal"
                      placeholder="192.168.10.10"
                      value={pcSettings.ipAddress}
                      onChange={(event) => setPcSettings((current) => ({
                        ...current,
                        ipAddress: event.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    Subnet mask <span className="required-mark">*</span>
                    <input
                      required
                      inputMode="decimal"
                      placeholder="255.255.255.0"
                      value={pcSettings.subnetMask}
                      onChange={(event) => setPcSettings((current) => ({
                        ...current,
                        subnetMask: event.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    Default gateway
                    <input
                      inputMode="decimal"
                      placeholder="192.168.10.1"
                      value={pcSettings.defaultGateway}
                      onChange={(event) => setPcSettings((current) => ({
                        ...current,
                        defaultGateway: event.target.value,
                      }))}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>DNS server settings</legend>
                <p className="pc-setting-choice">
                  <span aria-hidden="true" /> Use the following DNS server addresses
                </p>
                <div className="pc-ipv4-fields">
                  <label>
                    Preferred DNS server
                    <input
                      inputMode="decimal"
                      placeholder="8.8.8.8"
                      value={pcSettings.preferredDns}
                      onChange={(event) => setPcSettings((current) => ({
                        ...current,
                        preferredDns: event.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    Alternate DNS server
                    <input
                      inputMode="decimal"
                      placeholder="1.1.1.1"
                      value={pcSettings.alternateDns}
                      onChange={(event) => setPcSettings((current) => ({
                        ...current,
                        alternateDns: event.target.value,
                      }))}
                    />
                  </label>
                </div>
              </fieldset>

              {pcSettingsMessage && (
                <p
                  className={`form-message ${
                    pcSettingsMessage.includes('successfully')
                      ? 'form-message--success'
                      : 'form-message--error'
                  }`}
                  role="status"
                >
                  {pcSettingsMessage}
                </p>
              )}

              <div className="pc-ipv4-panel__actions">
                <button type="submit" disabled={busy}>
                  {busy ? 'Saving...' : 'Apply IPv4 settings'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setPcView('command')}
                >
                  Open Command Prompt
                </button>
              </div>
            </form>
          ) : (
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
                {activeDevice.type === 'pc'
                  ? `CCNA Assessment PC Command Prompt\nUse IP Configuration to change network settings.\nType help to view CMD commands.\n\n`
                  : `Cisco IOS Software, CCNA Assessment Simulator\nType commands at the prompt.\n\n`}
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
          )}
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
