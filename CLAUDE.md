# Talking to the user

Every message you send to the user starts with the line `[drakes]` on its own,
before anything else, so the user can tell which project is talking when several
Claude Code sessions run in parallel.

**The species is `Drakes`** — dragons — ticker `$DRAKE`, domain `drakes.fun`,
settled by the owner on 2026-09-01 (`docs/decisions.md` D1). The name marks the
species, the way `Quantums` names a species and not a mechanism.

It still lands in exactly three places: **`package.json`, copy, and
`SITE_URL`**. Everything else reads `PROJECT_SLUG`. No wordmark baked into an
image, no name inside a database value, no name in a migration, no ticker in a
constant — not because the name might change, but because a name scattered
through a codebase is a name nobody can ever change.

**Everything written in this repository is in English.** Code, comments, docs,
commit messages, copy. The user is spoken to in Spanish; the repository is not.

# Commit identity

**Every author line must read
`CryptoSandler <294572464+CryptoSandler@users.noreply.github.com>`.** The
`noreply` address is the point: a personal email in the log is a leak that
survives in public history, and rewriting it after a push means rewriting
published commits.

Commits carry **no trailers** — no `Co-Authored-By`, no `Generated with`, no
mention of any model or tool.

## The identity must be LOCAL to the repository

    git config --local user.name
    git config --local user.email

`--local` is the whole point: without it the command prints whatever the
resolution chain produced. A value in `.git/config` is read by every process
that touches the directory, subagents included, unconditionally. The
`includeIf` in `~/.gitconfig` is a *condition*, and a child process that does
not resolve it the way the parent did falls back to the global default — which
is the personal address. The include stays as a net; it is not the source.

**Verified here on 2026-09-01:** both are set in `.git/config`.

## Check each subagent's range the moment it delivers

    git log --format='%an <%ae>' <base>..<head>

Not at the close. By then the commits are made and possibly pushed, and the
cheap fix — `git commit --amend --reset-author` — is gone.

# The no-doxx guard

This project is pseudonymous and its author is not the point. The guard is not a
vibe, it is a list of concrete things that leak, and every one of them has
leaked from a repository like this one before:

- **Commit identity** — covered above.
- **Timezone**. Commit timestamps, a `TZ` in a config, a cron expression written
  in local time, a screenshot with a clock. Schedules are written in UTC.
- **Language**. Spanish in a comment, a variable, a copy string, a test name.
  The rule above is a privacy rule as much as a style one.
- **Personal accounts**. Never sign in to anything with the personal address.
  Vercel, Neon, the domain registrar, the X account, the RPC provider: all of
  them get project credentials or they do not get used.
- **Paid receipts**. An audit invoice, a domain WHOIS, an exchange withdrawal —
  each is a link between the pseudonym and a person. Anything that must be paid
  is paid by a route the owner has decided on, and this repository never records
  which.
- **Reused assets**. A favicon, an avatar, a font licence, a leftover file from a
  sibling project. Cross-project reuse is how two pseudonyms get linked.
- **The chain itself**. A wallet that funded this project from a wallet that
  funded a doxxed one is a permanent public link. Funding paths are the owner's
  decision and are never assumed.

If a change touches any of the above, say so out loud rather than deciding it.

# Before building: one round with no code

**A change to the data model, a change to the on-chain program, or a product
decision of any size, gets an adversarial round before a line is written. Not a
plan — an argument.** Three things are asked for explicitly, and the round is
not closed until all three have answers:

1. **The strongest case AGAINST.** Not caveats, not risks-and-mitigations. The
   version of "this is the wrong thing to build" that would actually change the
   decision if it were true.
2. **The collision with the real code.** What survives, what gets thrown away,
   and — the one that pays for the round — *what does the repo already know that
   the discussion does not.*
3. **An honest recommendation, with standing permission to say the idea is
   wrong.** A round that can only produce "yes, and here is how" produced
   nothing.

The round costs a message. Not having it costs a batch.

# Default posture: lazy senior

Before writing code, climb until a rung holds, and stop at the first one that
does:

1. Does this need to exist at all? Speculative need: skip it, say so in one line.
2. Does this repo already have it?
3. Does the standard library do it?
4. Does a native platform feature cover it? A DB constraint over app code, CSS
   over JS, **a deployed audited on-chain program over a program we write**.
5. Does an already-installed dependency solve it?
6. Can it be one line?

The level is **lite**: build what was asked, and name the lazier alternative in
one line so the choice stays with the user. Nothing gets silently downscoped.

