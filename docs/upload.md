# B2 — the collection onto Arweave, and the manifest C2 commits

    node scripts/generate-collection.ts --out build/collection --render all
    node scripts/upload-collection.ts   --dir build/collection --keypair <throwaway.json> \
                                        --network devnet --fund
    node scripts/verify-upload.ts       --dir build/collection

**The day the art lands, that is the whole procedure**: replace
`build/collection/pieces` with the delivery and run the three commands. Which is
why they were run now, against flat-colour placeholders — a pipeline first
exercised on delivery day is a pipeline that discovers its problems while an
illustrator waits.

---

## Two manifests, and handing C2 the wrong one is a one-way mistake

| File | Holds | Made by |
|---|---|---|
| `manifest.json` | the **allocation**: id, tier, traits | `generate-collection.ts` |
| `manifest.final.json` | that, plus **the URI of every piece** and the two upload addresses | `upload-collection.ts` |

The program's own `InitializeParams` says the hash commits *"id, tier, traits,
URI"*. The URIs cannot exist before the bytes have addresses, so the order is
forced: render → upload images → write metadata naming the image addresses →
upload metadata → **then** the manifest whose sha256 goes into `initialize`.

`generate-collection.ts` used to print its hash as "what `initialize` commits".
It now prints the opposite, in capitals, because that sentence was true when the
manifest had no URIs in it and is a permanent mistake now.

## What the manifest cannot bind, and it is not a documentation problem

**`settle_issuance` takes `name` and `uri` as arguments and mints with them
unvalidated** (`programs/issuance/src/lib.rs`, the `CreateV2CpiBuilder` call).
The piece id is chosen *inside* that same instruction, from the revealed value —
so the cranker **cannot know which piece it is minting** when it builds the
transaction, and therefore cannot pass that piece's URI.

Two consequences, both real today:

1. **The crank's current default is wrong.** It passes
   `Drake #{hour+1}` and `https://drakes.fun/a/{hour+1}` — the *hour*, not the
   piece. Hour 379 issued piece #1334, so the asset in that holder's wallet is
   named for a piece that is still in the collection.
2. **A stolen crank key can mint an asset with any metadata it likes.** It
   cannot change who receives it, which piece leaves the survivor set, or where
   a lamport goes — the program decides all three — but the asset's name and
   image are the caller's to choose.

**This is a program decision and it is not taken here.** Three ways out, in
increasing order of what they cost:

| | What | Cost |
|---|---|---|
| A | The program builds the URI on chain: `base_uri + piece_id + ".json"`, `base_uri` written once by `initialize`. | An Anchor change and a redeploy. Phase 1 holds no value, so this is cheap **now** and impossible after the upgrade authority is revoked (D8). |
| B | The site serves `/a/<hour>`, which reads the chain and answers with the piece's metadata. | No program change. The asset's metadata is then served by us and not by Arweave, which is a centralisation this project otherwise refuses. |
| C | Leave it. | Every asset carries the wrong name and a dead link, forever. |

**A was taken.** `docs/round-2026-09-02-asset-uri.md` is the round and **D32**
is the decision: the program builds both strings from a `base_uri` and a
`name_prefix` written once by `initialize`, and it carries no name of its own.
Deployed to devnet through the Squads 2-of-3 on 2026-09-02.

**What that means for this document:** `base_uri` is the metadata folder this
pipeline produces, **with its trailing slash**, and it is a C2 argument. Get it
wrong and every asset points somewhere that does not exist, permanently.

## The upload key is a throwaway, and the script enforces it

`upload-collection.ts` refuses to run with a wallet holding more than
`--max-balance` (default **1 SOL**). The key is handed to a third-party SDK with
a dependency tree this project did not choose, on the machine that will later
hold the mint keypair. Fund a fresh key with the estimate plus margin and
nothing else — the same reasoning as the crank key: the worst a stolen one can
do is pay for our uploads.

**The dependency is `@irys/upload` + `@irys/upload-solana`, and it is a
devDependency.** It never reaches Vercel or the crank host. It pulls an
`@ethersproject` wallet stack — an Ethereum library, in a Solana-only project —
which is the argument against it. The argument for it is that the alternative is
hand-rolling ANS-104 data-item signing with no test vectors to check it against,
and a signature format guessed from memory is exactly the failure this project
writes rules about. **Recorded as a supply-chain decision for the owner rather
than taken quietly** (CLAUDE.md, the no-doxx guard).

## Verification is behavioural, and it can fail

`verify-upload.ts` fetches a random **5%** back through the gateway and diffs
the bytes. Three ways that check could lie, each closed:

1. **An empty sample passes.** The sample size is asserted against the
   collection size before anything is fetched, and a short sample aborts.
2. **A 200 that is not the file.** The comparison is over content, never over
   status: a gateway answering an HTML error page with status 200 fails.
3. **A comparison that cannot fail.** After the sample passes, one byte of a
   file that just matched is flipped in memory and re-compared. If that still
   passes, the run fails and says the result is unproven.

The metadata is compared byte-for-byte against what the uploader would have
written, so a document that is valid JSON but belongs to another piece is
caught.

## The devnet run, 2026-09-02

Flat-colour placeholders, 512 px, **4,000 images (25.4 MB) and 4,000 metadata
documents**, on `https://devnet.irys.xyz`.

| | |
|---|---|
| images | `8h7WTpLjbx2TebmQmfavyRL5f2ovG4WTXsK8YTVALT28` |
| metadata | `Es6PTfT129ohfi8dWqiyGwScFDyi1jSnZfRHxREtWDDa` |
| `manifest.final.json` sha256 | `3204a5bdba1766d21d3fda2dec3fff2eccdc494d229992f87a4504bca5537cbd` |
| verified | **200 of 200 sampled came back byte-identical**, images and metadata, and the control caught a planted corruption |
| spent | **0.101 SOL** of devnet, from a wallet that went 0.2383 → 0.0451 with 0.092 still sitting in the Irys balance |

**Pricing is per ITEM, not per byte, and the gap is a factor of thirteen.**
`getPrice` quoted 11,181,330 lamports for the 25.4 MB and the per-item model
came to 144,224,000 for the same 4,000 files. The first run funded the byte
figure and ran out at item 4,000 with the path manifest still to upload, which
is why the script now takes the larger of the two models.

**A gateway 302 is normal.** `gateway.irys.xyz` redirects to a CDN host, and
devnet content resolves through it. This is the reason the verification compares
content and never status: a check written against `res.ok` would have been
green on a redirect that went nowhere.

Figures, addresses and the verification report are in
`evidencia/drakes/2026-09-02-b22-bot-y-upload/`.

**Irys devnet is not permanent storage** and this is the reason to use it here:
uploading 4,000 placeholder squares to mainnet Arweave would be a permanent
public artifact of this project's rehearsal. The mainnet run happens once, with
the real art, from a funded throwaway.
