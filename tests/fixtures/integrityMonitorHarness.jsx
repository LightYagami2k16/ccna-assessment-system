import { createRoot } from 'react-dom/client'
import useExamIntegrityMonitor from '../../src/hooks/useExamIntegrityMonitor'

export function mountIntegrityMonitor(attemptType) {
  const container = document.createElement('div')
  document.body.append(container)
  window.integrityTestIncidents = []

  function Monitor() {
    useExamIntegrityMonitor({
      attemptId: 'sample-attempt',
      attemptType,
      enabled: true,
      onIncident: (event) => window.integrityTestIncidents.push(event),
    })

    return (
      <button type="button" onClick={() => document.documentElement.requestFullscreen()}>
        Enter test fullscreen
      </button>
    )
  }

  const root = createRoot(container)
  root.render(<Monitor />)
}
