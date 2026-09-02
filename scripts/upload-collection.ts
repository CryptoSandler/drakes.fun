// The collection, onto Arweave through Irys, and the manifest that commits it.
//
//   node scripts/upload-collection.ts --dir build/collection --keypair <path>
//                                     [--network devnet|mainnet] [--fund]
//
// Caller: the operator, once, when the art is final. **The day the art lands is
// `--render all` and this script**, which is the point of running it now
// against flat-colour placeholders: a pipeline first exercised on delivery day
// is a pipeline that discovers its problems while an illustrator waits.
//
// **Two uploads, in this order, and the order is forced.** The image folder
// goes first because a piece's metadata has to name the address its image
// landed at, and that address does not exist until the images are up. Then the
// metadata folder. Then `manifest.final.json`, whose sha256 is what C2 commits.
//
// **The key that signs these uploads is a throwaway.** It is handed to a
// third-party SDK with a dependency tree this project did not choose, and it is
// on the operator's machine — the same machine that will later hold the mint
// keypair. So the script refuses to run with a wallet holding more than
// `--max-balance` (default 1 SOL): fund it with the estimate plus margin and
// nothing else. Same reasoning as the crank key (CLAUDE.md): the worst a stolen
// one can do is pay for our uploads.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Uploader } from '@irys/upload'
import { encodeBase58 } from '../src/lib/solana/base58.ts'
import { Solana } from '@irys/upload-solana'
import {
  canonical, finalManifest, metadataFor, pieceFile, sha256Hex,
  type Allocation,
} from '../src/lib/art/manifest.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string): boolean => process.argv.includes(`--${name}`)
const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}
// A function declaration and not a const arrow: TypeScript only narrows through
// a `never`-returning call when it can see the declaration this way, and
// without the narrowing every id below is `string | undefined`.
function die(message: string): never {
  process.stderr.write(`${message}\n`)
  return process.exit(1)
}

const dir = flag('dir') ?? die('--dir <collection dir> is required')
const network = flag('network') ?? 'devnet'
if (network !== 'devnet' && network !== 'mainnet') die('--network is devnet or mainnet')
const keypairPath = flag('keypair') ?? process.env.IRYS_KEYPAIR ?? die('--keypair <path.json> is required')
const maxBalance = Number(flag('max-balance') ?? 1)
const gateway = (flag('gateway') ?? 'https://gateway.irys.xyz').replace(/\/$/, '')
const rpcUrl = process.env.RPC_URL ?? die('RPC_URL is not set')

// --- the allocation, and a file for every id --------------------------------

const allocation = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Allocation
if (allocation.pieces.length !== allocation.collectionSize) {
  die(`the manifest holds ${allocation.pieces.length} pieces and claims ${allocation.collectionSize}`)
}

// Name by name, not a count. A folder with the right number of files and one
// wrong name uploads perfectly and leaves one asset pointing at nothing.
const images = join(dir, 'pieces')
const missing: number[] = []
let bytes = 0
for (const piece of allocation.pieces) {
  const path = join(images, pieceFile(piece.id, 'png'))
  if (!existsSync(path)) missing.push(piece.id)
  else bytes += statSync(path).size
}
if (missing.length > 0) {
  die(`${missing.length} pieces have no image, first ${missing.slice(0, 5).join(', ')}. Run generate-collection.ts --render all`)
}
out(`${allocation.pieces.length} images, ${(bytes / 1e6).toFixed(1)} MB`)

// --- the wallet -------------------------------------------------------------