Every deliberate shortcut carries a comment naming its ceiling and its upgrade
path:

    // ponytail: linear scan, index it if the list outgrows a few hundred entries

Four things are never simplified away, at any level: input validation at trust
boundaries, security, error handling that prevents data loss, and accessibility
basics. Laziness governs how much code gets written. It never governs what that
code is allowed to skip.

## Rung 4 is where this project's real decisions get made

The platform here is Postgres and the browser, and it is also **Metaplex Core**,
**Meteora DAMM v2**, and **Switchboard** — deployed, audited, immutable programs
this project uses and does not fork.

Every line of Anchor we write is a line somebody has to audit and nobody can
patch. So the question before writing anything that touches the chain is not
"how do I build this", it is **"which deployed program already is this"** — and
if the answer is none, say so out loud rather than reaching for client-side
enforcement, because client-side enforcement of money is not a lazy version of
the feature, it is a broken version of it.

# Every verdict cites the written norm

**A gate, a critique or a design verdict is made against the normative document
OPEN — DESIGN.md, this file, the spec, the migration, `docs/references.md` —
never against a memory of what it says. A verdict that cannot quote the line has
not earned the right to be a verdict yet: read the document first.**

This cuts both ways. **A citation can be stale.** The rule is not "the document
wins" — it is *open the document, and check it against the code or the chain it
claims to govern.* Where they disagree, one of them is a bug, and saying which
is the verdict.

Memory reliably produces a plausible wrong number. Mint addresses, fee basis
points, config keys, lamport constants and plugin names are all things this
project has written down, and all things a confident answer gets subtly wrong.
Every one of them takes one grep, or one RPC call.

# Every on-chain fact carries the date it was read

`docs/references.md` is the ledger. A mint's authorities, a pool's fee config, a
token's liquidity, a platform's fee schedule — none of these are stable, and all
of them are load-bearing here. A number in a document without a read date is a
number nobody can re-check.

**Before any decision that depends on one, re-read it from the chain.** The
authorities on a mint can change between the spec round and the deploy.

# Decisions with a door

**When the owner is not convinced of a one-way decision — a promise in copy, a
prohibition, a guarantee, anything the product cannot walk back — do not decide
it for them.** Three moves, in order:

1. **Find the neutral wording**: text that neither promises nor forbids, and is
   honest in both futures.
2. **Build the mechanism that fits both.** The code should not need rewriting
   whichever way the policy lands.
3. **Record the policy as the owner's decision** in `docs/decisions.md`, not in
   a commit message.

**The irreversible sentence gets written once, and only when it is asked for
explicitly.** This project has more of these than its siblings, because it makes
a redemption promise: what backs a piece, whether the backing is guaranteed,
whether the program can be upgraded, whether anyone may be refused. None of
those is a promise this repository may make on the owner's behalf.

# A verification that returns nothing needs a control

**Before believing a check that came back empty, grep for something you KNOW is
there. If that does not appear either, the instrument is broken, not the code.**

An all-zero result reads exactly like a clean bill of health, and it is the
shape a broken check takes most often — wrong path, wrong file, empty variable,
a server that answered 302 instead of 200, an RPC that returned `null` because
the account is on a different cluster.

# Verify behaviour, not state

**A snapshot says a thing was true at the instant you looked. It does not say
how often, for how long, or under what conditions — and those are usually the
property that matters.**

When the claim is about a duration, an interval, or a count, the verification
has to span it. This project runs a job every hour, forever. "The draw fired" is
not the claim; "the draw fires every hour and does not drift" is, and a single
successful run is not evidence of it.

## A green run against a tree that no longer exists is not green

A test run reads the working tree as it goes. Edit a file after the run starts
and the result belongs to a tree that is part old and part new, and it reports
green either way. **A run that was overtaken by edits is killed and restarted,
not believed.** Finish a unit, then verify it, then start the next one.

# A status is never an input

**When a state machine derives a status from data, no endpoint and no form
accepts that status from a caller. They move the data; the machine decides the
status.**

A draw is `settled` because a committed seed resolved against a slot the
schedule named — not because a column says so. A piece is `redeemed` because the
chain says it was burned. Neither is a field an admin form may set. When a
transition genuinely does not exist, **write the transition next to the others,
with the same guards.** Do not reach for a bare UPDATE in a route.

# A schema guard is never `==`

**A check that a database, a mint, a program or a config is the RIGHT one is
written as an explicit positive assertion against a known value, never as an
equality against another variable that could itself be empty.**

