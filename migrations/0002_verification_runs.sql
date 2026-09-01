-- The published record of a full replay.
--
-- One row per run of `scripts/verify-full.ts`, which walks the program's whole
-- signature history, rebuilds the survivor permutation from the revealed values
-- and compares it against the piece ids the program emitted.
--
-- This table is a RECORD OF A JOB WE RAN, and the site labels it as one. It is
-- not evidence about the chain; the chain is the evidence, and the same replay
-- runs from a clone with no dependency on anything here. The row exists because
-- a full replay takes minutes and a page cannot wait for it.

create table verification_runs (
  id           bigint generated always as identity primary key,
  program      text        not null,
  config       text,
  cluster      text        not null,
  -- The verdict, and the counts it was reached from.
  ok           boolean     not null,
  settled      integer     not null,
  minted       integer     not null,
  distinct_pieces integer  not null,
  agreed       integer     not null,
  remaining    integer     not null,
  collection_size integer  not null,
  -- Non-empty means the two implementations disagreed, which is the finding the
  -- whole exercise exists to surface. Kept verbatim rather than summarised.
  disagreements jsonb      not null default '[]'::jsonb,
  -- The last signature the walk saw, so a reader can tell how current a row is
  -- without trusting the timestamp alone.
  last_signature text,
  took_ms      integer     not null,
  ran_at       timestamptz not null default now()
);

create index verification_runs_recent_idx on verification_runs (program, ran_at desc);
