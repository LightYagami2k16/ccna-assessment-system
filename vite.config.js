import { defineConfig, loadEnv } from 'vite'
import { cwd } from 'node:process'
import react from '@vitejs/plugin-react'
import { createBrowserSecurityPolicy } from './scripts/browser-security-policy.mjs'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, cwd(), '')
  const plugins = [react()]

  if (command === 'build' && env.VITE_SUPABASE_URL) {
    plugins.push({
      name: 'production-browser-security-policy',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: createBrowserSecurityPolicy(env.VITE_SUPABASE_URL),
            },
            injectTo: 'head-prepend',
          },
        ]
      },
    })
  }

  return {
    plugins,
    // Relative paths support username.github.io and project Pages sites.
    base: './',
  }
})
