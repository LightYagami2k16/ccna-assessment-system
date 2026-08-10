function requiredValue(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (/YOUR_|CHANGE_ME|EXAMPLE/i.test(normalized)) {
    throw new Error(`${label} still contains a placeholder value.`)
  }
  return normalized
}

function jwtRole(token) {
  const segments = token.split('.')
  if (segments.length !== 3) return null
  try {
    const base64 = segments[1].replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(globalThis.atob(padded)).role ?? null
  } catch {
    return null
  }
}

export function validatePublicSupabaseConfig({ url, key }) {
  const supabaseUrl = requiredValue(url, 'VITE_SUPABASE_URL')
  const publishableKey = requiredValue(
    key,
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  )

  let parsedUrl
  try {
    parsedUrl = new URL(supabaseUrl)
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid URL.')
  }

  const localHost = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !localHost) {
    throw new Error('VITE_SUPABASE_URL must use HTTPS outside local development.')
  }

  if (
    publishableKey.startsWith('sb_secret_')
    || /service[_-]?role/i.test(publishableKey)
    || jwtRole(publishableKey) === 'service_role'
  ) {
    throw new Error(
      'A Supabase secret or service-role key must never be used in the browser.',
    )
  }

  return {
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ''),
    publishableKey,
  }
}

export function validatePublicAppUrl(
  value,
  { allowLocal = false, label = 'VITE_PUBLIC_APP_URL' } = {},
) {
  const publicAppUrl = requiredValue(value, label)

  let parsedUrl
  try {
    parsedUrl = new URL(publicAppUrl)
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`)
  }

  const localHost = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !(allowLocal && localHost)) {
    throw new Error(`${label} must use HTTPS outside local development.`)
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error(`${label} must not contain URL credentials.`)
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error(`${label} must not contain a query string or fragment.`)
  }

  parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, '')}/`
  return parsedUrl.toString()
}
