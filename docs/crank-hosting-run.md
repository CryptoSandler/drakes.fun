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
oversight.** Every candidate needs an account with a payment method attached, and
CLAUDE.md is explicit that anything that must be paid is paid by a route the
owner has decided on and that this repository never records which. The owner has
since chosen **Railway Hobby** (D22) and holds the account; the deploy waits on a
token and nothing else.

So the run below was executed **from a developer machine**, with the process, the
scheduler, the retry policy and the alerting exactly as they will be on Railway.
What it measures is the *process*. What it cannot measure is the *host* — and, as
§"the two lost hours" records, the developer machine then demonstrated the
difference at its own expense.

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

Snapshot at 117 hours; the run continues to 250.

| | |
|---|---|
| Hours fired | **117**, indices 166–293 |
| Settled | **115** |
| **Not settled** | **2** — indices 265 and 270 |
| Hours needing a retry | 0 |
| Trigger jitter, 115 of 117 | **−122 ms to +26 ms**, median **+2** |
| Trigger jitter, the other 2 | **+246 s** and **+509 s** |
| Fires later than 5 minutes after the boundary | **1** |

**The median is 2 ms and two hours were lost anyway, and the second fact is the
useful one.**

### The two lost hours were the machine, not the scheduler

Between hours 264 and 265 the process took **297 s** to wake for a 60-second
boundary; between 265 and 270, **561 s**. Its only job in both windows was to
sleep on a `setTimeout`. It was not doing work and it did not crash.

What it was doing was sharing a developer laptop with this session, which in the
same window moved a gigabyte of files, deleted a `target/` directory, and spawned
**one Node process per file** across a few hundred files to sweep the moved tree
for keys. The load average has not been under 2 since.

**One suspect was named and then measured innocent.** `npm run verify` and
`npm run build` were run again afterwards with the hour count taken before and
after: **117 → 120 hours fired, still 2 lost, zero additional cost.** They take
seconds. The starvation came from sustained filesystem work and process churn,
not from compiling — so the useful form of the rule here is *no bulk file
operations and no per-file process spawning while a timed run is in flight*,
which is narrower and more actionable than "no builds".

`~/.claude/GATES.md` already carries the parent rule — *"nothing compiles, builds
or type-checks while a suite is measuring"*, written after this same laptop turned
an 18-minute suite into 110 minutes. **It was broken here in spirit**, by running
the measurement and the heavy work at once, and it cost two issuances on devnet.
The rule is written about suites; a timed run needs it just as much, and this is
the second incident on the same machine.

**None of it is a defect in the cranker, and that is exactly the point of the
batch.** A scheduler cannot be more punctual than the process is scheduled by the
kernel, which is the argument for a host whose one job is to keep this alive on
hardware that is not also building something.

### Two things behaved correctly under a failure nobody designed

1. **The window guard refused to burn fees.** Both lost hours record *"the window
   closed after 1 attempts"*. Waking 8.5 minutes into a 60-second window, the
   loop made one attempt, computed that a retry could not finish before the next
   hour opened, and stopped. There is no re-request for a passed index, so a
   second attempt would have been fees spent on a certainty.

2. **The alert path fired for real, twice.** This was the run's first genuine
   `onMissed`, and it named the right hours:

   ```
   === ALERT ===
   DRAKES: issuance 265 was not settled
   cluster devnet
   1 attempts, window closed
   ```

   No channel was configured at the time, so it fell through to the console
   sink — the fallback behaving as designed rather than a silence. The channel
   exists now (ntfy.sh) and `--alert-test` has delivered on it.

Had `/healthz` been serving, both gaps would have exceeded the two-period
tolerance — 120 s at this rig's period — and answered 503 while the process was
still alive and still believed itself to be working. That is the case the
endpoint exists for, and it is why the verdict is derived from the last fire
rather than from a flag.

### Jitter, honestly

The distribution over the 115 unstarved hours: `-122, -2, -1×9, 0×15, +1×22,
+2×30, +3×23, +4×10, +5, +7, +26` ms. Sub-millisecond scheduling is not being
claimed and is not needed — the requirement was the first five minutes.

