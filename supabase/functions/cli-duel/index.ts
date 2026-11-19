import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { handleDuelRequest } from './handler.js'

Deno.serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anon || !service) return new Response(JSON.stringify({ error: 'The competition service is not configured.', code: 'DUEL_UNAVAILABLE' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const trusted = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  return handleDuelRequest(request, {
    authenticate: async (token: string) => {
      const { data, error } = await userClient.auth.getUser(token)
      return error ? null : data.user?.id ?? null
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await trusted.rpc(name, args)
      if (error) throw error
      return data
    },
  })
})