const secret = Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[])
const wallet = Keypair.fromSecretKey(secret)
const balance = (await new Connection(rpcUrl).getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL
out(`wallet ${wallet.publicKey.toBase58()} holds ${balance} SOL on ${network}`)
if (balance > maxBalance) {
  die(
    `refusing: this wallet holds ${balance} SOL and the ceiling is ${maxBalance}. ` +
      'The upload key is handed to a third-party SDK; fund a throwaway with the ' +
      'estimate plus margin, or raise --max-balance deliberately.',
  )
}

// The SDK wants the secret key base58-encoded. `encodeBase58` is this
// repository's own, tested, and already imported everywhere -- one less
// package in the tree that signs with a key.
const builder = Uploader(Solana).withWallet(encodeBase58(secret)).withRpc(rpcUrl)
const irys = await (network === 'devnet' ? builder.devnet() : builder)
out(`irys ${irys.api.config.url.href} · token ${irys.token}`)

// --- funding ----------------------------------------------------------------

// **Priced per ITEM, not per byte, and the difference is a factor of nine.**
// A folder of 4,000 six-kilobyte images is 25.4 MB, which `getPrice` quotes at
// 12,413,705 lamports — and the upload then ran out of funds at item 4,000 with
// the path manifest still to go. Every data item carries its own header and its
// own minimum, so the cost of N small files is N times the price of one, and
// nothing like the price of their total size.
//
// Measured 2026-09-02 on devnet: ~13,920 lamports per 6 KB item. So the
// estimate takes the LARGER of the two models, doubles for the metadata folder
// that follows, and adds the two path manifests.
const items = allocation.pieces.length
const perItem = await irys.getPrice(Math.ceil(bytes / items))
const byModel = {
  bytes: await irys.getPrice(bytes),
  items: perItem.multipliedBy(items),
}
// Budgeted ONE FOLDER at a time, with the mid-run top-up below covering the
// metadata folder that follows. Funding both up front would ask for the whole
// 0.29 SOL before a byte moves, and an operator funding a throwaway should be
// asked for what the next step costs.
const price = (byModel.items.gt(byModel.bytes) ? byModel.items : byModel.bytes)
  .multipliedBy(1.15)
  .integerValue()
const funded = await irys.getBalance()
out(`price by bytes ${byModel.bytes.toString()} · by items ${byModel.items.toString()}`)
out(`budgeting ${price.toString()} lamports · funded ${funded.toString()} lamports`)

if (funded.lt(price)) {
  if (!has('fund')) die('not enough funded. Re-run with --fund to top up, or fund by hand.')
  const top = price.minus(funded).integerValue()
  out(`funding ${top.toString()} lamports`)
  await irys.fund(top)
  out(`funded; balance now ${(await irys.getBalance()).toString()}`)
}

// --- the images -------------------------------------------------------------


/**
 * `uploadFolder`, retried until it finishes.
 *
 * **Irys rate-limits free uploads and a funded balance does not bypass it.**
 * Observed 2026-09-02 uploading 4,000 six-kilobyte placeholders to devnet with
 * 13,655,076 lamports funded: 981 files went up and then the rest came back
 * `402 Free transaction limit exceeded, funds required - retry after 14s`.
 * Items under the node's free-upload threshold are treated as free whether or
 * not you have paid, and the threshold is per item — so a collection of small
 * files hits it and one of large files may not. Untested with real art.
 *
 * The SDK is resumable by design: it writes `<folder>-manifest.csv` as it goes
 * and skips what is already in it. So the whole recovery is to call it again,
 * and this does that rather than leaving an operator to notice at 981 of 4,000.
 */
async function uploadFolderResuming(folder: string, label: string): Promise<string> {
  const attempts = Number(flag('attempts') ?? 60)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await irys.uploadFolder(folder, { indexFile: '', batchSize: 20, keepDeleted: false })
      const id = result?.id
      if (id === undefined || id === '') die(label + ' upload returned no id')
      return id
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === attempts) die(label + ': ' + message)
      // The node names its own backoff in the error text it leaves behind;
      // believe that over a number of ours, and fall back to 20s.
      // "Not enough balance" is not a wait, it is a top-up. Without this the
      // loop retries sixty times against a balance that cannot change.
      if (/Not enough balance/i.test(message) || /Not enough balance/i.test(readErrors(folder))) {
        if (!has('fund')) die(label + ': out of funds, and --fund was not passed')
        // A quarter of a folder's budget per top-up: enough to make progress,
        // small enough that a wallet with the wrong ceiling fails early.
        const short = price.dividedBy(4).integerValue()
        out('  ' + label + ': out of funds, topping up ' + short.toString() + ' lamports')
        await irys.fund(short)
      }
      const after = /retry after (\d+)s/.exec(readErrors(folder))?.[1]
      const wait = (after === undefined ? 20 : Number(after) + 2) * 1000
      out('  ' + label + ': ' + message + ' — resuming in ' + wait / 1000 + 's (attempt ' + attempt + '/' + attempts + ')')
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  return die(label + ': gave up')
}

/** The SDK writes its failures beside the folder rather than throwing them. */
function readErrors(folder: string): string {
  try {
    return readFileSync(folder + '-errors.txt', 'utf8')
  } catch {
    return ''
  }
}

out('uploading images...')
const imagesId = await uploadFolderResuming(images, 'images')
out(`images ${imagesId}`)

// --- the metadata -----------------------------------------------------------

const metadataDir = join(dir, 'metadata')
mkdirSync(metadataDir, { recursive: true })
const imageBase = `${gateway}/${imagesId}`
for (const piece of allocation.pieces) {
  writeFileSync(
    join(metadataDir, pieceFile(piece.id, 'json')),
    JSON.stringify(metadataFor(piece, imageBase)),
  )
}
out(`${allocation.pieces.length} metadata documents written`)

out('uploading metadata...')
const metadataId = await uploadFolderResuming(metadataDir, 'metadata')
out(`metadata ${metadataId}`)

// --- the manifest C2 commits ------------------------------------------------

const final = finalManifest({ allocation, images: imagesId, metadata: metadataId, gateway })
const serialised = canonical(final)
const hash = sha256Hex(serialised)
writeFileSync(join(dir, 'manifest.final.json'), serialised)
writeFileSync(join(dir, 'manifest.final.sha256'), `${hash}\n`)
writeFileSync(
  join(dir, 'upload-receipt.json'),
  JSON.stringify({
    network, gateway, images: imagesId, metadata: metadataId,
    pieces: allocation.pieces.length, bytes,
    uploadedAt: new Date().toISOString(),
    wallet: wallet.publicKey.toBase58(),
    manifestSha256: hash,
  }, null, 2),
)

out('')
out(`manifest.final.json  sha256 ${hash}`)
out('  THIS is the hash `initialize` commits (C2). It covers id, tier, traits')
out('  AND the URI of every piece, which is what InitializeParams says it does.')
out('')
out(`  a piece:  ${final.pieces[0]!.uri}`)
out(`  an image: ${imageBase}/${pieceFile(0, 'png')}`)
out('')
out(`Now run: node scripts/verify-upload.ts --dir ${dir}`)