Negative jitter is real: `setTimeout` may fire early, and one hour fired 122 ms
early. The program's time check is in whole seconds and the request lands slots
later, so it changes nothing. A comment in `loop.ts` claimed the loop never fires
early; the data said otherwise and the comment was corrected rather than the data
explained away.

### Reproduce the table

The log and the artifacts are in `~/proyectos/evidencia/drakes/2026-09-01-b5/`
(`~/.claude/GATES.md`: evidence lives outside the repository and outside `/tmp`,
one directory per repo).

```sh
cd ~/proyectos/evidencia/drakes/2026-09-01-b5
jq -c 'select(.msg=="hour") | {hour, jitterMs, settled, attempts}' crank.jsonl
```

## The cross-check that matters more than the jitter

Everything this cranker produced was verified by the **chain-reading verifier**
built in the same session, over the program's whole history:

```
source         chain, program 7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs
config         4ooopeJoL2TaBEkKxR89ZqMYE9XafiojZW9suV2caX4m
OK   settled      170
     minted       170
OK   distinct     170  (no piece issued twice)
OK   piece ids    170/170 match the replay
     remaining    3830 of 4000
```

**170 of 170** — the 51 from the two earlier rehearsals plus this run's — agree
with the piece id the program emitted, replayed by an independent implementation
that reads no account of ours and no artifact of ours.

The two hours the busy laptop cost do not appear here at all, and that is
correct: a skipped hour is not a settlement, the index does not advance, and the
permutation is unaffected. The schedule survived them exactly as `DESIGN.md` §2
says it does — which is the same property the B4 rehearsal forced once on
purpose, observed here twice by accident.

Run against this run's published artifacts, the reconciliation additionally names
the 51 earlier hours as absent from *that* directory, and carries on. The tool as
it stood this morning would have cascaded from the first missing hour — the
afternoon that produced D21.

## What this run does NOT establish

Listed plainly, because a run of this kind is easy to over-read.

- **Nothing about a host.** No restart-on-crash was exercised, no log retention,
  no behaviour across a reboot or an OOM. `railway.toml` has never been deployed
  and the unit file has never been loaded by a systemd. The healthcheck was
  driven end-to-end against the real entrypoint, but never by a host acting on
  its 503.
- **Nothing about 24 hours of uptime.** The longest continuous stretch measured
  is under half an hour. The failure this is meant to catch — a process that
  dies quietly at 03:00 — needs a day and a supervisor.
- **The alert path is established in two halves that have not met.** `onMissed`
  fired for real twice and named the right hours, but into the console sink,
  because no channel was configured yet. Separately, `--alert-test` has published
  to the real ntfy topic and the message was read back off it. What has not
  happened is a *missed hour* reaching *the phone* in one motion.
- **Nothing about mainnet scan size.** The rehearsal mint has seven holders.
  This remains the largest untested thing in the whole issuance path, as the B4
  runbook already says.
- **Nothing about oracle scarcity under an adversary.** Every hour found a live
  gateway on the first try, which is a fact about a quiet devnet.

## What to do next, in order

1. The owner creates the Railway service and puts `RAILWAY_TOKEN` in
   `.env.local` (`crank-hosting.md` §3 is the three-line deploy).
2. Subscribe to the ntfy topic on a phone and confirm `--alert-test` lands there.
   It has been verified by reading the message back off the topic, which is not
   the same as a notification arriving.
3. Deploy, then **leave it for a week** — not a day. The claim is "it fires every
   hour, forever", and the only evidence for that is duration.
4. Force a missed hour on purpose — point `RPC_URL` at a dead endpoint for one
   period — and confirm both the alert and a 503 from `/healthz`. An alert path
   that has never delivered to its real channel is not an alert path.
5. **Re-run the jitter measurement on Railway, on a quiet host**, and compare it
   against the 115 unstarved hours here. The number to beat is a median of 2 ms
   and no fire outside the first five minutes; the number that actually matters
   is zero gaps of 300 seconds.
