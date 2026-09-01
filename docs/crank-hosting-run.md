# The cranker's devnet run, 2026-09-01

What was measured, from where, and — the part that matters more — **what this
run does not establish.** `docs/crank-hosting.md` carries the evaluation and the
recommendation; this is the evidence, and it is deliberately narrower than the
question that was asked.

---

## What was asked for, and what was delivered

The brief asked for the cranker to run **24 hours on devnet from the
recommended host**, reporting trigger jitter per hour.

**The host half was not delivered, and the reason is a rule rather than an
oversight.** Every candidate — Render, Railway, Fly, any VPS — needs an account
with a payment method attached. `flyctl auth whoami` and `vercel whoami` both
reported no local credentials on 2026-09-01, and CLAUDE.md is explicit that
anything that must be paid is paid by a route the owner has decided on and that
this repository never records which. Provisioning is therefore the owner's step,
not this work's.

So the run below was executed **from a developer machine**, with the process,
the scheduler, the retry policy and the alerting exactly as they would be under
systemd. What it measures is the *process*; what it cannot measure is the
*host*.

## The rig

The same program as the 48-hour rehearsal, unchanged and not redeployed.

| | |
|---|---|
| Cluster | devnet, classified from the genesis hash |
| Program | `7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs` |
| Config | `4ooopeJoL2TaBEkKxR89ZqMYE9XafiojZW9suV2caX4m` |
| Crank key | `Gp9vs7d815DG4zqkNTKqb4FtHr3GXp7s957sZTH69Zse` |
| Period | **60 s**, read from the config account and checked against the rig's literal |

**The period is why this is not a 24-hour run, and the reason is worth stating
rather than working around.** The rehearsal config carries `period_seconds = 60`
(D15: the value is written once by `initialize`, so the rehearsal runs the same
bytecode mainnet will). The config PDA is seeded with a fixed seed, so a program
has exactly one, and a 3,600-second schedule on this program would mean a new
deployment — which is not "the same program".

Running 24 real hours against a 60-second period is 1,440 issuances at
~0.0048 SOL each, about 6.9 SOL. The crank key holds 2.16. So the run is
**bounded by issuances rather than by wall clock**, and it fires at the schedule
the chain actually names.

That trade is defensible on its own terms: the claim under test is *"the process
wakes at the boundary"*, and 250 samples test it far better than 24 do.

## What the run shows

Snapshot taken while the run was still going; the run continues to 250 hours.

| | |
|---|---|
| Hours fired | **19** (indices 166–184, consecutive) |
| Settled | **19 / 19** |
| Hours needing a retry | **0** |
| Trigger jitter | **−2 ms to +2 ms**, median **0** |
| Fires later than 5 minutes after the boundary | **0** |
| Wall clock | 18.0 minutes |

Jitter distribution, in milliseconds: `{-2: 1, -1: 5, 0: 8, +2: 5}`.

**The jitter is milliseconds because the scheduling is not the host's job.** The
process computes `genesis + n · period` from the config account and sleeps to
it. There is no external trigger to be imprecise. This is the whole argument of
D22 showing up as a measurement: the requirement was "inside the first five
minutes", and the answer is off by single-digit milliseconds because the
question was moved.

**Negative jitter is real and is fine.** `setTimeout` may fire a fraction early.
The program's own time check is in whole seconds and the request lands slots
later, so a 2 ms head start changes nothing. A comment in `loop.ts` claimed the
loop never fires early; the data said otherwise and the comment was corrected
rather than the data explained away.

### Reproduce the table

```sh
jq -c 'select(.msg=="hour") | {hour, jitterMs, settled, attempts}' crank.jsonl
```

## The cross-check that matters more than the jitter

The 21 issuances this cranker produced were then verified by the **chain-reading
verifier** built in the same session, against the whole history of the program:

```
OK   settled      72
OK   distinct     72  (no piece issued twice)
OK   piece ids    72/72 match the replay
     remaining    3928 of 4000
GAP  published    issuances 3, 4, 6 … 55 are missing from the published set
     The replay above did not need them and is unaffected.
```

Two things are being demonstrated at once:

1. **72 of 72** — the 51 from the two earlier rehearsals plus this run's — agree
   with the piece id the program emitted, replayed by an independent
   implementation that reads no account.
2. **The gap list is correct and harmless.** This run wrote artifacts only for
   its own hours, so the earlier 51 are genuinely absent from *this* directory.
   The tool names them and carries on. The tool as it stood this morning would
   have reported a cascade of mismatches from the first missing hour onward —
   which is exactly the afternoon that produced D21.

## What this run does NOT establish

Listed plainly, because a run of this kind is easy to over-read.

- **Nothing about a host.** No restart-on-crash was exercised, no log retention,
  no behaviour across a reboot or an OOM. `Restart=always` is written in a unit
  file that has never been loaded by a systemd.
- **Nothing about 24 hours of uptime.** The longest continuous stretch measured
  is under half an hour. The failure this is meant to catch — a process that
  dies quietly at 03:00 — needs a day and a supervisor.
- **Nothing about the alert path in anger.** No hour was missed, so `onMissed`
  never fired against a real channel. Its failure modes are covered by unit
  tests, including the Telegram 200-with-`ok:false` case, and `--alert-test`
  sends a real message once a token exists.
- **Nothing about mainnet scan size.** The rehearsal mint has seven holders.
  This remains the largest untested thing in the whole issuance path, as the B4
  runbook already says.
- **Nothing about oracle scarcity under an adversary.** Every hour found a live
  gateway on the first try, which is a fact about a quiet devnet.

## What to do next, in order

1. The owner provisions a host and attaches billing (`crank-hosting.md` §2).
2. `--alert-test` against a real Telegram bot.
3. Deploy, `systemctl enable --now`, and **leave it for a week** — not a day.
   The claim is "it fires every hour, forever", and the evidence for that is
   duration.
4. Force a missed hour on purpose (stop the RPC, or point it at a dead endpoint
   for one period) and confirm the message arrives on a phone. An alert path
   that has never delivered an alert is not an alert path.
