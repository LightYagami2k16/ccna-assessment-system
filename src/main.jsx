import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ApplicationErrorBoundary from './components/ApplicationErrorBoundary.jsx'
import { installGlobalErrorMonitoring } from './services/operationalMonitoringService.js'
import './styles.css'
import './tailwind-pilot.css'

const stopErrorMonitoring = installGlobalErrorMonitoring({
  enabled: import.meta.env.PROD,
})

if (import.meta.hot) {
  import.meta.hot.dispose(stopErrorMonitoring)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <App />
    </ApplicationErrorBoundary>
  </StrictMode>,
)
