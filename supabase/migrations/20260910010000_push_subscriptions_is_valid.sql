-- ㊶-① push_subscriptions 410 Gone 정리 인프라
-- 죽은 구독(브라우저가 지운 endpoint)을 무효화해서 이후 발송에서 제외
-- ARCHITECTURE.md 430·435행이 명시한 is_valid 컬럼이 실제로는 없었음
alter table public.push_subscriptions
  add column is_valid boolean not null default true;

create index push_subscriptions_user_valid_idx
  on public.push_subscriptions(user_id)
  where is_valid;
