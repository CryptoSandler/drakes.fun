# References

Every claim in the spec that came from outside this repository is recorded here
with where it came from and when it was read. A number without a date is a
number nobody can re-check, and this project's whole pitch is that its numbers
are re-checkable.

**Nothing in this file is a licence to copy.** The reference project's art,
copy, character, name and wordmark are theirs. What is being studied is the
mechanism, which is an idea, and the study exists so that our version can differ
deliberately rather than accidentally.

---

## Quantums — quantums.art

- Read: **2026-09-01**, live scrape of `https://quantums.art/` and
  `https://quantums.art/whitepaper` (the "Protocol Paper").
- Chain: **Robinhood Chain** (Arbitrum-based L2), not Ethereum L1 and not Solana.
- Published contracts, all verified on `robinhoodchain.blockscout.com`:
  - `$QUANT` token — `0x29fFC36bcC7D857f325B435533041C3DD9Fa26e5`
  - Quantums NFT — `0x02BEC3ebb93ed971309F3382079840191f68743a`
  - Reserve — `0xD04C2564eBDb9a8bB6d5F3276f041cF0e326A4C0`
- OpenSea collection: `opensea.io/collection/quantumshq`.
- `quantums.art/audit.pdf` is linked from the site's sitemap and returns the
  SPA's **404 page**. As of 2026-09-01 there is no published audit at that URL.

### Age of the project — read this before treating it as proven

The site's own counter read **28 issued of 4,000, 4 burned** on 2026-09-01, and
one draw fires per hour. That places the first draw roughly **28 hours** before
the reading. OpenSea's token page for `$QUANT` was labelled "9 hours ago".

**Quantums is days old.** It has no track record, no completed collection, no
observed reserve through a drawdown, and no audit. Copying it is copying a
hypothesis, not a result. Its own "Recent draws" and "Recent burns" panels
rendered "No draw events found." / "No claim events found." at the time of
reading, which means its public event feed was not resolving either.

### Mechanism, as its paper states it

Quoted or closely paraphrased from the Protocol Paper, 2026-09-01.

**Bootstrap — the answer to "who holds the first one".** Nobody needs to. The
draw is **not** weighted by NFT holdings. It is weighted by holdings of a
**fungible ERC-20, `$QUANT`**: "You hold a token, and once an hour the protocol
picks one holder and issues them a piece." Total token supply is fixed at
deploy, "no team allocation, no presale, no reserved wallet, and no vesting
schedule", the entire supply is placed as liquidity at launch, and "the LP
position is burned, not locked".

**The fee.** A Uniswap v4 hook takes **2% of every buy and 2% of every sell**,
"taken in SPY rather than in $QUANT, so the reserve accumulates the backing
asset directly and never has to sell the token to fund itself". The rate is a
compile-time constant with no setter.

**Eligible supply.** The PoolManager, zero/burn addresses, the reserve, hook and
NFT contracts, Permit2 and the Universal Router are excluded from both the draw
and the denominator, as immutable constructor arguments.

**The draw.** Hourly, on the hour, scheduled from the scheduled time so it
cannot drift. Two transactions: `requestDraw()` freezes balances and records the
request block; `settleDraw()` runs at least 2 blocks later and seeds from
`blockhash(requestBlock + 2)`. Both calls permissionless; the settler is paid a
capped bounty from the reserve. Balances live in a **Fenwick tree inside the
token contract**, updated on every transfer, so winner lookup is logarithmic.
Zero eligible supply means no mint and no index advance.

**Randomness.** `seed = keccak256(blockhash(requestBlock + 2), previousSeed,
drawIndex)`. Their paper states plainly that Chainlink VRF is not deployed on
their chain, that the sequencer operator "could in principle bias a draw", and
declines to call it provably fair.

**Tiers.** Common 2,500 / Rare 1,000 / Epic 400 / Gold 80 / Green 20. Plus pupil
shape, accessory, background, surface finish; ten one-of-ones at fixed draw
indices. **Rarity is cosmetic** — "A Green Quantum redeems for exactly the same
share of the reserve as a Gray one", because "weighting redemption by rarity
would turn the reserve into a claim that some holders could raid faster than
others".

