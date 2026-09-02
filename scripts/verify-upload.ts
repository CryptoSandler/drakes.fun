// Did the bytes we uploaded arrive, and are they the bytes we have?
//
//   node scripts/verify-upload.ts --dir build/collection [--sample 5]
//
// Caller: the operator, straight after `scripts/upload-collection.ts`, and
// again before C2. Nothing in the application calls it.
//
// **Behavioural, not a spot check** (`docs/batches.md`, B2): a random sample of
// the collection is fetched back through the gateway and diffed against the
// local bytes. A spot check of one file proves the upload started.
//
// **Three ways this check can lie, and each is closed:**
//
// 1. **An empty sample passes.** Zero mismatches out of zero fetches reads
//    exactly like success, so the sample size is asserted against the
//    collection size before anything is fetched.
// 2. **A 200 that is not the file.** A gateway that answers an HTML error page
//    with status 200 -- or a captive portal, or a redirect that resolves
//    somewhere else -- passes `res.ok` and fails only on the bytes. So the
//    comparison is over content, never over status.
// 3. **A comparison that cannot fail.** After the sample passes, one of the
//    fetched files is corrupted in memory and re-compared. If that still
//    passes, the instrument is broken and the run fails.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { canonical, metadataFor, pieceFile, type FinalManifest } from '../src/lib/art/manifest.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}
function die(message: string): never {
  process.stderr.write(`${message}\n`)
  return process.exit(1)
}

const dir = flag('dir') ?? die('--dir <collection dir> is required')
const percent = Number(flag('sample') ?? 5)
const path = join(dir, 'manifest.final.json')
if (!existsSync(path)) die(`${path} does not exist: run upload-collection.ts first`)

const manifest = JSON.parse(readFileSync(path, 'utf8')) as FinalManifest
const gateway = (flag('gateway') ?? manifest.gateway).replace(/\/$/, '')
const imageBase = `${gateway}/${manifest.images}`
const digest = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex')

// --- the sample -------------------------------------------------------------

const wanted = Math.ceil((manifest.pieces.length * percent) / 100)
const pool = [...manifest.pieces]
const sample: typeof pool = []
while (sample.length < wanted && pool.length > 0) {
  sample.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
}
// The control for an empty result. Everything below reports "0 mismatches" if
// this list is empty, which is indistinguishable from a clean run.
if (sample.length !== wanted || wanted === 0) {
  die(`the sample is ${sample.length} of a wanted ${wanted}: the check would prove nothing`)
}
out(`${manifest.pieces.length} pieces · sampling ${sample.length} (${percent}%) through ${gateway}`)

// --- fetching ---------------------------------------------------------------

interface Row { id: number; imageOk: boolean; metaOk: boolean; why: string[]; imageBytes?: Uint8Array }

async function check(piece: FinalManifest['pieces'][number]): Promise<Row> {
  const why: string[] = []
  const local = new Uint8Array(readFileSync(join(dir, 'pieces', pieceFile(piece.id, 'png'))))

  let imageOk = false
  let imageBytes: Uint8Array | undefined
  try {
    const response = await fetch(`${imageBase}/${pieceFile(piece.id, 'png')}`)
    imageBytes = new Uint8Array(await response.arrayBuffer())
    // Content, not status: a 200 carrying an error page is the failure this
    // whole file exists to notice.
    imageOk = digest(imageBytes) === digest(local)
    if (!imageOk) why.push(`image differs (HTTP ${response.status}, ${imageBytes.length} bytes vs ${local.length} local)`)
  } catch (error) {
    why.push(`image fetch failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  let metaOk = false
  try {
    const response = await fetch(piece.uri)
    const body = await response.text()
    // Byte-for-byte against what the uploader would have written, so a metadata
    // document that is valid JSON but the wrong piece's is caught.
    metaOk = body === canonical(metadataFor(piece, imageBase))
    if (!metaOk) why.push(`metadata differs (HTTP ${response.status})`)
  } catch (error) {
    why.push(`metadata fetch failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return { id: piece.id, imageOk, metaOk, why, imageBytes }
}

const rows: Row[] = []
for (let i = 0; i < sample.length; i += 8) {
  rows.push(...(await Promise.all(sample.slice(i, i + 8).map(check))))
  process.stdout.write(`\r  ${rows.length}/${sample.length} fetched`)
}
process.stdout.write('\n')

const bad = rows.filter((r) => !r.imageOk || !r.metaOk)
for (const row of bad.slice(0, 10)) out(`  #${row.id}: ${row.why.join('; ')}`)

// --- the control ------------------------------------------------------------

// Everything above may have returned clean. So does a comparison that cannot
// fail. Corrupt one byte of a file that just matched and re-run the comparison.
const witness = rows.find((r): r is Row & { imageBytes: Uint8Array } => r.imageOk && r.imageBytes !== undefined)
if (witness === undefined) {
  die('no file matched, so the control cannot run: treat the whole result as unproven')
}
const corrupted = new Uint8Array(witness.imageBytes)
const at = Math.floor(corrupted.length / 2)
corrupted[at] = (corrupted[at] ?? 0) ^ 0xff
const local = new Uint8Array(readFileSync(join(dir, 'pieces', pieceFile(witness.id, 'png'))))
const controlCaught = digest(corrupted) !== digest(local)

out('')
out(`sampled        ${rows.length} of ${manifest.pieces.length}`)
out(`images match   ${rows.filter((r) => r.imageOk).length}`)
out(`metadata match ${rows.filter((r) => r.metaOk).length}`)
out(`control        ${controlCaught ? 'a corrupted byte IS caught' : 'A CORRUPTED BYTE IS NOT CAUGHT'}`)
out(`ids sampled    ${rows.map((r) => r.id).sort((a, b) => a - b).join(',')}`)

if (bad.length > 0 || !controlCaught) {
  die(`\nFAILED: ${bad.length} of ${rows.length} mismatched${controlCaught ? '' : ', and the control did not catch a planted defect'}`)
}
out('\nevery sampled piece came back byte-identical, and the check can fail')
