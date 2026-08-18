import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ApplicationErrorBoundary from './components/ApplicationErrorBoundary.jsx'
import { installGlobalErrorMonitoring } from './services/operationalMonitoringService.js'
import { registerOfflineSupport } from './services/offlineService.js'
import './styles.css'
import './tailwind-pilot.css'

const DEPLOYMENT_RECOVERY_KEY = 'ccna-deployment-preload-recovery'
const DEPLOYMENT_RECOVERY_WINDOW_MS = 60_000

window.addEventListener('vite:preloadError', (event) => {
  if (!window.navigator.onLine) return

  let lastRecoveryAt = 0

  try {
    lastRecoveryAt = Number(
      window.sessionStorage.getItem(DEPLOYMENT_RECOVERY_KEY),
    )
  } catch {
    // A single reload remains safe when session storage is unavailable.
  }

  if (
    Number.isFinite(lastRecoveryAt) &&
    Date.now() - lastRecoveryAt < DEPLOYMENT_RECOVERY_WINDOW_MS
  ) {
    return
  }

  event.preventDefault()

  try {
    window.sessionStorage.setItem(
      DEPLOYMENT_RECOVERY_KEY,
      String(Date.now()),
    )
  } catch {
    // Continue with recovery even when browser storage is restricted.
  }

  window.location.reload()
})

const stopErrorMonitoring = installGlobalErrorMonitoring({
  enabled: import.meta.env.PROD,
})

if (import.meta.hot) {
  import.meta.hot.dispose(stopErrorMonitoring)
}

registerOfflineSupport()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <App />
    </ApplicationErrorBoundary>
  </StrictMode>,
)