**The reserve.** Holds tokenized SPY. Three outward paths only, each callable by
one immutable address: claim payouts (NFT contract), buyback funding (hook), and
the draw bounty (capped at 1/10,000 of the reserve). No withdraw, no sweep, no
rescue, no owner. Their paper notes ETF dividends are paid off-chain to eligible
Robinhood accounts and "a smart contract is not an eligible holder".

**Claiming.** `share = reserve * 90% / liveSupply`; `payout = min(share, reserve
* 5%)`. Ten percent of every claim stays behind, so "backing per remaining
Quantum rises on every single exit". The 5% cap binds only while fewer than
twenty pieces are live. Burns are permanent; a burned id is never reissued; the
4,000 counter tracks draws, not live pieces. No cooldown.

**Phases, hardcoded and automatic.** Minting (under 4,000 issued): 2% to
reserve. Mature (4,000 issued, pieces live): 1% reserve / 1% buyback. Empty (no
pieces live): 2% buyback. Buyback purchases `$QUANT` and sends it to the burn
address. **The draw does not stop at 4,000** — it keeps firing and emitting, it
simply stops minting.

**At 4,000.** The collection completes in 4,000 hours = 166 days 16 hours from
the first draw, a date known at launch. Token id equals draw index.

**Ownerlessness.** Ownership renounced in the deploy transaction. No admin
functions, no fee setter, no pause, no upgrade path, no proxy, no multisig, no
timelock. Their paper states the cost of this honestly: "Nothing can be changed,
which includes bugs. There is no pause, no upgrade, and no recovery."

### Observed state, 2026-09-01

| Reading | Value |
|---|---|
| Issued | 28 of 4,000 |
| Burned | 4 |
| Reserve | 110.09 SPY / $85,319.75 |
| Claimable per piece | 4.59 SPY |
| Fee phase | 0 (Minting), 2% trade fee, 5% claim cap |

Two things follow that their paper does not spell out and that matter to us:

1. **Early pieces are wildly over-backed.** ~$85k of reserve spread over ~24
   live pieces is roughly $3.5k of backing each, at hour 28. Filling the
   collection to 4,000 at that backing would need a $14M reserve, which at a 2%
   fee is **$700M of cumulative trading volume**. Backing per piece is therefore
   near-certain to fall steeply as the collection fills.
2. **14% of everything issued had already been burned within ~28 hours.** People
   are taking the money, which is what an over-backed early piece invites.

---

## Solana on-chain facts, all read 2026-09-01

### $PUMP — `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`

Read from Jupiter (`lite-api.jup.ag/tokens/v2/search`) and from
`getAccountInfo` on mainnet-beta.

| Field | Value |
|---|---|
| Token program | **Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| Decimals | 6 |
| Mint authority | **null** |
| Freeze authority | **null** |
| Extensions | `transferHook`, `metadataPointer`, `tokenMetadata` |
| `transferHook` | authority `DMdBa812dBW1CHVhmTyUyVcrBnSbZbfoFC7U14k4riH1`, **programId `null`** |
| No `transferFee`, no `permanentDelegate`, no `pausableConfig` | |
| Price | $0.004545 |
| Market cap / FDV | $1.80B / $3.80B |
| On-chain liquidity | **$37.75M** |
| 24h volume | **$31.9M** |
| Holders | 136,406 |
| Top holders | 67.6% |
| Jupiter organic score | 98.1 ("high"), verified |
| First pool | 2025-07-12 |

**The one live control vector**: `transferHook.programId` is null today, so no
hook runs — but the hook *authority* is live and can install a program that
executes on every PUMP transfer, at any time, without our consent. See the
custody section of the spec.

### SPYx (xStocks) — `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`

| Field | Value |
|---|---|
| Token program | Token-2022 |
| On-chain liquidity | **$1.83M** |
| Market cap | $73.4M |
| 24h buy volume | $1.34M |
| Mint authority | **live** (`7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj`) |
| Freeze authority | **live** (`JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs`) |
| `permanentDelegate` | **live** (`5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`) |
| `pausableConfig` | **live**, authority `JDq14BW...`, currently `paused: false` |
| Also | `defaultAccountState`, `scaledUiAmountConfig`, `confidentialTransferMint`, `transferHook` (authority live, programId null) |

