import {
  validatePublicAppUrl,
  validatePublicSupabaseConfig,
} from '../src/config/runtimeConfig.js'

try {
  const config = validatePublicSupabaseConfig({
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
  const publicAppUrl = validatePublicAppUrl(
    process.env.VITE_PUBLIC_APP_URL,
  )
  process.stdout.write(
    `Production configuration is valid for ${new URL(config.supabaseUrl).hostname} and ${publicAppUrl}.\n`,
  )
} catch (error) {
  process.stderr.write(`Production configuration error: ${error.message}\n`)
  process.exitCode = 1
}
