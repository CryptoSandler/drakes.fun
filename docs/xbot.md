# The X bot

One post per closed hour: the piece, the recipient, the slot it was drawn from,
and a link to the page that recomputes it. It reads the chain and posts nothing
it did not read there (B7).

    node scripts/xbot.ts --rig rigs/devnet-rehearsal.json [--limit 24]
                         [--from <hour>] [--out posts.jsonl] [--dry-run]
                         [--cursor <path.json>] [--manifest <path>]

**Caller: the crank host, hourly**, beside the two jobs already in
`docs/crank-hosting.md`. It is deliberately not part of `scripts/crank-loop.ts`:
a poster that shares a process with the cranker is a poster whose backoff can
eat an issuance window, and the window is the one thing the protocol cannot get
back.

---

## What a post says

    DEVNET REHEARSAL — mainnet has not started.

    Drake #2158 issued to 8M2u…tNcp

    Hour 3 — chosen from every $DRAKES holder, in proportion to what they held
    at slot 491550308. Not chosen by us. Recompute it:

    https://drakes.fun/verify/3

and, for an hour that closed without issuing:

    Hour 13 issued nothing.

    The oracle did not reveal inside the hour, so it closed unsettled. The piece
    stays in the collection and the schedule does not shift:

    https://drakes.fun/verify/13

**Four rules, each with a written reason:**

| Rule | Why |
|---|---|
| The cluster marker is the **first line** when it is not mainnet | A rehearsal post that reads like a mainnet one is a lie a screenshot makes permanent (D29, and CLAUDE.md on showing the network). The bot refuses to post at all if it cannot classify the cluster. |
| The recipient is **truncated** | A post is a pointer; the permalink shows the address in full. |
| **No tier**, unless the manifest is committed and ours hashes to it | `placeholderTier` is a stand-in for designing the gallery. Publishing it as a piece's rarity would assert something a reader can check against the manifest and find false (D13). |
| **Nothing about the hoard** | D31: it may not be the subject of a headline, and every post is a headline. |

The copy lexicon (`DESIGN.md` §6) is enforced twice: the corpus scan covers the
source, and a test scans the **output** of the builder, which is what catches a
banned word arriving through a tier or a cluster name.

## The cursor, and why a first run posts nothing

State is one number: the last hour published. Hours only increase and the
program settles each one once, so a watermark is the whole story.

- **It advances after a publish returns, never before.** The failure mode is
  therefore a repeat, not a hole — and a repeat is caught by the platform's own
  duplicate rejection, which the bot reads as "it landed" and steps past.
- **An empty cursor primes and publishes nothing.** A first run against a
  program with 300 settlements behind it would otherwise post 300 times.
  `--from <hour>` is a deliberate backfill.
- **Hours nobody requested move the cursor too.** If the cranker is down longer
  than one window, every hour in that window is permanently absent; without this
  the bot would rescan the same dead hours forever and never reach the ones that
  settled after the outage.

It lives in `indexer_cursor` — the table the event indexer already uses, keyed by
stream — or in a JSON file with `--cursor`. `last_signature` carries the
permalink, because a consumer that works in hours has no signature and the
column is `not null`.

## Rate limits and retries

**No rate limit is written down here, and that is the policy.** X's caps differ
by tier and change; a number in this repository would be a number that goes
quietly wrong. The bot reads `x-rate-limit-reset` from the response it actually
got.

| Response | What happens |
|---|---|
| 429 | The pass **stops**. The cursor stays on the last post that landed, and the next pass resumes. Not an error: the exit code is 0. |
| 5xx | Retried, up to 3 attempts, 2 s then 4 s. Linear, because the next pass is an hour away. |
| 4xx mentioning `duplicate` | Read as "already published". The cursor advances past it. |
| Any other 4xx | The pass stops and **exits 3**, so the host's alerting sees it. |
| 2xx with no `data.id` | Treated as a failure. A 2xx is not a publish — a captive portal, a proxy interstitial or a rewritten host all answer 200 (the lesson `src/lib/crank/alert.ts` learned against ntfy). |

`--limit` (default 24) bounds one pass, so an outage does not become a burst.

## What is verified, and what is not

**Verified:** the OAuth 1.0a signing, against RFC 5849 §3.4.1.1's published
signature base string, character for character, plus an HMAC vector computed by
`openssl` and `python3` rather than recalled. The response handling, against
recorded shapes. The whole path, end to end, over the 303 issuances of the
2026-09-01 devnet rig: one post per issuance account, in hour order, none for
the 3 gaps where no hour was ever requested, the one unsettled hour saying so,
every post inside 280 characters, no banned vocabulary, and a control that
plants a defect and confirms both instruments catch it.

**Not verified:** the request has never been answered by X, because there is no
account (launch runbook O5). The first real post is the first evidence of that
half, and it should be sent by hand with `--limit 1` before the job is put on a
timer.