**A `permanentDelegate` can move SPYx out of any account, including a vault
PDA, without the owner's signature.** A `pausableConfig` authority can halt all
transfers. A trustless burn-to-redeem vault denominated in SPYx is therefore not
trustless: the issuer can empty it or freeze it. Quantums' paper names "issuer
risk" but does not name the permanent delegate.

### USDC — `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

On-chain liquidity $417.6M. (USDC also carries a freeze authority; Circle has
used it. Recorded so the comparison is fair rather than flattering.)

### Metaplex Core — Royalties plugin

Read 2026-09-01 from `metaplex.com/docs/core/plugins/royalties`.

RuleSets "control which programs can transfer Assets with royalties" — not
whether royalties are paid. Variants: `None` ("any program can transfer the
asset. Royalties are advisory only"), `ProgramAllowList` ("only programs on the
list can transfer"), `ProgramDenyList` ("all programs can transfer except those
on the list"). The docs state: **"Royalty collection/distribution is handled by
marketplaces, not the Core program."**

Marketplace behaviour, 2026: Magic Eden and Tensor both support Core assets;
both make creator royalties **buyer-optional** in the general case. Tensor
enforces on MIP-1 collections and through an opt-in "Tensor Protected"
programme.

**Conclusion for us: an NFT royalty on Solana is a request, not a revenue
line.** The only hard enforcement available is `ProgramAllowList`, which buys
enforcement by refusing to let the asset trade anywhere not on the list.

### Meteora DAMM v2 (`cp-amm`)

Read 2026-09-01 from `docs.meteora.ag/developer-guides/damm-v2/pool-fee-configs`
and `github.com/MeteoraAg/damm-v2`.

- `collect_fee_mode`: `0` = `BothToken`, **`1` = `OnlyB` (fees collected only in
  token B)**, `2` = `Compounding`.
- Base fee denominator is `1_000_000_000`. Base fees bounded 1 bps to 9,900 bps.
- `protocol_fee_percent` is **fixed at 20%** of the trading fee;
  `referral_fee_percent` is 20% of that protocol fee.
- Static configs with `pool_creator_authority` = default pubkey are **public** —
  any payer can create a pool with them. Integrators cannot change a static
  config.
- Published static config for a flat **2% fee, `collectFeeMode: 1`, no dynamic
  fee**: index 15, `HQ6vW45Kug23h2A4LkyUqB4UFfGx4LqY1uZLLfQemEjU`.
- The program supports "creating permanent lock for position but still being
  able to claim fee".

**Read from the chain and from the SDK on 2026-09-01, and two of these contradict
what the plan assumed:**

- cp-amm program id `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`, deployed and
  executable on **devnet as well as mainnet**, with config index 15 present at
  the same address on both. `dynamic_fee.initialized = 0` on that config, so the
  "no dynamic fee" claim above holds; the SDK returns a zeroed struct rather than
  null, which reads like a dynamic fee until it is opened.
- `base_fee.data` decodes to `20_000_000 / 1_000_000_000` = **2%**, and
  `protocol_fee_percent = 20`, so **1.6% of a trade reaches the position**.
  Measured, not derived: `docs/moneypath-devnet.md`.
- **A Token-2022 mint carrying a `transferHook` extension needs a Meteora token
  badge before a DAMM v2 pool can be created — even when the hook's `programId`
  is null.** Isolated on devnet by creating the same pool twice, with and
  without the extension. `create_token_badge` requires a Meteora `operator`.
- **`$PUMP` has no token badge and there are zero DAMM v2 pools holding it**, on
  either side, against 1,385,972 for wSOL and 21,641 for USDC as controls.
- `CpAmm.claimPositionFee` takes `receiver`; destination accounts passed under
  any other name are dropped in silence and the fee goes to `owner`.

### Pump.fun platform economics

- Buyback programme began July 2025; >$300M of PUMP repurchased.
- **April 2026**: all previously bought-back PUMP (~$370M) burned, the 100%
  revenue buyback ended, replaced by **50% of net revenue to buyback-and-burn
  for 12 months** — i.e. a programme with a stated expiry around **April 2027**.
- Creator fees: 0.3% on the bonding curve; on PumpSwap a market-cap-scheduled
  creator share (roughly 0.30% → 0.95% → decaying toward 0.05% as the pool
  grows). Creator fee sharing across up to 10 wallets shipped 2026-01-09.

Sources: KuCoin, CoinMarketCap, Blockworks, `pump.fun/docs/fees`, read
2026-09-01. These are secondary sources and should be re-checked against
Pump.fun's own announcements before anything is published that depends on them.

### Randomness on Solana

Switchboard On-Demand and ORAO both provide verifiable randomness on Solana
today. Switchboard published a VRF request cost "just under 0.002 SOL". This is
a capability Quantums explicitly did not have on its chain.

#### Switchboard On-Demand, read from the crate source 2026-09-01

Source of truth: `switchboard-on-demand` **v0.13.0**, vendored from crates.io
and read at
`~/.cargo/registry/src/index.crates.io-*/switchboard-on-demand-0.13.0/src`.
Not from documentation and not from memory.

- Program IDs — mainnet `SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv`,
  devnet `Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`
  (`src/program_id.rs`). **They are different**, so the program takes the ID
  from config rather than a constant, and the mainnet value is asserted
  literally at `initialize`.
- `RandomnessAccountData` (`src/on_demand/accounts/randomness.rs`):
  `authority`, `queue`, `seed_slothash`, `seed_slot`, `oracle`, `reveal_slot`,
  `value: [u8; 32]`. Discriminator `[10, 66, 229, 135, 220, 239, 217, 114]`.
- **`get_value(clock_slot)` returns the value only when
  `clock_slot == self.reveal_slot`.** Any other slot returns
  `SwitchboardRandomnessTooOld`. This is the fact that shapes the whole
  issuance path: the value is readable **in the reveal slot and in no other**,
  so a settle instruction has to travel in the same transaction as the reveal,
  or it cannot read anything at all.
- `is_revealable(clock_slot)` is `seed_slot < clock_slot`.
- `RandomnessCommit` (`src/on_demand/instructions/randomness_commit.rs`):
  accounts are `randomness` (w), `queue` (r), `oracle` (w), `SlotHashes` sysvar
  (r), `authority` (**signer**). `invoke` uses `invoke_signed` and takes
  seeds — **so the authority can be a PDA of our program**, which is what keeps
  `request_issuance` permissionless.
- The commit **takes an `oracle` account as an argument.** Which oracle serves
  a request is therefore a choice made by whoever calls, not a property of the
  queue. See `DESIGN.md` T12.

### Switchboard On-Demand, read from the DEVNET on-chain IDL 2026-09-01

Loaded from the deployed program `Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`
with the SDK's own loader — the program's published IDL, not documentation.

**Signer requirements, which are the load-bearing part:**

| Instruction | `authority` | `payer` | other signers |
|---|---|---|---|
| `randomnessInit` | **signer** | signer | `randomness` |
| `randomnessCommit` | **signer** | — | — |
| `randomnessReveal` | **signer** | signer | — |

**All three require the randomness account's `authority` to sign.** That single
fact reshapes the Phase 1 program; see `DESIGN.md` §3 and T13.

`randomnessReveal` discriminator `[197, 181, 187, 10, 30, 58, 20, 73]`, which is
`sha256("global:randomness_reveal")[..8]` — derivation and IDL agree. Params are
fixed-size arrays: `signature: [u8; 64]`, `recovery_id: u8`, `value: [u8; 32]`.

Account order for `randomnessReveal`: randomness (w), oracle, queue, stats (w),
authority (signer), payer (signer, w), recentSlothashes, systemProgram,
rewardEscrow (w), tokenProgram, wrappedSolMint, programState.

### The devnet queue's "live" oracle set contains dead oracles — 2026-09-01

Queue `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7`, read and decoded from the
chain. `oracle_keys_len` 9, `node_timeout` **300 seconds**.

Heartbeat age at the moment of reading, per oracle:

    8s · 55s · 41s · 131s · 159s · 384s · 511,902s · 1,148,925s · 1,255,625s

**Three of the nine had not heartbeated in six to fifteen days**, and all nine
were still listed in `oracle_keys` with `is_on_queue == 1`.

This is direct evidence for T12: **membership in the queue's published set is
not liveness.** A caller naming one of those three today would stall the hour,
and only the `last_heartbeat <= node_timeout` assertion refuses it. The crate's
own comment — "have heartbeated on-chain recently" — describes an intention the
account data does not keep.

### Cluster genesis hashes, verified live 2026-09-01

`getGenesisHash` against the public endpoints, so the classifier is checked
against the chain and not against memory:

- mainnet-beta — `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`
- devnet — `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`

These are what `clusterName()` classifies against. A hash that matches neither
returns `unknown`, and `unknown` blocks (CLAUDE.md, showing the network before
a signature).

### `getProgramAccounts` refuses a large holder scan — verified 2026-09-01

Run against `api.devnet.solana.com`, SPL Token program, `dataSize: 165` plus a
`memcmp` on the mint at offset 0, `dataSlice` of 40 bytes:

- A mint with **no** token accounts returns `200` with
  `{"context":{"slot":…},"value":[]}`. The context comes back, so an empty
  holder set and a broken query are distinguishable.
- Devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) returns
  **JSON-RPC error `-32012`, "scan aborted: The accumulated scan results
  exceeded the limit"**.

