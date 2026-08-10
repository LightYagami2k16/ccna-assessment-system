import { validatePublicAppUrl } from './runtimeConfig.js'

export function getPublicAppUrl() {
  const configuredUrl = String(
    import.meta.env.VITE_PUBLIC_APP_URL ?? '',
  ).trim()

  if (configuredUrl) {
    return validatePublicAppUrl(configuredUrl, {
      allowLocal: import.meta.env.DEV,
    })
  }

  if (typeof window === 'undefined') {
    throw new Error('VITE_PUBLIC_APP_URL is required outside the browser.')
  }

  return validatePublicAppUrl(
    new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
    { allowLocal: true },
  )
}
