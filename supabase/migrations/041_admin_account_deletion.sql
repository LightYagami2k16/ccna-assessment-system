-- Phase 7.3:
-- permanent administrator-controlled account deletion audit support.

-- =========================================================
-- 1. ALLOW DELETION EVENTS IN THE SECURITY AUDIT
-- =========================================================

alter table public.admin_account_events
drop constraint if exists admin_account_events_event_type_check;

alter table public.admin_account_events
add constraint admin_account_events_event_type_check
check (
  event_type in (
    'invite_sent',
    'account_suspended',
    'account_reactivated',
    'account_deleted'
  )
);

-- =========================================================
-- 2. VERIFICATION
-- =========================================================

select
  constraint_name,
  check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and constraint_name = 'admin_account_events_event_type_check';
