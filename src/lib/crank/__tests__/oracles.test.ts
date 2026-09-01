import { describe, expect, it } from 'vitest'
import { eligible, selectOracle, type Candidate, type OracleView, type QueueView } from '../oracles.ts'

const queue: QueueView = { oracleKeys: ['a', 'b', 'c', 'd', 'e', 'f'], nodeTimeoutSeconds: 300 }
const NOW = 1_000_000

const view = (address: string, over: Partial<OracleView> = {}): OracleView => ({
  address,
  queue: 'Q',
  isOnQueue: true,
  lastHeartbeat: NOW - 10,
  gatewayUri: `https://${address}.example`,
  ...over,
})

const cand = (address: string): Candidate => ({ ...view(address), heartbeatAge: 10 })

describe('the on-chain half', () => {
  it('keeps only oracles the queue and the oracle both agree are live', () => {
    const { candidates, rejected } = eligible(
      [
        view('a'),
        view('b', { isOnQueue: false }),
        view('zz'),
        view('c', { lastHeartbeat: NOW - 1_148_925 }),
        view('d'),
      ],
      queue,
      NOW,
    )
    expect(candidates.map((c) => c.address)).toEqual(['a', 'd'])
    expect(rejected).toEqual([
      { address: 'b', why: 'not-on-queue' },
      { address: 'zz', why: 'not-on-queue' },
      { address: 'c', why: 'stale-heartbeat' },
    ])
  })

  // The measured case: three of nine devnet oracles had heartbeats six to
  // fifteen days old while still listed. Membership is not liveness.
  it('rejects a listed oracle whose heartbeat is fifteen days old', () => {
    const { candidates } = eligible([view('a', { lastHeartbeat: NOW - 1_255_625 })], queue, NOW)
    expect(candidates).toEqual([])
  })
})

describe('selecting an oracle', () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f'].map(cand)
  const alive = async () => true
  const dead = async () => false

  it('round-robins from the start index', async () => {
    for (const [start, want] of [[0, 'a'], [1, 'b'], [7, 'b'], [5, 'f']] as const) {
      const s = await selectOracle({ candidates: all, startIndex: start, probe: alive })
      expect(s.chosen?.address).toBe(want)
    }
  })

  // This is the whole reason the module exists.
  it('skips a gateway that does not answer and takes the next member', async () => {
    const probe = async (uri: string) => !uri.includes('a.example')
    const s = await selectOracle({ candidates: all, startIndex: 0, probe })
    expect(s.chosen?.address).toBe('b')
    expect(s.rejected).toEqual([{ address: 'a', why: 'gateway-silent' }])
  })

  it('probes before committing, so a silent gateway is never requested with', async () => {
    const probed: string[] = []
    const probe = async (uri: string) => {
      probed.push(uri)
      return uri.includes('c.example')
    }
    const s = await selectOracle({ candidates: all, startIndex: 0, probe })
    expect(s.chosen?.address).toBe('c')
    // a and b were probed and refused; nothing past c was touched.
    expect(probed).toHaveLength(3)
  })

  it('tries the member that just failed LAST, not never', async () => {
    const s = await selectOracle({
      candidates: all,
      startIndex: 0,
      probe: async (uri) => uri.includes('a.example'),
      avoid: new Set(['a']),
    })
    // Everything else was probed first and refused, so the avoided one still
    // serves rather than the hour being lost.
    expect(s.chosen?.address).toBe('a')
    expect(s.rejected.map((r) => r.address)).toEqual(['b', 'c', 'd', 'e', 'f'])
  })

  it('returns nobody when no gateway answers, which is a real outcome', async () => {
    const s = await selectOracle({ candidates: all, startIndex: 2, probe: dead })
    expect(s.chosen).toBeNull()
    expect(s.rejected).toHaveLength(6)
    expect(s.rejected.every((r) => r.why === 'gateway-silent')).toBe(true)
  })

  it('returns nobody when the live set is empty', async () => {
    const s = await selectOracle({ candidates: [], startIndex: 0, probe: alive })
    expect(s.chosen).toBeNull()
  })
})