**It refuses; it does not truncate.** That matters more than it looks: a
truncated scan would produce a Merkle root that verifies perfectly while
silently leaving holders out of the eligible set. A token with a few thousand
holders will hit this on any public endpoint, so the snapshot read needs a
provider that supports large scans, and the cranker treats the abort as a
skipped hour rather than a snapshot.

### Not verified here

- The devnet faucet was **rate-limited** on 2026-09-01, so no funded devnet
  keypair exists yet and no live `getProgramAccounts` run against **our own**
  mint has happened. The rehearsal runbook names funding as a manual step.

### Solana audit market, 2026

Reported ranges, read 2026-09-01 (Zealynx, Accretion, Sherlock):
simple Solana programs **$7k–$20k**; standard Solana DeFi **$60k–$130k**;
complex **$180k+**. Rust/Solana carries a stated 20–40% premium over equivalent
EVM work because the reviewer pool is smaller.

---

## Not verified

Recorded so nobody treats these as checked:

- **Irys / Arweave upload cost** for ~4,000 images. Estimated only.
- Whether DAMM v2 permits a **Token-2022 mint with a live transferHook
  authority** as token B under all conditions, and how it behaves if a hook is
  installed after pool creation.
- Whether any specific audit firm accepts a **pseudonymous** engagement, and on
  what terms.
