-- Migration: enable row level security for invoices
-- Admins can manage all invoices. Campers can only view their own invoices.

-- Required helper functions
create or replace function public.current_user_email()
returns text
language sql stable
as $$
  select auth.jwt() ->> 'email';
$$;

create or replace function public.current_camper_id()
returns uuid
language sql stable
as $$
  select id
  from campers
  where email = public.current_user_email()
  limit 1;
$$;

create or replace function public.is_admin_user()
returns boolean
language sql stable
as $$
  select exists(
    select 1
    from campers
    where email = public.current_user_email()
      and role = 'admin'
  );
$$;

-- Required indexes for policies
create index if not exists invoices_camper_id_idx on invoices (camper_id);
create index if not exists campers_email_idx on campers (email);

-- Enable and enforce RLS on invoices
alter table invoices enable row level security;
alter table invoices force row level security;

-- Admin policy: full access for admin users
create policy invoices_admin_full_access
  on invoices
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

-- Camper policy: select only own invoices
create policy invoices_camper_view_own
  on invoices
  for select
  using (camper_id = public.current_camper_id());
