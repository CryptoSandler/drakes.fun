-- Every run of the pump.fun fee-schedule check, so a page can say whether the
-- rate it prints was confirmed and when.
--
-- The site cannot read the chain for this on every render: the check is a
-- program-account scan and the page is a request. So the job records what it
-- saw and `/verify` renders that row WITH ITS DATE, marking the figure stale
-- rather than continuing to assert it.
--
-- `agrees = false` is not an error state to clear. It means pump.fun changed a
-- config in their program and our copy has not caught up yet, which is exactly
-- what a reader should be told.

create table schedule_checks (
  id             bigserial primary key,
  cluster        text        not null,
  -- The account the numbers were read from, so the row can be re-derived.
  source_account text        not null,
  slot           bigint      not null,
  lp_fee_bps     integer     not null,
  protocol_fee_bps integer   not null,
  creator_fee_bps  integer   not null,
  tiered         boolean     not null,
  -- What the repository had recorded at the time of the check.
  recorded_creator_fee_bps integer not null,
  agrees         boolean     not null,
  differences    text        not null default '',
  ran_at         timestamptz not null default now()
);

create index schedule_checks_recent_idx on schedule_checks (cluster, ran_at desc);