`if (TEST_DATABASE_URL !== DATABASE_URL)` passes when `DATABASE_URL` is unset,
and then truncates production. `if (mint == expectedMint)` passes when both are
the default pubkey. A relative check cannot answer an absolute question.

Two guards, always, because they answer different questions: an **absolute**
one — this database carries the `disposable_database` stamp, this mint is
literally `pumpCmX...` — catches "wrong target"; a **relative** one catches
"same target twice". The stamp is written by the migrate-test script and
deliberately **not** by a migration: a migration runs everywhere, production
included, which is exactly backwards. It marks an ENVIRONMENT, not a schema.

# Every new module names its caller

**A brief that creates a function, a job, a route or an instruction says who
invokes it. If the answer is "a later task", that task is named. If the answer
is "nothing yet", the brief says so out loud.**

A sibling project shipped two finished, tested, independently reviewed functions
with no caller anywhere in the application. One task built each, a third built
the routes, no brief owned the wiring, so nobody was wrong and the feature did
not exist.

1. **A unit test of a function cannot catch this, and did not.** The test that
   catches it asserts the *wiring*: drive the caller, not the callee, and assert
   the effect. Falsify it by deleting the call.
2. **"Who calls this?" is a review question**, asked of every new module, and
   answered with a file and a line rather than an intention.

This bites hardest on the hourly job. A draw that nobody cranks is a collection
that never issues.

# One worktree per batch

**A batch of work gets its own git worktree and its own branch.** Two batches in
one tree means the one that migrates decides the schema for the one that does
not, and the second fails on a column its code predates — a defect report for a
defect that does not exist.

**A branch that adds a migration runs against its OWN database.** Merge order
follows and is not optional: the branch without migrations merges first; the one
with them rebases on top and re-runs.

**Never `pkill -f vitest`.** It matches every repo on the machine. Kill by PID.

# Migrations

**Never change the SQL of a migration that has already been applied. Add the
next number.** The migrate script records applied versions and skips them, so
editing an applied file fixes the file and nothing else. Every database that ran
the old version keeps the old schema, silently, and the file now lies about what
those databases contain.

`--` comments are the exception, because no database stores one. `COMMENT ON` is
NOT a comment for this purpose — its text lives in the catalog, so changing it
takes the next number like any other DDL.

**A migration comment describes the schema, not the policy some module applies
to it** — the schema is frozen by definition and the policy is not.

# Showing the network before a signature

**Classify to a cluster name. Never pass the upstream URL. If you cannot
classify with confidence, say "unknown" and block the signature.**

The browser only ever talks to `/api/rpc`, so it cannot see which cluster the
proxy is pointed at. A deployment whose RPC points at devnet will show mainnet
on an ordinary origin, and nothing client-side can tell.

1. **The cluster is classified server-side and passed down as a name.** Not the
   URL, not the host, not a fragment of either.
2. **Refusing to sign is the safe failure.** A disclosure that can be silently
   wrong is worse than no disclosure, because it is trusted.

Here that rule is load-bearing twice over, because this project asks people to
sign transactions that **burn an asset irreversibly in exchange for a payout**.

# Money verdicts are read off the chain, never claimed by a caller

1. **A winner is derived, never claimed.** The winner of a draw is whoever the
   published seed and the published snapshot resolve to, recomputable by a
   stranger.
2. **A balance is derived, never claimed.** The reserve is what the chain says
   the vault holds, read at a slot, not a number in our database. The site's
   backing figure is a cache of an on-chain read and is labelled with its slot.
3. **A payout is derived, never claimed.** A piece shows as redeemed because a
   burn and a transfer are on chain, not because a job marked it.

Face 3 is the one that is easy to skip, because the operator is us and we know
what we sent. That is exactly why it is written down: the page is read by the
person who did not send it.

# Nothing in this repository holds a private key that can move the reserve

The reserve is held by a program-derived address whose only outward paths are
instructions with fixed destinations. There is no key that empties it, and
therefore no key that can be stolen, subpoenaed, or lost.

Where a key is unavoidable — cranking the hourly draw, paying transaction fees,
posting to X — it is a key whose total authority is *spending its own SOL on
permissionless instructions*, and the program must be safe in a world where that
key is public. Write the crank so that the worst a stolen crank key can do is
pay for our transactions.

If a future feature needs the server to sign for value, that is a new threat
model and a new conversation, not an implementation detail. Say so out loud
rather than adding a secret to `.env.example`.
