# Where the cranker runs

The issuance cranker has to fire every hour, forever, starting at mainnet
launch (B8). This is the evaluation behind that choice, the prices and
precision figures it rests on, and the unit file that implements it.

Every figure here carries the date it was read. A number without one is a
number nobody can re-check (CLAUDE.md).

---

## 0. The question is not "which cron", and getting that wrong costs money

The obvious framing is: pick a scheduler whose trigger lands close enough to the
top of the hour. That framing is wrong here, and the reason is on chain.

`issue_at(n) = genesis + n * period` is derived **by the program**, from the
config account. Nothing a host does to a trigger time can make the protocol
drift. What a late trigger costs is the **window**: an hour may only be
requested before the next one opens, `request_issuance` for a given index
succeeds exactly once, and there is no re-request (`DESIGN.md` §2, T11).

So the property worth buying is not trigger precision. It is:

> wake at the boundary, and if the first attempt fails, have enough of the
> window left to try again.

A **process that schedules itself against the on-chain genesis** gets that for
free, and makes the host's own cron precision irrelevant — it wakes with
`setTimeout` at `genesis + n · period`, and measured jitter is milliseconds. The
host's remaining job shrinks to one thing: **keep the process running**.

That reframes the comparison from "scheduling precision" to "supervision,
restart policy, log retention, and price". `src/lib/crank/loop.ts` is that
scheduler and `scripts/crank-loop.ts` is that process.

**Why GitHub Actions was right to reject** (the owner's measurement, ~1h32 of
drift on a sibling project): the delay exceeds the period. A trigger later than
one period does not merely arrive late — it lands in an hour that has already
closed, and the index it was meant to serve can never be requested again. Any
host whose worst-case delay is well under an hour is adequate; below that,
precision buys retry headroom, not correctness.

## 1. The candidates

Read 2026-09-01 unless noted.

### Vercel cron — **disqualified on the current plan, and not by a small margin**

The `sandler` team is on **Hobby** (`list_teams`, 2026-09-01). Vercel's own
limits page (`/docs/cron-jobs/usage-and-pricing`, page dated 2026-07-15):

| | Cron jobs / project | Minimum interval | Scheduling precision |
|---|---|---|---|
| **Hobby** | 100 | **Once per day** | **Per-hour (±59 min)** |
| Pro | 100 | Once per minute | Per-minute |

And, verbatim:

> Cron jobs can only run once per day. Expressions like `0 * * * *` (per-hour)
> or `*/30 * * * *` (every 30 minutes) **will fail deployment**.

> Vercel cannot assure a timely cron job invocation. For example, a cron job
> configured as `0 1 * * *` will trigger anywhere between 1:00 am and 1:59 am.

So an hourly cranker on Hobby does not run late — **it does not deploy.** Even
on Pro (US$20/month/user) it is a poor fit: a cron invokes an HTTP function, and
the crank's unit of work is a request, a wait for the oracle, and a reveal that
must land in the same transaction as the settle. That belongs in a process, not
a request handler. Vercel stays where it is useful, which is the site.

### Render cron jobs

Billing is *"prorated by the second, based on active running time"*, with a
**minimum monthly charge of US$1 per cron job service** (`render.com/docs/cronjobs`).
Render stops an active run after 12 hours, which is not a constraint here.

The documentation **states nothing about how close to the schedule a job
actually starts, and nothing about retries on failure**. That absence is the
finding: an undocumented precision is not a precision, and this project cannot
put "we assume it is prompt" in the place where "the hour was skipped" goes.
Render's background workers are the better product here, and then it is the
persistent-process case below.

### Railway

Hobby is **US$5/month, including US$5 of usage credit**; the subscription is
charged whether or not the credit is consumed
(`docs.railway.com/pricing/plans`). Cron scheduling requires a paid plan, and a
scheduled or long-running service is a container that bills against that usage.

For a process this small, US$5/month buys a supervised container with retained
logs and nothing to patch. **This is the strongest managed option**, and the one
to take if operating a machine is unwelcome.

### A minimal VPS with a systemd service

A shared-vCPU instance from any of the usual European hosts is a few euros a
month, supervised by systemd. Exact current pricing was **not re-read for this
document** and must be before anything is bought — the figure in anyone's head
is the kind of number that is quietly a year out of date.

What it buys that the managed options do not:

- `Restart=always` with `RestartSec`, which is the entire requirement.
- `journalctl -u drakes-crank` — logs, greppable, on a machine we control, with
  a retention policy that is ours.