- Pump.fun's current published tokenomics page (secondary sources only above).

---

## Additions — 2026-09-01, name and cost verification

### Name: "Drakes" — checks run 2026-09-01

**Superseded entry.** The name checks for the abandoned candidate are dropped
rather than kept: they described a species this project no longer depicts, and a
stale check is worse than none. What follows is for `Drakes`, the settled name
(`decisions.md` D1).

**Domain.** `drakes.fun` **bought by the owner** on 2026-09-01 (Namecheap,
project identity). My own RDAP probe never answered for `.fun` — `rdap.org` has
no endpoint for that registry — so **availability was confirmed by the registrar
at purchase, not independently by me.** `drakes.lol`, kept as a backup, returned
RDAP **404 (unregistered)** at the time of the check.

**Ticker `$DRAKES` on Jupiter**, read 2026-09-01 via `lite-api.jup.ag/tokens/v2`:
20 results. Deepest liquidity **US$8,952** (`Xqfwj8Pr…pump`, "DRAKE COIN",
mcap US$36,532); everything else sits near US$2–3k. **All are an order of
magnitude below the >US$50k liquidity threshold this project set**, so there is
no material ticker collision.

**But the ticker is saturated by a person, not a project.** Almost every result
is a Drake-the-rapper memecoin — "Official Drake Coin", "I genuinely feel like
Drake", "Drake Wif Hat", "Bark for Drake". That is a permanent discovery problem
and a publicity-rights risk if the branding ever drifts toward him. The
illustrator brief forbids referencing any real person for this reason.

