-- Every conversion of fee SOL into $PUMP, indexed from the chain.
--
-- The operator supplies a signature and nothing else. Every column below is
-- read out of that transaction's own pre/post token balances by
-- `scripts/record-hoard-purchase.ts`, so a row cannot say a purchase was larger
-- than it was: the signature is in the row and anyone can fetch the same
-- transaction and get the same numbers.
--
-- This table is an index, not a source. `/verify` prints the signature beside
-- every figure precisely so that the reader can go past it.

create table hoard_purchases (
  signature      text        primary key,
  cluster        text        not null,
  -- The vault the SOL left and the $PUMP arrived in.
  vault          text        not null,
  -- Negative deltas are refused by the recorder: a purchase spends quote and
  -- receives hoard, and a row with the signs reversed is a different event.
  sol_spent      numeric(20,0) not null check (sol_spent > 0),
  pump_received  numeric(20,0) not null check (pump_received > 0),
  slot           bigint      not null,
  block_time     timestamptz,
  recorded_at    timestamptz not null default now()
);

create index hoard_purchases_recent_idx on hoard_purchases (cluster, slot desc);
