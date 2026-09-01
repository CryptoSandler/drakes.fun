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