**NFT collections.** Two live Solana collections already use the exact word:
**Danger Valley Drakes** (500 pieces) and **Lucid Drakes**, both on Magic Eden.
Neither is large, and the dragon field generally is crowded (Doodled Dragons,
Solana Dragons, Dragon Squads, Drazards, 1 Dragon SOL). **EVM was not checked** —
OpenSea's API needs a key this project does not have.

Method note: Magic Eden's public `v2/collections` listing was tried first and
returned zero hits for "drake" across 500 rows — **and that result was
discarded**, because a control against collections known to exist (Mad Lads,
DeGods) found them missing too. The endpoint returns an arbitrary page, not a
catalogue. The collisions above came from search instead.

**Trademark — NOT an authoritative clearance search.** Live US registrations
for **DRAKE'S** exist in food and drink classes: pastry (McKee Foods, reg.
2139074), Drake's Brewing Company (reg. 3993746), Drake's cocktails (reg.
6558333), Drake's Organic Boxtails (reg. 6494935). **Nothing was found in
software, digital goods or entertainment classes.**

This came from a web search over Justia and Trademarkia. **USPTO TESS, EUIPO
eSearch and the WIPO Global Brand Database were not queried directly**, so a
live mark in class 9, 35, 41 or 42 could exist and not appear here. Before any
real money is spent on the brand, that search gets run properly.

### Irys upload cost — live quotes, 2026-09-01

From `uploader.irys.xyz/price/solana/:bytes`. SOL at **$103.62** (Jupiter).

| Payload | Lamports | SOL | USD |
|---|---|---|---|
| 400 MB | 15,661,255 | 0.0157 | **$1.62** |
| 800 MB | 31,322,509 | 0.0313 | **$3.25** |
| 2 GB | 78,306,271 | 0.0783 | **$8.11** |
| 4 GB | 156,612,541 | 0.1566 | **$16.23** |

4,000 images at 500 KB is 2 GB, so **the entire permanent upload costs about
$8**, and even a generous 1 MB per image lands at $16. This is not a budget line
item. The earlier "under $100, estimated" is superseded.

### Irys, run rather than quoted — 2026-09-02

The quotes above are still the cost model. What a real run adds:

- **The node is `https://devnet.irys.xyz` for devnet and it works with a
  Solana devnet keypair.** `Uploader(Solana).withWallet(<base58 secret>).withRpc(<devnet rpc>).devnet()`.
- **Devnet, 4,000 flat-colour PNGs at 512 px = 25.4 MB**, priced at
  **12,413,705 lamports** by `getPrice` including a metadata allowance.
- **A funded balance does not bypass the free-upload rate limit.** With
  13,655,076 lamports funded, 981 of 4,000 items uploaded and the rest returned
  `402 Free transaction limit exceeded, funds required - retry after 14s`.
  Items under the node's free threshold are treated as free whether or not you
  have paid. `uploadFolder` is resumable — it writes `<folder>-manifest.csv`
  and skips what is in it — so the recovery is to call it again, which
  `scripts/upload-collection.ts` now does on a loop.
- **Untested:** whether real art files (~500 KB each, above the free threshold)
  avoid the limit entirely. The mainnet run will answer it.

### Correction: SOL price

Earlier projections in `spec-round-2026-09-01.md` valued redemption fees at an
assumed $220/SOL. **SOL is $103.62** (2026-09-01). A 0.05 SOL redemption fee is
**$5.18**, and 1,000 redemptions is **~$5,180**, not ~$11k. The conclusion is
unchanged — it is a rounding error against the fee stream — but the number was
wrong and is corrected here.

## samilore.org — what a creator fee is worth when a coin moves

*Read **2026-09-02** from `https://samilore.org`, and the signatures below were
re-read from mainnet the same day. Somebody else's project, studied for one
number and one shape. Nothing about it is copied.*

