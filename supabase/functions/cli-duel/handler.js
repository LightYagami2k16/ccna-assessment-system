import {validateFullDuelRequest,prepareFullDuelDefinition,createFullDuelInitialState,executeFullDuelOperation} from '../_shared/cliDuelFullProtocol.js'
import { validateDuelRequest, prepareDuelDefinition, validateDuelDefinition, createDuelInitialState, executeDuelCommand } from '../_shared/cliDuelProtocol.js'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export async function handleDuelRequest(request, { authenticate, rpc }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, 405)
  const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!token) return json({ error: 'Sign in to continue.', code: 'UNAUTHENTICATED' }, 401)
  let actor
  try { actor = await authenticate(token) } catch { return json({ error: 'Your session could not be verified.', code: 'UNAUTHENTICATED' }, 401) }
  if (!actor) return json({ error: 'Your session is not valid.', code: 'UNAUTHENTICATED' }, 401)
  let body
  try {
    const text = await request.text()
    if (text.length > 131072) return json({ error: 'This request is too large.', code: 'INVALID_REQUEST' }, 400)
    const parsed=JSON.parse(text)
    body = parsed?.rulesVersion===3 || parsed?.action==='operation' ? validateFullDuelRequest(parsed) : validateDuelRequest(parsed)
  } catch (error) { return json({ error: error instanceof SyntaxError ? 'Enter a valid duel request.' : error.message, code: 'INVALID_REQUEST' }, 400) }
  try {
    if (body.action==='operation') {
      const args={p_actor_id:actor,p_request:body}
      const context=await rpc('cli_duel_operation_context',args)
      if(context.duplicateResult)return json(context.duplicateResult)
      const outcome=executeFullDuelOperation(context.definition,context.state,body)
      return json(await rpc('cli_duel_commit_operation',{...args,p_outcome:outcome}))
    }
    if (body.action === 'create' && body.rulesVersion===3) {
      const context=await rpc('cli_duel_configuration_context',{p_actor_id:actor,p_lab_id:body.labId??null,p_rematch_id:body.rematchId??null})
      let definition
      try{definition=prepareFullDuelDefinition(body.configuration,body.combat)}catch(error){return json({error:error.message,code:'INVALID_CHALLENGE'},400)}
      const competitionId=await rpc('cli_duel_create',{p_actor_id:actor,p_payload:body,p_source_fingerprint:context.fingerprint,p_initial_state:createFullDuelInitialState(definition)})
      return json({competitionId})
    }
    if (body.action === 'create') {
      const context = await rpc('cli_duel_authoring_context', { p_actor_id: actor, p_lab_id: body.labId ?? null, p_rematch_id: body.rematchId ?? null })
      let definition = context.definition
      if (body.rulesVersion === 2) {
        try { definition = prepareDuelDefinition(definition,body.customization,body.combat) } catch (error) { return json({error:error.message,code:'INVALID_CHALLENGE'},400) }
      }
      const errors = validateDuelDefinition(definition)
      if (errors.length) return json({ error: errors.join(' '), code: 'INVALID_CHALLENGE' }, 400)
      const state = createDuelInitialState(definition)
      const competitionId = await rpc('cli_duel_create', { p_actor_id: actor, p_payload: body, p_source_fingerprint: context.fingerprint, p_initial_state: state })
      return json({ competitionId })
    }
    const args = { p_actor_id: actor, p_participant_id: body.participantId, p_client_id: body.clientId, p_command_id: body.commandId, p_sequence: body.sequence, p_expected_revision: body.expectedRevision, p_command: body.command }
    const context = await rpc('cli_duel_command_context', args)
    if (context.duplicateResult) return json(context.duplicateResult)
    if(context.definition?.version>=3)return json({error:'Choose a device and use the full device operation request.',code:'INVALID_REQUEST'},400)
    const outcome = executeDuelCommand(context.definition, context.state, body.command)
    return json(await rpc('cli_duel_commit_command', { ...args, p_outcome: outcome }))
  } catch (error) {
    if (error.code === 'P0001') {
      const message = String(error.message || 'This duel action is unavailable.').slice(0, 240)
      const forbidden = /access|required|authorized|outside|cannot be used|active students|no longer eligible/i.test(message)
      return json({ error: message, code: forbidden ? 'DUEL_FORBIDDEN' : 'DUEL_CONFLICT' }, forbidden ? 403 : 409)
    }
    // Do not send database context, private definitions or stack traces to clients.
    return json({ error: 'The competition service is unavailable. Please resynchronize and try again.', code: 'DUEL_UNAVAILABLE' }, 503)
  }
}
