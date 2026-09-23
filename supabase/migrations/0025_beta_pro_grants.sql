-- =============================================================================
-- Migration: 0025_beta_pro_grants
-- Description: Lets a curator comp specific people to Pro tier -- beta
--              testers, friends/family -- without touching Supabase by hand,
--              and before that person has even signed up.
--
-- Changes:
--   1. beta_pro_grants table -- one row per comped email. Keyed by email
--      (not user_id) because a pre-signup person has no auth.users row yet.
--      granted_by/note are an audit trail; claimed_at/claimed_by record when
--      and by whom the grant was actually activated (both null while a grant
--      is still pending a signup).
--   2. RLS -- curators (the discover_curators allowlist already used to gate
--      the Discover admin UI, reused here as the general "admin" concept
--      rather than standing up a second one) can read/insert/delete grants
--      directly; only service_role can mark one claimed.
--   3. find_user_id_by_email() -- service_role-only helper the admin edge
--      function uses to check whether a grant's email already has an account
--      (so a grant to an existing user activates immediately instead of
--      waiting on a signup that will never come).
--   4. handle_new_user() -- extended to check beta_pro_grants for the new
--      user's email (case-insensitive) right after provisioning the free
--      tier row, and activate Pro + mark the grant claimed on a match.
--      Skipped for guest/anonymous signups, which have no email.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. beta_pro_grants
-- ---------------------------------------------------------------------------
create table public.beta_pro_grants (
  email        text primary key,
  granted_by   uuid references auth.users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),

  -- Set once the email signs up and is actually activated; null = still pending.
  claimed_at   timestamptz,
  claimed_by   uuid references auth.users(id) on delete set null,

  constraint chk_beta_pro_grants_email_lower check (email = lower(email))
);

comment on table public.beta_pro_grants is
  'Emails comped to Pro tier (e.g. beta testers), checked by handle_new_user() at signup '
  'time and by the admin-beta-grant edge function for an email that already has an account. '
  'claimed_at/claimed_by record activation; both null means still waiting on a signup.';

-- ---------------------------------------------------------------------------
-- 2. RLS -- curators only, reusing discover_curators as the admin allowlist
-- ---------------------------------------------------------------------------
alter table public.beta_pro_grants enable row level security;

create policy "Curators can read beta pro grants"
  on public.beta_pro_grants for select
  using (exists (select 1 from public.discover_curators where user_id = auth.uid()));

create policy "Curators can add beta pro grants"
  on public.beta_pro_grants for insert
  with check (exists (select 1 from public.discover_curators where user_id = auth.uid()));

create policy "Curators can remove beta pro grants"
  on public.beta_pro_grants for delete
  using (exists (select 1 from public.discover_curators where user_id = auth.uid()));

create policy "Service role has full access to beta pro grants"
  on public.beta_pro_grants for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. find_user_id_by_email -- service_role only (queries auth.users, which
--    clients can never select directly).
-- ---------------------------------------------------------------------------
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.find_user_id_by_email from public, anon, authenticated;
grant  execute on function public.find_user_id_by_email to service_role;

comment on function public.find_user_id_by_email is
  'Looks up an existing account by email (case-insensitive). service_role only -- '
  'used by the admin-beta-grant edge function to activate a grant immediately when '
  'the person already has an account instead of waiting on a signup.';

-- ---------------------------------------------------------------------------
-- 4. handle_new_user() -- check for a pending grant on every new signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  perform public.provision_free_tier(new.id);

  -- Guests (anonymous Supabase sessions) sign up with no email -- nothing to match.
  if new.email is not null then
    v_email := lower(new.email);

    if exists (
      select 1 from public.beta_pro_grants
      where email = v_email and claimed_at is null
    ) then
      update public.user_subscriptions
      set plan_id = 'pro', status = 'active'
      where user_id = new.id and archived_at is null;

      update public.beta_pro_grants
      set claimed_at = now(), claimed_by = new.id
      where email = v_email and claimed_at is null;
    end if;
  end if;

  return new;
end;
$$;
