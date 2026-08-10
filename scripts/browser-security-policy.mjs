export function createBrowserSecurityPolicy(supabaseUrl) {
  const parsedUrl = new URL(supabaseUrl)
  const websocketOrigin = `${
    parsedUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  }//${parsedUrl.host}`

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${parsedUrl.origin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${parsedUrl.origin} ${websocketOrigin}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
  ].join('; ')
}