A third party launched a pump.fun coin. The creator fee it pays goes to a wallet
that project publishes, and the project's page lists the distributions with a
signature beside each one.

| | |
|---|---|
| coin | `4LHBp4xYs3suKjkCuo1qaNaxufWd4Bdp6QYsBJZNpump` |
| the mint's program | **Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`), 6 decimals, supply 972,495,081 — read on chain, and an independent confirmation of what D30 found the hard way |
| the wallet the page names | `HuGrvjfkxzSm8Z2EsA51SFbMaCmto3ZmpJR32T7261tD` |
| launch | **2026-08-11** |

**The figure, and exactly how solid it is.**

- **~601 SOL, across nine distributions, on the launch day itself.** That is the
  page's claim.
- **I sampled it rather than believing it.** Of three signatures the page lists,
  **two resolve on mainnet and match to the lamport**:

  | signature | SOL to the published wallet | when |
  |---|---|---|
  | `3YAeuFw7n4itwcMXNjNkjWzBMohtPrDxNNUcpPNX87MkQX5mxGkpRM87rAqK4gk5q19ZxuDBkEEJgpVxZa2nXDJU` | 3.587828175 | 2026-08-11T06:15:24Z |
  | `4tkJPCQRRfkYoAZ8a9mKDmLVjAn2MiWosTk6axaBZM2tjRRDen3w5G5Jz95QV45EcqCWBGMfUJYFNt3BeuqgJ5J1` | 44.920810914 | 2026-08-11T06:21:30Z |

- **The third did not resolve**, and I cannot say whether the signature is wrong
  or my copy of it is: it came out of a summary of the page rather than off the
  page's own DOM. **It is recorded as unresolved rather than dropped.**
- **The ~1,000 SOL total is the project's own estimate**, stated on 2026-08-29.
  It is asserted, not derived, and it is labelled that way here for the same
  reason D28 labels the seeded conversion: a figure nobody can re-derive is a
  figure that carries a different weight.

**Why it is in this file.** Two things, and neither is the coin.

1. **A range, not a forecast.** `DESIGN.md` §1.1 states our creator fee as a
   band pump.fun sets. What the band is *worth* depends entirely on volume, and
   this is one measured point on that axis — one coin, one day, someone else's.
   It does not change §1's hierarchy (D31) and it is not evidence about ours.
2. **The shape of the page.** It is a dated timeline where every entry carries
   its own primary source — a signature, a link, a capture. That is the same
   claim `/verify` makes, told as a chronology instead of as two checks, and it
   is what the timeline view in `/verify/timeline` was built from.

## otcdesks.cash — a creator fee claimed by a program, on a timer

*Read **2026-09-02** from `https://otcdesks.cash` and `/docs`; every account
below was re-read from mainnet the same day. Somebody else's project. What is
studied is the mechanism.*

**What it is, in their words:** *"Desks that hold real tokenised stock, and a
launchpad whose creator fees buy it for the people holding."*

**The mechanism, quoted rather than paraphrased:**

- The creator fee is *"assigned to the protocol in the same transaction that
  creates it"*, and *"pump gives up its own ability to change the split once it
  is set."*
- *"Every minute the protocol checks what the coin has earned and claims it."*
  Permissionless, and *"split four ways inside the same transaction it arrives
  in."*
- *"The 70% is swapped into the stock the coin chose and sent straight out to
  holders… split pro rata."* *"There is nothing to claim and no button to
  press."*

**The accounts, read from mainnet rather than copied:**

