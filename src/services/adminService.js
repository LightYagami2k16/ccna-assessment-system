import { supabase } from '../lib/supabase'

async function throwFunctionError(error, fallbackMessage) {
  const response = error?.context

  if (response && typeof response.json === 'function') {
    let payload = null

    try {
      payload = await response.json()
    } catch {
      // Use the normal function error when the response has no JSON body.
    }

    if (payload?.error || payload?.message) {
      throw new Error(payload.error || payload.message)
    }
  }

  throw new Error(error?.message || fallbackMessage)
}

export async function getUserAccounts() {
  const { data, error } = await supabase.rpc('list_user_accounts')

  if (error) throw error

  return (data ?? []).map((account) => ({
    id: account.user_id,
    email: account.email,
    fullName: account.full_name,
    role: account.role,
    emailConfirmed: account.email_confirmed,
    isSuspended: account.is_suspended,
    createdAt: account.created_at,
    lastSignInAt: account.last_sign_in_at,
  }))
}

export async function inviteUserAccount({
  email,
  fullName,
  role,
}) {
  const { data, error } = await supabase.functions.invoke(
    'admin-user-security',
    {
      body: {
        action: 'invite',
        email,
        fullName,
        role,
      },
    },
  )

  if (error) {
    await throwFunctionError(
      error,
      'Unable to send the account invitation.',
    )
  }
  if (data?.error) throw new Error(data.error)

  return data
}

export async function setUserSuspension({
  userId,
  suspended,
}) {
  const { data, error } = await supabase.functions.invoke(
    'admin-user-security',
    {
      body: {
        action: suspended ? 'suspend' : 'reactivate',
        userId,
      },
    },
  )

  if (error) {
    await throwFunctionError(
      error,
      suspended
        ? 'Unable to suspend the account.'
        : 'Unable to reactivate the account.',
    )
  }
  if (data?.error) throw new Error(data.error)

  return data
}

export async function sendUserPasswordReset(userId) {
  const { data, error } = await supabase.functions.invoke(
    'admin-user-security',
    {
      body: {
        action: 'send_password_reset',
        userId,
      },
    },
  )

  if (error) {
    await throwFunctionError(
      error,
      'Unable to send password reset instructions.',
    )
  }
  if (data?.error) throw new Error(data.error)

  return data
}

export async function deleteUserAccount(userId) {
  const { data, error } = await supabase.functions.invoke(
    'admin-user-security',
    {
      body: {
        action: 'delete',
        userId,
      },
    },
  )

  if (error) {
    await throwFunctionError(
      error,
      'Unable to delete the account.',
    )
  }
  if (data?.error) throw new Error(data.error)

  return data
}

export async function getAdminAuditEvents() {
  const { data, error } = await supabase.rpc(
    'list_admin_audit_events',
    {
      p_limit: 200,
    },
  )

  if (error) throw error

  return (data ?? []).map((event) => ({
    id: event.event_id,
    type: event.event_type,
    targetUserId: event.target_user_id,
    targetName: event.target_name,
    targetEmail: event.target_email,
    actorName: event.actor_name,
    actorEmail: event.actor_email,
    details: event.details ?? {},
    occurredAt: event.occurred_at,
  }))
}

export async function setUserAccountRole({
  userId,
  role,
}) {
  const { data, error } = await supabase.rpc(
    'set_user_account_role',
    {
      p_target_user_id: userId,
      p_new_role: role,
    },
  )

  if (error) throw error

  return data
}