- No vendor holding the crank key. It is a key whose worst case is public
  (`DESIGN.md` T4), so this is a preference rather than a security argument —
  but it is one fewer party.
- No build step, no container registry, no platform that can change its free
  tier.

What it costs: a machine that needs patching, and one more thing to lose.

## 2. Decided: Railway Hobby

**The owner's vote, 2026-09-01: Railway Hobby.** Account and payment are the
owner's; this repository deploys with a `RAILWAY_TOKEN` from `.env.local` once
one exists, and records nothing about how it is paid.

US$5/month, including US$5 of usage credit, charged whether or not the credit is
consumed (`docs.railway.com/pricing/plans`, read 2026-09-01). For a process this
small that buys a supervised container with retained logs and **no machine to
patch** — which was the argument against the VPS all along: an unpatched box
nobody remembers is worse than five dollars.

**The VPS remains evaluated and not chosen.** Its unit file stays in §4 because
the process is identical either way; only the supervisor changes. Nothing in
`scripts/crank-loop.ts` knows which host it is on.

**Not Vercel cron on any plan**, and not GitHub Actions.

## 3. Railway, ready to deploy

`railway.toml` is committed and the service has never been created. Everything
below is what exists in the repository; **nothing here has been run**, because
the token does not exist yet.

### What the config does, and the two lines that matter

- **`buildCommand = "npm ci --omit=dev"`.** Without it Nixpacks finds
  `npm run build` in `package.json` and builds the whole Next application on a
  service that never serves a page. The site is on Vercel; this is the worker.
- **`numReplicas = 1`, deliberately.** Two crankers on one rig race for the same
  hour. The loser gets "account already exists" on `request_issuance`, retries,
  and spends fees achieving nothing. The program stays correct — an hour settles
  exactly once, structurally — so this is a cost control, not a safety one.
- `restartPolicyType = "ALWAYS"` with `restartPolicyMaxRetries = 0` (unlimited).
  Giving up after N restarts is the shape of an outage that then needs a human
  who is asleep.

### The healthcheck

`/healthz`, served by the process itself on `PORT`.

**The verdict is derived, never set.** There is no `healthy = true` anywhere: the
endpoint compares the instant the loop last woke against the schedule's own
period, and answers **503** past two of them. A boolean flag would keep
reporting healthy from inside a loop that had stopped looping, which is exactly
the state worth catching.

Two periods rather than one, because an hour may legitimately spend its whole
window failing and retrying, and restarting a cranker in the middle of that work
is worse than waiting. It scales with `period_seconds` read from the chain — a
hardcoded two hours would call a devnet rig at a 60-second period perfectly
healthy an hour after it died.

### Variables

Set on the Railway service. None of them is optional except where noted.

| Variable | Value | Why |
|---|---|---|
| `RPC_URL` | the provider endpoint | the only endpoint the crank talks to; the cluster is classified from its genesis hash and a disagreement with the rig refuses to sign |
| `CRANK_KEYPAIR` | `/data/crank.json` | path to the key. Its total authority is spending its own SOL on permissionless instructions (`DESIGN.md` T4) |
| `CRANK_RIG` | `rigs/devnet-rehearsal.json` | the rig file. The mainnet rig does not exist until B3 and B8 |
| `NTFY_TOPIC` | 32 hex characters | one message per hour that closed unsettled. **This value is a password** — see §5. Set it as a Railway variable, never in a file the repo tracks |
| `PORT` | set by Railway | the health endpoint binds it |
| `NIXPACKS_NODE_VERSION` | `22` or higher | `engines.node` is `>=22.18`; type stripping is enabled by default from **22.18.0** and 23.6.0, so a 22.0 fails on the first import (`nodejs.org/api/typescript.html`, read 2026-09-01) |

**A volume is required, mounted at `/data`.** Two things live there and neither
survives a redeploy otherwise:

- The crank key. It is a key whose worst case is public, but losing it means
  funding a new one.
- `snapshots/`. Every value in a published artifact **except the leaf set** is
  recoverable from the `IssuanceSettled` event (D21). The leaf set is not, and
  it is the half a reader cannot rebuild without their own indexer. An ephemeral
  filesystem here loses it permanently, one hour at a time.

### The runbook, for when the token exists

```sh
railway link                                   # pick the project, then the service
railway volume add --mount-path /data          # then upload the crank key to it
railway up --detach                            # builds from railway.toml and starts
```

