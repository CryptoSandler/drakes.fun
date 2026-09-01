'use client'

// The live half of /verify: the last 24 hours, checked in the reader's own
// request against the chain.
//
// Caller: `app/verify/page.tsx`.

import { useEffect, useState } from 'react'

interface Row { hour: string; minted: boolean; pieceId: number; point: string; derived: string; agrees: boolean }
interface Report {
  ok: boolean
  why?: string
  cluster?: string
  window?: number
  rows?: Row[]
  agreed?: number
  checked?: number
  repeated?: number[]
  tookMs?: number
}

export function LiveWindow() {
  const [report, setReport] = useState<Report | null>(null)
  const [state, setState] = useState<'running' | 'done'>('running')

  useEffect(() => {
    let alive = true
    fetch('/api/verify/recent', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: Report) => {
        if (alive) {
          setReport(j)
          setState('done')
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setReport({ ok: false, why: e instanceof Error ? e.message : String(e) })
          setState('done')
        }
      })
    return () => {
      alive = false
    }
  }, [])

  if (state === 'running') {
    return <p className="note">Reading the last hours from the chain…</p>
  }
  if (!report || report.why) {
    return <p className="note">This check could not run: {report?.why ?? 'unknown'}</p>
  }

  return (
    <>
      <p className="verdict" data-ok={report.ok ? '1' : '0'}>
        {report.agreed} of {report.checked} agree
        {report.repeated && report.repeated.length > 0
          ? ` · ${report.repeated.length} piece repeated in the window`
          : ' · no piece repeated in the window'}
      </p>
      <div className="tablewrap">
        <table className="rows">
          <thead>
            <tr>
              <th scope="col">Issuance</th>
              <th scope="col">Piece</th>
              <th scope="col">Point the program recorded</th>
              <th scope="col">Point recomputed here</th>
              <th scope="col">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {report.rows?.map((r) => (
              <tr key={r.hour}>
                <td>{r.hour}</td>
                <td>{r.minted ? `#${r.pieceId}` : '—'}</td>
                <td className="num">{r.point}</td>
                <td className="num">{r.derived}</td>
                <td>{r.agrees ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Read from the chain in {report.tookMs} ms, on {report.cluster}. The window is the last{' '}
        {report.window} settlements; the full replay is below.
      </p>
    </>
  )
}
