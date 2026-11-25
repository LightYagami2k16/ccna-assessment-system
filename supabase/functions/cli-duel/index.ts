import { handleDuelRequest } from './handler.js'
import { createDuelBackend } from './backend.js'

const url = Deno.env.get('SUPABASE_URL')
const anon = Deno.env.get('SUPABASE_ANON_KEY')
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const backend = url && anon && service ? createDuelBackend({url,anonKey:anon,serviceKey:service}) : null
Deno.serve(async (request: Request) => {
  if (!backend) return new Response(JSON.stringify({ error: 'The competition service is not configured.', code: 'DUEL_UNAVAILABLE' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  return handleDuelRequest(request,backend)
})
