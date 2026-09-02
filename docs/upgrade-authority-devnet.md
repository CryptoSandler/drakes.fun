# The upgrade authority in the multisig — devnet, 2026-09-02

Launch step **C1b**, rehearsed against the program actually deployed on devnet.

## The window C1b exists to close

Between deploying to mainnet and revoking the upgrade authority, the program is
**mutable while holding real value**. D8 makes that window acceptable — the
Phase 1 program holds nothing itself — but "acceptable" is not "held by one
key". C1b puts the authority in the same 2-of-3 that holds everything else.

## What was run

    program      7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs
    programdata  6FBMaLa6nJugL1rB1wXCm3MTx8mUbgfzFdb4gNkqX8Wt
    authority    Gp9vs7d815DG4zqkNTKqb4FtHr3GXp7s957sZTH69Zse   (one key)

    set-upgrade-authority  Y2Kx3aMWozGcE5Fa4EdjHndpfxDwJiSu11ZZPwTHcP2...
    authority now          8MxzqgfotX2vms5SnopoNpx7VKNtY5E7DgLYoFGrcL6Q   = the vault

Verified by reading the **programdata** account rather than the CLI's word for
it: 4-byte tag, 8-byte slot, 1-byte option, authority at offset 13.

## And the vault can use it

An authority parked in a multisig nobody has exercised is a guess. So a **real
2-of-3** executed a BPF-loader instruction signed by the vault:

    proposal 3   two approvals   executed 2d3SCNDQBMFVXqLrWqhREBYmYZ9namvZ...
    authority after: still the vault

## What that proves, and what it does not

`SetAuthority` and `Upgrade` are the **same program**, and both check the same
thing: the current authority signing over the programdata account. So the
ceremony — vault → proposal → loader — is proven, and it is the part that could
have been wrong.

**A full `Upgrade` WAS run on 2026-09-02** — see the end of this file. What
follows was written before that and is left as the record of what the first
rehearsal did and did not cover.

**A full `Upgrade` was not run.** It additionally needs a buffer holding the new
program, and for this 352,989-byte program that is **2.46 SOL of rent** on a
devnet wallet holding 0.09. Devnet airdrops were rate-limited on every attempt.

**That gap is a cost, not an unknown.** What an `Upgrade` adds over what ran
here is buffer handling, not an authority question.

## A consequence worth stating

**The devnet program's upgrade authority is now the disposable rehearsal
vault.** Redeploying it needs a 2-of-3 from that keystore. That is the correct
end state for the rehearsal and it does mean the crank key no longer controls
the program.

## Re-running it

```sh
RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" \
  node scripts/rehearse-upgrade-authority.ts
```

It refuses any cluster but devnet, and refuses to run at all if the authority
has already been revoked.

---

## The gap is closed — a real `Upgrade`, 2026-09-02

The section above says a full `Upgrade` was not run because the buffer's rent
was 2.46 SOL and the wallet held 0.09. It has now been run, with the program
change of D32 as its payload.

**Where the SOL came from, because it is the thing that blocked it twice.** Both
faucets were exhausted for the day after one 2 SOL grant. The rest was
consolidated rather than requested: **0.092 SOL withdrawn from an idle Irys
balance** left over from the B2 upload, and **0.124 SOL swept** from two
`solana-devnet-moneypath` keys, leaving each enough to keep signing. Total
2.260903 against a buffer rent of **2.156089**.

    buffer            HLYyB9Y5eNM9mUgMiMaM1qmAqFL4oEjw6bDJdB6m1xD3
    buffer authority  8MxzqgfotX2vms5SnopoNpx7VKNtY5E7DgLYoFGrcL6Q  (the vault)
    program bytes     340,288

    proposal 4   two approvals   executed
      5b1U5uMyfaekFYH1Pagx4QnXaPJVEhwZ6nuMGSpQh4KVPU1NAAScuwzAGxjs731VrBguGQua4YwBH6o2Q7SBHxj4

    last deployed slot   491548588  ->  492036791
    authority after      still the vault

**And the bytes on chain are the bytes that were built.** `solana program dump`
against the deployed program returns 352,944 bytes, of which the first **340,288
are byte-identical to the local `issuance.so`** (`sha256
8aa3808f0ffb2ff7b2ff480285be0e50b0c68013cebf028b1737f70e6af715bd`) and the
remainder is zero padding to the programdata's original capacity.

**The buffer's rent came back.** The wallet went 2.260903 → 2.259203, so the
whole ceremony cost 0.0017 SOL in fees. The 2.16 SOL was never spent, only
parked — which is worth knowing before the mainnet upgrade is budgeted.

`scripts/rehearse-program-upgrade.ts` is the script, and it refuses any cluster
but devnet.
