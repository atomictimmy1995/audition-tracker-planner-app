-- Per-user daily rate limit for model-backed AI calls (cost guardrail).
--
-- Users can never write this table directly (no RLS policy grants it); the only
-- way the count moves is through check_and_bump_ai_usage(), a SECURITY DEFINER
-- function that atomically checks the limit and increments. So a signed-in user
-- cannot reset or under-report their own usage.

create table ai_usage (
  user_id uuid not null references profiles (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

-- Read-only visibility of your own usage (handy for a future "X left today" UI).
-- No insert/update/delete policy exists, so direct writes are denied for everyone
-- but the SECURITY DEFINER function below.
create policy "read own ai usage" on ai_usage
  for select using (auth.uid() = user_id);

/**
 * Atomically enforce a per-user, per-UTC-day cap on model calls.
 * Returns (allowed, used): allowed=false means the caller is at/over the limit
 * and no increment happened; allowed=true means this call was counted.
 */
create function check_and_bump_ai_usage(p_limit int)
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_day   date := (now() at time zone 'utc')::date;
  v_count int;
begin
  if v_user is null then
    return query select false, 0;
    return;
  end if;

  insert into ai_usage (user_id, day, count) values (v_user, v_day, 0)
    on conflict (user_id, day) do nothing;

  select count into v_count from ai_usage
    where user_id = v_user and day = v_day
    for update;

  if v_count >= p_limit then
    return query select false, v_count;
  else
    update ai_usage set count = count + 1
      where user_id = v_user and day = v_day;
    return query select true, v_count + 1;
  end if;
end;
$$;

-- Callable by signed-in users (via the edge function's user-scoped client).
revoke all on function check_and_bump_ai_usage(int) from public;
grant execute on function check_and_bump_ai_usage(int) to authenticated;
