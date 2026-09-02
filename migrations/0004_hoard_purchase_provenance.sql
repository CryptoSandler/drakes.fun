-- Where the SOL a conversion spent came from.
--
-- Every other column in `hoard_purchases` is read out of the transaction the
-- row names. This one cannot be: SOL in the vault is fungible, so once a
-- conversion has happened there is no on-chain way to tell fee SOL from SOL
-- somebody put there. It is therefore the only asserted column in the table,
-- and `/verify` says so beside it rather than letting it sit among the derived
-- figures as if it were one of them.
--
-- 'fees'    the vault spent SOL that reached it by claiming pool fees
-- 'creator' the vault spent SOL the creator put there
--
-- The default is 'fees' because that is what every conversion after the first
-- one is; a row that is not is written deliberately.

alter table hoard_purchases
  add column funded_by text not null default 'fees'
    check (funded_by in ('fees', 'creator'));
