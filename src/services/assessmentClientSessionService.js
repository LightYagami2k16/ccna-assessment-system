import { supabase } from '../lib/supabase'

const DEVICE_KEY = 'ccna-assessment-device-id'
const TAB_KEY = 'ccna-assessment-tab-id'
let fallbackDeviceId = null
let fallbackTabId = null

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function storedId(storage, key, fallbackName) {
  try {
    const existing = storage.getItem(key)
    if (existing) return existing

    const created = createId()
    storage.setItem(key, created)
    return created
  } catch {
    if (fallbackName === 'device') {
      fallbackDeviceId ??= createId()
      return fallbackDeviceId
    }

    fallbackTabId ??= createId()
    return fallbackTabId
  }
}

export function getAssessmentClientId() {
  const deviceId = storedId(localStorage, DEVICE_KEY, 'device')
  const tabId = storedId(sessionStorage, TAB_KEY, 'tab')
  return `device:${deviceId}:tab:${tabId}`
}

export async function claimAssessmentClientSession({
  assessmentType,
  attemptId,
  clientId,
}) {
  const { data, error } = await supabase.rpc(
    'claim_assessment_client_session',
    {
      p_assessment_type: assessmentType,
      p_attempt_id: attemptId,
      p_client_id: clientId,
      p_client_label: 'Browser session',
    },
  )
  if (error) throw error
  return data
}

export async function heartbeatAssessmentClientSession({
  assessmentType,
  attemptId,
  clientId,
}) {
  const { data, error } = await supabase.rpc(
    'heartbeat_assessment_client_session',
    {
      p_assessment_type: assessmentType,
      p_attempt_id: attemptId,
      p_client_id: clientId,
    },
  )
  if (error) throw error
  return data
}

export async function releaseAssessmentClientSession({
  assessmentType,
  attemptId,
  clientId,
}) {
  const { data, error } = await supabase.rpc(
    'release_assessment_client_session',
    {
      p_assessment_type: assessmentType,
      p_attempt_id: attemptId,
      p_client_id: clientId,
    },
  )
  if (error) throw error
  return data
}
