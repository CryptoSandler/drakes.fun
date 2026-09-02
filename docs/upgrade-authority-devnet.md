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
