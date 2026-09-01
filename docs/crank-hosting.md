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

## 2. Recommendation

**A minimal VPS running `scripts/crank-loop.ts` under systemd with
`Restart=always`.** The scheduling lives in the process, anchored to the chain,
so the host is supervising and nothing else.

**The lazier alternative, named so the choice stays with the owner:** Railway
Hobby at US$5/month runs the identical process with no machine to maintain. If
the answer to "who patches the VPS" is "nobody, reliably", take Railway — an
unpatched box we forget about is worse than five dollars.

**Not Vercel cron on any plan**, and not GitHub Actions.

### What is blocked, and why it is the owner's call

**Neither option can be provisioned from this repository.** Render, Railway, Fly
and every VPS host need an account with a payment method attached, and
`flyctl auth whoami` and `vercel whoami` both report no local credentials
(2026-09-01). CLAUDE.md is explicit that anything that must be paid is paid by a
route the owner has decided on, and that this repository never records which.
Creating an account and attaching a card is therefore not a technical step this
work may take on its own.

So this document ends at the unit file, and the devnet rehearsal in §5 ran from
a developer machine rather than from the recommended host. What that rehearsal
does and does not prove is stated there rather than blurred.

## 3. The unit file

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
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

`systemctl enable --now drakes-crank`, then
`journalctl -u drakes-crank -f -o cat`.

## 4. The alert channel

`onMissed` fires once for any hour whose window closed with no settlement, and
sends one message. Telegram, because it is a single HTTPS POST with no
dependency, no SMTP credentials, no deliverability question, and it arrives on a
phone.

Setting it up, and both steps are the owner's:

1. Message `@BotFather`, `/newbot`, keep the token.
2. Send the new bot any message, then read the chat id from
   `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. `node scripts/crank-loop.ts --alert-test` — it sends one message and says
   whether it landed.

Three things about it are deliberate:

- **A Telegram 200 with `ok: false`** — what a wrong chat id returns — is
  treated as a failure. A sink that only checks the HTTP status reports a
  delivered alert nobody received, and that is worse than no alerting because it
  is trusted.
- **The console sink is always last in the chain and is never removed**, so an
  alert that cannot be delivered is still written somewhere.
- **An alert that fails does not take the cranker down.** The next hour matters
  more than the message.

**Said out loud, because it touches the guard (CLAUDE.md):** the Telegram
account that receives these is an account the operator reads. The bot's owner is
not visible to third parties and the chat is private, but it is still an account
adjacent to the pseudonym. Which account that is, is the owner's decision and is
not recorded here.

## 5. The devnet run

See `docs/crank-hosting-run.md`, written after the run, for what was measured
and from where.
