-- The event cache the site reads nothing from.
--
-- Every row here is a copy of an `IssuanceSettled` event that is already on
-- chain. It exists so a page can be listed and paged without 8,000 RPC calls;
-- it is never the authority for anything, and the page's headline numbers are
-- read from the chain directly.
--
-- `hour` is the primary key because the program seeds the issuance account with
-- it, so one hour settles at most once. Two rows for one hour is not a
-- concurrency problem to resolve, it is a sign that events from two different
-- configs were indexed into one table.

create table issuance_events (
  hour             bigint        primary key,
  config           text          not null,
  piece_index      integer       not null,
  minted           boolean       not null,
  -- 65535 when nothing was minted.
  piece_id         integer       not null,
  snapshot_slot    bigint        not null,
  root             bytea         not null,
  -- The randomness ACCOUNT, base58.
  randomness       text          not null,
  -- The 32 revealed bytes. A lost snapshot artifact is rebuilt from this.
  randomness_value bytea         not null,
  reveal_slot      bigint        not null,
  -- u64 does not fit in a signed bigint at the top of its range, and these
  -- three carry token amounts scaled by the mint's decimals.
  eligible_supply  numeric(20,0) not null,
  point            numeric(20,0) not null,
  balance          numeric(20,0) not null,
  recipient        text          not null,
  signature        text          not null unique,
  tx_slot          bigint        not null,
  indexed_at       timestamptz   not null default now()
);

create index issuance_events_recipient_idx on issuance_events (recipient, hour desc);
create index issuance_events_piece_idx     on issuance_events (piece_id) where minted;

-- Where the indexer stopped, so a run reads forward instead of replaying
-- history. One row per (program, config) pair the indexer follows.
create table indexer_cursor (
  stream         text        primary key,
  last_signature text        not null,
  last_hour      bigint      not null,
  updated_at     timestamptz not null default now()
);
