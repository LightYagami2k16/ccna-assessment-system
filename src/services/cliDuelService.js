import { supabase } from '../lib/supabase'
import {createDuelNotifier} from './cliDuelDelivery'

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
export const enterDuelArena = (id,client) => rpc('enter_cli_duel_arena',{p_participant_id:id,p_client_id:client})
export const selectDuelCharacter = (id,client,character) => rpc('select_cli_duel_character',{p_participant_id:id,p_client_id:client,p_character_id:character})
export const controlDuel = (id,action) => rpc('control_cli_duel',{p_competition_id:id,p_action:action})
export const getDuelHostArena = (id,cursors={}) => rpc('get_cli_duel_host_arena_updates',{p_competition_id:id,p_cursors:cursors})
export const getDuelConfiguration = (labId,rematchId) => rpc('get_cli_duel_configuration',{p_lab_id:labId||null,p_rematch_id:rematchId||null})
export const getDuelAuthoring = (labId, rematchId) => rpc('get_cli_duel_authoring', {p_lab_id: rematchId ? null : labId, p_rematch_id: rematchId || null})
export const getDuelWorkspace = () => rpc('get_cli_duel_workspace')
export const getDuel = id => rpc('get_cli_duel', { p_competition_id: id })
export const getDuelPlayer = (id, client,after=0) => rpc('get_cli_duel_player_updates', { p_participant_id: id, p_client_id: client,p_after_sequence:after })
export const readyDuel = (id, client, ready) => rpc('ready_cli_duel', { p_competition_id: id, p_client_id: client, p_ready: ready })
export const setDuelArenaPresence = (id,client,entered) => rpc('set_cli_duel_arena_presence',{p_participant_id:id,p_client_id:client,p_entered:entered})
export const startDuel = id => rpc('start_cli_duel', { p_competition_id: id })
export const settleDuel = id => rpc('settle_cli_duel', { p_competition_id: id })
export const finishDuel = (id, client) => rpc('finish_cli_duel', { p_participant_id: id, p_client_id: client })
export const manageDuel = (id, action, reason) => rpc('manage_cli_duel', { p_competition_id: id, p_action: action, p_reason: reason })
export const releaseDuelReview = (id, allow) => rpc('set_cli_duel_review', { p_competition_id: id, p_allow: allow })
export const getDuelReview = id => rpc('get_cli_duel_review', { p_participant_id: id })
export async function sendDuelAction(body) {
  const { data, error } = await supabase.functions.invoke('cli-duel', { body })
  if (error) {
    const status = error.context?.status
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* Network errors have no response. */ }
    throw Object.assign(new Error(typeof message === 'string' ? message : 'CLI Duel is unavailable. Please retry.'), { status })
  }
  return data
}
const subscriptions = new Map()
export function subscribeDuel(id, refresh) {
  const existing = subscriptions.get(id)
  if (existing) {
    existing.listeners.add(refresh)
    return () => removeListener(id, refresh)
  }
  const listeners = new Set([refresh])
  const notifier=createDuelNotifier(()=>listeners.forEach(listener=>listener()))
  const channel = supabase.channel(`cli-duel:${id}`, { config: { private: true } })
    .on('broadcast', { event: 'changed' }, notifier.changed).subscribe()
  subscriptions.set(id, { channel, listeners,notifier })
  return () => removeListener(id, refresh)
}
function removeListener(id, listener) {
  const subscription = subscriptions.get(id)
  if (!subscription) return
  subscription.listeners.delete(listener)
  if (!subscription.listeners.size) { subscription.notifier.stop();subscriptions.delete(id); void supabase.removeChannel(subscription.channel) }
}
export function duelError(error) {
  if (['PGRST202', '42883', '42P01'].includes(error?.code)) return 'CLI Duels are not set up on this database. Apply the local duel migrations and start the local cli-duel function first.'
  return error?.message || 'CLI Duel is unavailable. Please retry.'
}
