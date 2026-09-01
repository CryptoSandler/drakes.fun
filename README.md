# Verifying an issuance yourself

Once an hour this protocol issues one piece of a 4,000-piece collection to one
holder. Two things decide it: **which piece** goes out, and **who** receives it.
Both are derived from a value an oracle publishes on chain, and both are
recomputable by a stranger.

This page is how you become that stranger. Nothing here asks you to trust a
number this project published, and the commands below read the chain rather
than our records.

## What is being claimed, and what is not

The honest version, because the difference matters:

- **Recomputable.** Every input is public chain state. We build the eligibility
  tree, so we *could* lie about it — but a lie would be permanent public
  evidence, checkable by anyone with an RPC endpoint.
- **Not trustless.** There is no proof here that removes us from the picture.
  Anyone who tells you otherwise about a system shaped like this one is
  overselling it.

What the commands below establish, precisely:

1. The permutation over the 4,000 pieces, rebuilt from the values the program
   itself published, agrees with the piece id the program emitted every hour.
2. No piece has been issued twice.
3. The recipient of each hour is the one the published eligibility set and the
   revealed value resolve to, and their inclusion proof verifies against the
   root the program committed **before** the value existed.
4. The eligibility set we published for each hour is the one the settlement
   actually ran against.

What they do **not** establish: that the eligibility set matched chain state at
the slot it names. Doing that needs your own indexer running from the start, or
a replay of token transfers up to that slot. The tooling says which of the two
claims it is making rather than blurring them.

## Requirements

- **Node 22 or newer.** Nothing else. There is no `npm install` step for any
  command on this page — the verification path has no dependencies on purpose,
  so that running it does not mean installing several hundred packages from us.
- **An RPC endpoint that keeps history.** Any provider works. The commands take
  the URL as an argument and never read one from a config file.

```sh
git clone <this repository>
cd drakes
node --version          # v22 or newer
```

### Using your own Helius key

We use [Helius](https://helius.dev) and you do not have to. If you want the same
endpoint we use, make a free account, take the key, and put it in your own
shell — it is yours, not ours, which is the point:

```sh
export RPC="https://devnet.helius-rpc.com/?api-key=YOUR_KEY_HERE"
```

For mainnet, `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY_HERE`. Any
endpoint that answers `getSignaturesForAddress` and `getTransaction` over the
program's full history will do; the public endpoints rate-limit hard but do
work for a small number of issuances.

## Rebuilding the permutation from the chain

```sh
node scripts/snapshot.ts pieces \
  --rpc "$RPC" \
  --program <PROGRAM_ID> \
  --config  <CONFIG_ADDRESS>
```

This pages every signature over the program, decodes the `IssuanceSettled`
events, and replays the survivor array from the revealed values alone. It reads
no account we control and no file we published.

```
source         chain, program 7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs
config         4ooopeJoL2TaBEkKxR89ZqMYE9XafiojZW9suV2caX4m
OK   settled      51
     minted       51
OK   distinct     51  (no piece issued twice)
OK   piece ids    51/51 match the replay
     remaining    3949 of 4000
```

`piece ids 51/51` is the line that matters. It says the piece the program
minted each hour is the piece an independent implementation derives from the
published value — that the sequence was not chosen, it was computed.

## Checking one hour offline

Each settled issuance also has a published artifact carrying the full
eligibility set. Verifying one needs no network at all:

```sh
node scripts/snapshot.ts verify snap-42.json \
  --randomness <THE 64 HEX CHARACTERS THE EVENT PUBLISHED>
```

It rebuilds the tree from the balances in the file, recomputes the root and the
commitment, resolves the revealed value to a recipient, and verifies that
recipient's inclusion proof. The root is rebuilt from the balances and never
read back out of the file — comparing a published root to itself is the check
that always passes.

## Reconciling the published set against the chain

```sh
node scripts/snapshot.ts verify \
  --published ./snapshots \
  --rpc "$RPC" \
  --program <PROGRAM_ID> \
  --config  <CONFIG_ADDRESS>
```

Every settlement on chain, against the artifact we published for it:

```
chain          51 settlements
published      49 artifacts
GAP  missing      issuances 17 and 42 are missing from the published set
OK   agreement    47 fully verified, 2 partial, 0 disagree
```

Three findings, kept apart deliberately:

| Line | Means |
|---|---|
| `GAP missing` | We failed to publish an artifact. Our record has a hole. |
| `WARN partial` | The artifact is a recovery stub with no eligibility set, so the root was not checked. |
| `FAIL disagrees` | An artifact contradicts the chain. This is the one that is a defect. |

Exit codes: `0` clean, `4` gaps but no disagreement, `1` a disagreement.

### Why these are three findings and not one

On 2026-09-01 the replay ran off our own published set, and two artifacts had
been deleted while the issuances they described were on chain. The replay was
two takes behind from its first line and reported **0 of 49 matching** — which
is exactly what a genuine disagreement in the arithmetic looks like.

It was neither. A hole in our record is a fact about our record. The permutation
is a function of the chain, and now the tool treats it that way: `pieces` never
touches the published set, and a gap is named rather than cascaded.

That is also why every event carries the revealed value. An artifact we lose is
recoverable from the chain by anyone, including us.

## Reading the source

| File | What it does |
|---|---|
| [`src/lib/chain/events.ts`](src/lib/chain/events.ts) | Pages the program's signatures and decodes `IssuanceSettled`. |
| [`src/lib/protocol/survivors.ts`](src/lib/protocol/survivors.ts) | The permutation, and the exactly-uniform sampling. |
| [`src/lib/snapshot/build.ts`](src/lib/snapshot/build.ts) | The eligibility tree and how a value resolves to a holder. |
| [`src/lib/snapshot/reconcile.ts`](src/lib/snapshot/reconcile.ts) | The published set, checked rather than believed. |
| [`programs/issuance/src/lib.rs`](programs/issuance/src/lib.rs) | The on-chain program, carrying test vectors generated by the TypeScript above. |

The last row is the cross-check that keeps the two implementations honest: the
hashing and the sampling exist twice, in Rust and in TypeScript, and a change to
either that is not made to both turns the program's tests red.

## The devnet rehearsal

The numbers in the examples above are real and you can reproduce them. They come
from a 48-hour rehearsal run on devnet on 2026-09-01, at a 60-second period so
that 48 issuances take 48 minutes:

```sh
export RPC="https://devnet.helius-rpc.com/?api-key=YOUR_KEY_HERE"
node scripts/snapshot.ts pieces \
  --rpc "$RPC" \
  --program 7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs \
  --config  4ooopeJoL2TaBEkKxR89ZqMYE9XafiojZW9suV2caX4m
```

That rig holds no value, it is devnet, and it is left up so this page has
something to point at.
