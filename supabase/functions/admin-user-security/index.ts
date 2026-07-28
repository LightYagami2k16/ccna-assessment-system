import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authorization = request.headers.get('Authorization')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { error: 'The server function is not configured.' },
        500,
      )
    }

    if (!authorization) {
      return jsonResponse({ error: 'Authentication is required.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Your session is not valid.' }, 401)
    }

    const { data: actorProfile, error: roleError } =
      await serviceClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (
      roleError ||
      !actorProfile ||
      actorProfile.role !== 'admin'
    ) {
      return jsonResponse(
        { error: 'Administrator access is required.' },
        403,
      )
    }

    const body = await request.json()
    const action = String(body?.action ?? '').trim().toLowerCase()

    if (action === 'invite') {
      const email = String(body?.email ?? '').trim().toLowerCase()
      const fullName = String(body?.fullName ?? '').trim()
      const configuredSiteUrl = String(
        Deno.env.get('PUBLIC_SITE_URL') ?? '',
      ).trim()
      const requestedRole = String(body?.role ?? 'student')
        .trim()
        .toLowerCase()
      const storedRole =
        requestedRole === 'administrator' ? 'admin' : requestedRole

      if (!email || !email.includes('@')) {
        return jsonResponse(
          { error: 'Enter a valid email address.' },
          400,
        )
      }

      if (!['student', 'instructor', 'admin'].includes(storedRole)) {
        return jsonResponse(
          { error: 'The selected account role is not valid.' },
          400,
        )
      }

      const invitationOptions: {
        data: Record<string, unknown>
        redirectTo?: string
      } = {
        data: {
          full_name: fullName,
          invitation_pending: true,
          password_initialized: false,
        },
      }

      if (configuredSiteUrl) {
        invitationOptions.redirectTo =
          `${configuredSiteUrl.replace(/\/+$/, '')}/`
      }

      const { data: invited, error: inviteError } =
        await serviceClient.auth.admin.inviteUserByEmail(
          email,
          invitationOptions,
        )

      if (inviteError) {
        return jsonResponse({ error: inviteError.message }, 400)
      }

      if (!invited.user) {
        return jsonResponse(
          { error: 'The invitation did not create an account.' },
          500,
        )
      }

      const { error: profileError } = await serviceClient
        .from('profiles')
        .update({
          full_name: fullName,
          role: storedRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invited.user.id)

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 500)
      }

      await serviceClient.from('admin_account_events').insert({
        event_type: 'invite_sent',
        target_user_id: invited.user.id,
        target_email: email,
        performed_by: user.id,
        details: {
          fullName,
          role:
            storedRole === 'admin' ? 'administrator' : storedRole,
        },
      })

      return jsonResponse({
        success: true,
        message: `Invitation sent to ${email}.`,
      })
    }

    if (action === 'suspend' || action === 'reactivate') {
      const targetUserId = String(body?.userId ?? '').trim()

      if (!targetUserId) {
        return jsonResponse(
          { error: 'Select a valid user account.' },
          400,
        )
      }

      if (targetUserId === user.id) {
        return jsonResponse(
          { error: 'You cannot suspend your own account.' },
          400,
        )
      }

      const { data: targetResult, error: targetError } =
        await serviceClient.auth.admin.getUserById(targetUserId)

      if (targetError || !targetResult.user) {
        return jsonResponse(
          { error: targetError?.message ?? 'User not found.' },
          404,
        )
      }

      const isSuspending = action === 'suspend'
      const { error: updateError } =
        await serviceClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: isSuspending ? '876000h' : 'none',
        })

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400)
      }

      await serviceClient.from('admin_account_events').insert({
        event_type: isSuspending
          ? 'account_suspended'
          : 'account_reactivated',
        target_user_id: targetUserId,
        target_email: targetResult.user.email ?? '',
        performed_by: user.id,
        details: {},
      })

      return jsonResponse({
        success: true,
        message: isSuspending
          ? `${targetResult.user.email} was suspended.`
          : `${targetResult.user.email} was reactivated.`,
      })
    }

    if (action === 'delete') {
      const targetUserId = String(body?.userId ?? '').trim()

      if (!targetUserId) {
        return jsonResponse(
          { error: 'Select a valid user account.' },
          400,
        )
      }

      if (targetUserId === user.id) {
        return jsonResponse(
          { error: 'You cannot delete your own account.' },
          400,
        )
      }

      const { data: targetResult, error: targetError } =
        await serviceClient.auth.admin.getUserById(targetUserId)

      if (targetError || !targetResult.user) {
        return jsonResponse(
          { error: targetError?.message ?? 'User not found.' },
          404,
        )
      }

      const { data: targetProfile, error: profileError } =
        await serviceClient
          .from('profiles')
          .select('full_name, role')
          .eq('id', targetUserId)
          .single()

      if (profileError || !targetProfile) {
        return jsonResponse(
          { error: profileError?.message ?? 'User profile not found.' },
          404,
        )
      }

      if (targetProfile.role === 'admin') {
        const { count: administratorCount, error: countError } =
          await serviceClient
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'admin')

        if (countError) {
          return jsonResponse({ error: countError.message }, 500)
        }

        if ((administratorCount ?? 0) <= 1) {
          return jsonResponse(
            {
              error:
                'The last administrator account cannot be deleted.',
            },
            400,
          )
        }
      }

      const targetEmail = targetResult.user.email ?? ''
      const displayedRole =
        targetProfile.role === 'admin'
          ? 'administrator'
          : targetProfile.role
      const { data: auditEvent, error: auditError } =
        await serviceClient
          .from('admin_account_events')
          .insert({
            event_type: 'account_deleted',
            target_user_id: targetUserId,
            target_email: targetEmail,
            performed_by: user.id,
            details: {
              fullName: targetProfile.full_name,
              role: displayedRole,
            },
          })
          .select('id')
          .single()

      if (auditError || !auditEvent) {
        return jsonResponse(
          {
            error:
              auditError?.message ??
              'Unable to create the deletion audit record.',
          },
          500,
        )
      }

      const { error: deleteError } =
        await serviceClient.auth.admin.deleteUser(targetUserId)

      if (deleteError) {
        await serviceClient
          .from('admin_account_events')
          .delete()
          .eq('id', auditEvent.id)

        const ownsProtectedContent =
          deleteError.message
            .toLowerCase()
            .includes('foreign key') ||
          deleteError.message
            .toLowerCase()
            .includes('violates')

        return jsonResponse(
          {
            error: ownsProtectedContent
              ? 'This account owns questions or quizzes that must be deleted or reassigned before the account can be removed.'
              : deleteError.message,
          },
          400,
        )
      }

      return jsonResponse({
        success: true,
        message: `${targetEmail} was permanently deleted.`,
      })
    }

    return jsonResponse({ error: 'Unknown administrator action.' }, 400)
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error.',
      },
      500,
    )
  }
})
