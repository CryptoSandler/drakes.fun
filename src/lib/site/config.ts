// What the front page is pointed at, resolved once, server-side.
//
// Caller: `app/page.tsx`. Nothing here is exposed to the browser: the RPC URL
// in particular never leaves the server, because a deployment whose RPC points
// at devnet would otherwise show mainnet on an ordinary origin and nothing
// client-side could tell (CLAUDE.md, showing the network before a signature).

export interface SiteConfig {
  rpcUrl: string
  programId: string
  config?: string
  /** The survivor array. Without it the gallery cannot know what is issued. */
  survivors?: string
  collectionSize: number
  /**
   * The address whose `$PUMP` balance is the reserve.
   *
   * **Undefined in Phase 1, and that is the honest state rather than a missing
   * setting.** The reserve PDA, `claim_fees` and `redeem` are the Phase 2
   * program (B9). The Phase 1 program holds nothing, which is exactly what
   * makes it deployable before the audit (D8). Until then the page says so,
   * rather than rendering a zero that reads like an empty vault.
   */
  reserveOwner?: string
  pumpMint: string
}

/** `$PUMP`, `docs/references.md`, read 2026-09-01. Token-2022, 6 decimals. */
export const PUMP_MINT = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'

export function readConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  const rpcUrl = env.RPC_URL
  const programId = env.ISSUANCE_PROGRAM
  if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
  if (programId === undefined || programId === '') throw new Error('ISSUANCE_PROGRAM is not set')
  return {
    rpcUrl,
    programId,
    config: env.ISSUANCE_CONFIG || undefined,
    survivors: env.ISSUANCE_SURVIVORS || undefined,
    collectionSize: Number(env.COLLECTION_SIZE ?? 4000),
    reserveOwner: env.RESERVE_OWNER || undefined,
    pumpMint: env.PUMP_MINT || PUMP_MINT,
  }
}
