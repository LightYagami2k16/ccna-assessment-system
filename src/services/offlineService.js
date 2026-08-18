export function registerOfflineSupport() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`
    try {
      await navigator.serviceWorker.register(serviceWorkerUrl)
      await navigator.serviceWorker.ready

      if ('caches' in window) {
        const cache = await window.caches.open('ccna-assessment-shell-v2')
        const resources = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => new URL(url).origin === window.location.origin)
        await cache.addAll([
          `${import.meta.env.BASE_URL}`,
          ...new Set(resources),
        ])
      }
    } catch {
      // The application remains online-capable if registration is blocked.
    }
  }, { once: true })
}
