// The pair-order check, as a command for the B3 deploy checklist.
//
//   node scripts/check-mint-order.ts --mint <address> [--quote wsol|pump]
//
// The logic is `src/lib/solana/mint-order.ts`; this is the CLI over it.

import { PUMP_MINT, WSOL_MINT, checkOrder } from '../src/lib/solana/mint-order.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const mint = flag('mint')
if (mint === undefined) throw new Error('--mint <address> is required')
const quoteName = (flag('quote') ?? 'wsol').toLowerCase()
const quote = quoteName === 'pump' ? PUMP_MINT : WSOL_MINT
const verdict = checkOrder(mint, quote)
process.stdout.write(
  [
    `base   ${verdict.base}`,
    `quote  ${verdict.quote}  (${quoteName})`,
    `token  base is token ${verdict.baseIs}`,
    `${verdict.ok ? 'OK  ' : 'FAIL'} ${verdict.why}`,
    '',
  ].join('\n'),
)
if (!verdict.ok) process.exitCode = 1
