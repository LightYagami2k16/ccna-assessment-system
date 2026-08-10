import { Component } from 'react'
import { reportOperationalError } from '../services/operationalMonitoringService'

export default class ApplicationErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (!import.meta.env.PROD) return

    void reportOperationalError(error, {
      kind: 'react_render',
      component: 'React render boundary',
    })
  }

  resetView = () => {
    this.setState({ failed: false })
  }

  reloadApplication = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="application-recovery" role="main">
        <section className="application-recovery__card" role="alert">
          <span className="eyebrow">APPLICATION RECOVERY</span>
          <h1>We couldn’t display this page</h1>
          <p>
            Your account and saved assessment data remain secure. Try
            reopening this view, or reload the application if the problem
            continues.
          </p>
          <div className="application-recovery__actions">
            <button type="button" onClick={this.resetView}>
              Try again
            </button>
            <button
              className="secondary"
              type="button"
              onClick={this.reloadApplication}
            >
              Reload application
            </button>
          </div>
        </section>
      </main>
    )
  }
}