| | | read 2026-09-02 |
|---|---|---|
| program | `AjMx5My4YUDHMiCtLpTAtgkiUJgrpJnQqd5AcQnddHQW` | executable, BPFLoaderUpgradeable |
| config | `9b5VLbpXedgXcjWyboXqHMbDgeHJtb5PBsy6TE18REU4` | **owned by the program**, 1,096 bytes |
| pot | `BZcvtxDy4WihU24k3pezzajuiqYtTUHPfH7b5m26BucR` | system-owned, 7,061,003 lamports |
| Metaplex Core | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` | the same program we use |

**And the thing they publish that they may not have meant to.** Their program is
still upgradeable, and the authority is
`DqMAVQ1RcQath18PrSLBVZHjwWXXN8cFEua2XuQ2rbQh` — **on the ed25519 curve, so a
single keypair and not a multisig vault**, holding 20.11 SOL. Read the way C1b
reads ours: programdata `4eGwwZHpVHaqHgm7RoXNakhcydUKCC4EVaZWB65txmLM`, option
byte 1, authority at offset 13. That is a live protocol holding value whose code
one key can replace, which is the exact window D8 and C1b exist to close, and it
is now a measured example rather than an argument.

### What we take

1. **The claim is a job, not a ceremony.** D30 already established that
   `collect_creator_fee` needs no signer, so a stolen crank key cannot redirect
   a lamport of it. This is the same instruction run on a **timer**, in public,
   by somebody else — evidence that the cadence is a scheduling decision and not
   a risk. It belongs beside the hourly crank rather than as a step somebody
   remembers monthly. `DESIGN.md` §3.6's conversion ceremony is unaffected:
   *claiming* is permissionless, *converting* is the 2-of-3.
2. **A table of accounts, rendered on `/verify` and read from the config account
   rather than typed into the page.** Publishing the program, the config and the
   destinations is what lets a stranger check the rest, and their config is
   owned by their program — so the honest version of that table reads the
   addresses out of the account at request time. Typing them into a component
   would make the page a claim about the chain instead of a read of it. **Not
   built here; recorded as the shape when it is.**

### What we do not take

**The distribution.** Fees swapped into an asset and pushed pro rata to every
holder is a different product from ours in three ways, and each one is a rule
this project already wrote down:

- It makes the fee **the reason to hold**, which is what D31 decided against on
  the shape of pump.fun's schedule.
- It **pushes value to holders on a schedule**, which is a characterisation
  `DESIGN.md` §7 declines to make for itself — our redemption is Phase 2,
  burn-based and opt-in, and the piece is what is redeemed.
- The asset is **tokenised stock**. This project does not have a view on that
  and is not going to acquire one in a reference file.

## pump.fun — the launchpad, the fee schedule and a launched token

*Read 2026-09-02. Supersedes the Meteora entry as the launch venue (owner's
decision); the Meteora findings stay because they are about Squads and Jupiter.*

| | |
|---|---|
| Bonding curve program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` — live, executable |
| PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` — live, executable |
| Creator fee, bonding curve | **0.300%** of 1.25% total |
| Creator fee, PumpSwap | **tiered by market cap: 0.950% (420–1,470 SOL) down to 0.050% (98,240+ SOL)** |
| Fee asset | **wSOL** |
| Claim | `collect_coin_creator_fee`, **permissionless — no signer** |
| Creator vault PDA | seeds `["creator_vault", coin_creator]` |
| Changing the creator later | `admin_set_coin_creator`, **Pump's admin, not ours** |

**A launched token is Token-2022, not SPL Token.** Sampled
`2gMuEXhrfxEr71Hj1YacP9uRvdGFZtrUscbaNnNFpump`: owner
`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, 6 decimals, supply 1e15,
extensions **`metadataPointer` and `tokenMetadata` only** — no transfer hook, no
transfer fee, no permanent delegate.

**Holder accounts for that mint, by size** (`getProgramAccounts`, 2026-09-02):

| filter | accounts |
|---|---|
| `dataSize: 165` — *what `snapshot/rpc.ts` filters on today* | **10** |
| `dataSize: 170` — Token-2022 ATA | **590** |
| `dataSize: 182` | 1 |
| no size filter | **600** |

Our snapshot would see 1.7% of holders and produce a root that verifies over the
wrong set. `docs/round-2026-09-02-pumpfun.md` §3.

**The mint may be supplied.** The `pump` suffix is a vanity convention and not
enforced: `F4PaKuUPQ5c5QdkXqqjcprjnWXpQ2Qh4aCadobjNT4vP` was launched without it.

**Not established:** whether `create` accepts a PDA signer, so whether
`coin_creator` can be a Squads vault from launch. The bonding curve's own claim
instruction was not read.