Then, and this is not optional: `railway logs` until an hour settles,
`curl $RAILWAY_PUBLIC_DOMAIN/healthz` for a 200, and
`node scripts/crank-loop.ts --alert-test` to prove the alert channel reaches a
phone. An alert path that has never delivered an alert is not an alert path.

### What is still blocked

One thing: the token. `railway.toml`, the health endpoint, the alert channel and
the rig are all in the repository and none of them has been run against Railway,
because creating the account and attaching a payment method is the owner's step
— CLAUDE.md is explicit that anything paid is paid by a route the owner decides
and that this repository never records which.

The moment `RAILWAY_TOKEN` is in `.env.local`, §3's three lines are the whole
deploy. Nothing else waits on it.

## 4. The unit file, if the host ever changes

```ini
# /etc/systemd/system/drakes-crank.service
[Unit]
Description=DRAKES issuance cranker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=drakes
WorkingDirectory=/srv/drakes
Environment=NODE_ENV=production
# The schedule is anchored on chain, so the clock only has to be roughly right.
# It is still worth keeping NTP on: a host clock an hour out would have the
# process waiting for a boundary that has already passed.
EnvironmentFile=/etc/drakes/crank.env
ExecStart=/usr/bin/node scripts/crank-loop.ts --rig /etc/drakes/rig.json --out /srv/drakes/snapshots

# The whole supervision requirement, in three lines.
Restart=always
RestartSec=10
# Never give up. The default StartLimitBurst stops restarting after five
# failures in ten seconds, which is exactly the shape of an outage that then
# needs a human who is asleep.
StartLimitIntervalSec=0

# One JSON object per line, so `journalctl -u drakes-crank -o cat | jq` works.
StandardOutput=journal
StandardError=journal

# It signs transactions with a key whose worst case is public, and it needs
# nothing else on the machine.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/srv/drakes/snapshots

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/drakes/crank.env  — mode 0600, owned by drakes
RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
NTFY_TOPIC=...
```

`systemctl enable --now drakes-crank`, then
`journalctl -u drakes-crank -f -o cat`.

## 5. The alert channel

`onMissed` fires once for any hour whose window closed with no settlement, and
sends one message. **ntfy.sh**: a single HTTPS POST, no dependency, no SMTP, no
deliverability question, and it arrives on a phone.

**And no account of any kind.** That is the reason it beat the alternative here
rather than a convenience: there is nothing to sign up for, nothing that links a
person to the project, and nothing that shows an operator's identity to a third
party. A messaging account the project would otherwise have to own is an account
adjacent to the pseudonym, and this removes the question instead of managing it.

### The topic is the password

ntfy's own documentation is blunt about it: *"Since there is no sign-up, the
topic is essentially a password, so pick something that's not easily
guessable"* (read 2026-09-01). Anyone who knows the topic can **read every alert
and publish forgeries into the same channel** — so a forged "issuance 812 was not
settled" is as available to a stranger as a real one is to us.

It is therefore treated as a secret and not as configuration:

- Generated with `openssl rand -hex 16`, and `ntfySink` **refuses anything under
  32 characters**. A short topic is not a weak secret; it is a public channel.
- It lives in `.env.local` and as a Railway variable. It is never committed.
- **Nothing logs it, including the failure paths.** A refused topic produces
  *"NTFY_TOPIC is 5 characters"*, never the value — an error message is the usual
  way a URL leaks into a log a host retains.

Set it up:

```sh
openssl rand -hex 16                     # put it in .env.local as NTFY_TOPIC
node scripts/crank-loop.ts --alert-test  # sends one message, says whether it landed
```

Subscribe at `https://ntfy.sh/<topic>` in a browser, or in the ntfy app.

### Three things about the sink are deliberate

- **A 200 is not a delivery.** The publish endpoint answers with the message it
  stored — `{"id","time","expires","event":"message","topic","title","message"}`
  as `application/json`, verified against the real service 2026-09-01. A 200
  carrying anything else is a request that went somewhere else and said so only
  in its body: a captive portal, a proxy interstitial, or ntfy's own front page,
  which returns 200 with `text/html`. The sink checks `event`, `id`, **and that
  the echoed `topic` is ours** — the last one proves the message landed on our
  channel and not on one a rewritten URL chose.
- **The console sink is always last in the chain and is never removed**, so an
  alert that cannot be delivered is still written somewhere.
- **An alert that fails does not take the cranker down.** The next hour matters
  more than the message.

## 6. The devnet run

See `docs/crank-hosting-run.md`, written after the run, for what was measured
and from where.
