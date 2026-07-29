-- Phase 7.4 / Phase 10: administrator-triggered password recovery.
-- Expands the administrator security audit event types so every
-- password-recovery email requested by an administrator is recorded.

alter table public.admin_account_events
drop constraint if exists admin_account_events_event_type_check;

alter table public.admin_account_events
add constraint admin_account_events_event_type_check
check (
  event_type in (
    'invite_sent',
    'password_reset_sent',
    'account_suspended',
    'account_reactivated',
    'account_deleted'
  )
);

select
  constraint_name,
  check_clause
from information_schema.check_constraints
where constraint_name =
  'admin_account_events_event_type_check';
