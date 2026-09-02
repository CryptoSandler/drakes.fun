# The token badge request — drafted, not sent

**Status: NOT SENT.** This is a draft for the owner to send under `CryptoSandler`.
Nothing in this repository has contacted Meteora.

Sending it is not urgent: D26 moved the pair to `$DRAKES`/wSOL and the project
ships without a badge. This exists because a badge would remove the conversion
step in `DESIGN.md` §3.6 entirely, and because the answer — even a "no" — is
worth having on the record before mainnet.

---

## What we are asking for

A **token badge** for `$PUMP` (`pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`) on
DAMM v2, so that a `TOKEN`/`$PUMP` pool can be created.

## Why it is needed, stated so they can check it in a minute

DAMM v2's `initialize_pool` requires a token badge PDA for a Token-2022 mint
carrying a `transferHook` extension — **even when the hook's `programId` is
null**, which is `$PUMP`'s state today. `$PUMP` has no badge
(`J6ZTErt5Lg9wT5P9o7GDnSN9eQnbQ52gAbGqTJmMMey` does not exist), and there are
consequently **zero DAMM v2 pools holding `$PUMP`** on mainnet.

Everything above is checkable without trusting us, and the request should say so
rather than describing it.

## Where to send it

Meteora does not publish a form for this. In order of likelihood:

1. **Meteora Discord**, the developer/integrations channel. This is where
   integrators get routed and where an operator is most likely to read it. It is
   also the channel where a badge request has to be *asked for by a person*,
   which is why this file exists as a draft rather than as a script.
2. **`github.com/MeteoraAg/damm-v2`** — an issue. Slower, but it leaves a public
   record of the ask and of the answer, which is worth more to this project than
   speed.
3. Their docs site lists a support address; use it only if the first two go
   unanswered.

**Use the project's identity, never a personal account** (CLAUDE.md, the
no-doxx guard). If the chosen channel requires an account, it is a project
account or the request waits.

## What they will probably ask for

Prepare these before sending, because being asked and then going quiet reads
worse than not asking:

- **The mint.** `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`, Token-2022,
  6 decimals, extensions `transferHook`, `metadataPointer`, `tokenMetadata`.
- **The hook's state.** `programId: null`, authority
  `DMdBa812dBW1CHVhmTyUyVcrBnSbZbfoFC7U14k4riH1` — live, and not ours.
- **Who is asking and what for.** A collection paired against `$PUMP`, one pool,
  a permanently locked position, fees claimed by a Squads 2-of-3.
- **Which config.** The public static config index 15
  (`HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`), 2% base fee,
  `collect_fee_mode = 1`.

## The draft

> **Subject: token badge for $PUMP on DAMM v2**
>
> Hi — we are building a collection whose trading fee accrues into a hoard, and
> we would like the pool to be quoted in `$PUMP`
> (`pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`).
>
> `initialize_pool` refuses the pair: `$PUMP` is Token-2022 with a
> `transferHook` extension, and DAMM v2 wants a token badge for it. The
> extension is present but **the hook's `programId` is null**, so no hook program
> executes on a transfer today. The badge PDA
> (`J6ZTErt5Lg9wT5P9o7GDnSN9eQnbQ52gAbGqTJmMMey`) does not exist, and there are
> zero DAMM v2 pools holding `$PUMP` on mainnet — we checked both against
> `getProgramAccounts` at the token-A and token-B offsets, with wSOL and USDC as
> controls.
>
> Two questions:
>
> 1. **Would you issue a badge for `$PUMP`?** We would use the public static
>    config index 15 (`HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`), one pool,
>    a permanently locked position, fees claimed by a 2-of-3 multisig.
> 2. **If the hook's authority ever sets a `programId`, what happens to an
>    existing pool?** We would rather know before launching than after. If the
>    answer is "swaps stop", we would like to say that on our site rather than
>    discover it.
>
> We have shipped without it — the pool is quoted in SOL and the hoard is bought
> on a published schedule — so this is not blocking. It would simply be a better
> design if `$PUMP` could be the quote asset directly.
>
> Happy to provide anything else useful.

## The second question is the one that matters more

Even if the badge never arrives, **"what happens to an existing pool when a
transfer hook is installed on one of its mints"** is the answer this project
needs, because it is `DESIGN.md` T1 restated as a question to the only people
who can answer it authoritatively. If they say swaps halt, that is a sentence
the site has to carry whichever pair we end up on — a hook on `$PUMP` would
strand a `$PUMP` hoard just as surely as it would strand a `$PUMP` pool.
