// The identity pin, as a command for the C3 checklist.
//
//   node scripts/check-ground-mint.ts --mint <address>
//   node scripts/check-ground-mint.ts --keypair <path.json>
//
// `--keypair` is the form that matters at launch: it derives the public key
// from the file that is about to sign `create_v2` and asserts it is the mint
// published in advance. `--mint` only compares two strings, which proves less.
//
// The logic is `src/lib/solana/ground-mint.ts`; this is the CLI over it.

import { readFileSync } from 'node:fs'
import { Keypair } from '@solana/web3.js'
import { GROUND_MINT, checkGroundMint } from '../src/lib/solana/ground-mint.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const keypairPath = flag('keypair')
const candidate =
  keypairPath === undefined
    ? flag('mint')
    : Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]),
      ).publicKey.toBase58()

if (candidate === undefined) {
  process.stderr.write('--mint <address> or --keypair <path.json> is required\n')
  process.exit(2)
}

const verdict = checkGroundMint(candidate)
process.stdout.write(
  [
    `published  ${GROUND_MINT}`,
    `candidate  ${verdict.candidate}${keypairPath === undefined ? '' : `  (from ${keypairPath})`}`,
    `${verdict.ok ? 'OK  ' : 'FAIL'} ${verdict.why}`,
    '',
  ].join('\n'),
)
if (!verdict.ok) process.exitCode = 1
