// "An hour passed with no settlement" has to reach a human, not a log file
// nobody opens.
//
// Caller: `scripts/crank-loop.ts` wires `telegramSink` (or `consoleSink` when
// no token is configured) into the loop's `onMissed`.
//
// Telegram over email because it is one HTTPS POST with no dependency, no SMTP
// credentials, no deliverability, and it arrives on a phone. The bot token is
// the only secret, and the worst a stolen one can do is post messages to the
// chat it is already in — it grants nothing on chain.
//
// **A doxx note that belongs in the open (CLAUDE.md).** The Telegram account
// that receives these is an account the project's operator reads. It is not
// published anywhere and the bot's owner is not visible to third parties, but
// it is still an account adjacent to the pseudonym, and choosing which one is
// the owner's call rather than ours.

export interface Alert {
  /** One line, the subject. */
  title: string
  /** Lines of detail. Kept short: this is read on a lock screen. */
  lines: string[]
}

export type Sink = (alert: Alert) => Promise<void>

export function render(alert: Alert): string {
  return [alert.title, ...alert.lines].join('\n')
}

/**
 * Posts to a Telegram chat. Returns normally on success and **throws on
 * failure**, so a caller can fall back rather than believe an alert was
 * delivered because nothing complained.
 */
export function telegramSink(args: { token: string; chatId: string; fetchImpl?: typeof fetch }): Sink {
  if (args.token === '' || args.chatId === '') {
    throw new Error('telegram sink needs both a token and a chat id')
  }
  const doFetch = args.fetchImpl ?? fetch
  return async (alert) => {
    const res = await doFetch(`https://api.telegram.org/bot${args.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: render(alert),
        disable_notification: false,
      }),
    })
    if (!res.ok) throw new Error(`telegram: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { ok?: boolean; description?: string }
    // Telegram answers 200 with `ok: false` for a wrong chat id, which is the
    // single most likely misconfiguration here and the one that would otherwise
    // look exactly like a delivered alert.
    if (body.ok !== true) throw new Error(`telegram: ${body.description ?? 'refused'}`)
  }
}

/** Where alerts go when no channel is configured. Never silent. */
export function consoleSink(write: (s: string) => void = (s) => process.stderr.write(s)): Sink {
  return async (alert) => {
    write(`\n=== ALERT ===\n${render(alert)}\n=============\n`)
  }
}

/**
 * Tries each sink in order and stops at the first that succeeds.
 *
 * The console sink belongs last in that list, always. An alerting path whose
 * only channel can fail silently is worse than no alerting, because it is
 * trusted.
 */
export function fallbackSink(sinks: Sink[]): Sink {
  return async (alert) => {
    const failures: string[] = []
    for (const sink of sinks) {
      try {
        await sink(alert)
        return
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    throw new Error(`every alert channel failed: ${failures.join('; ')}`)
  }
}

/**
 * The chat id, asked of Telegram rather than configured.
 *
 * `getUpdates` returns what the bot has recently received, so the operator
 * messages the bot once and the id is discovered. Two refusals rather than a
 * guess, because an alert delivered to the wrong chat is worse than one that
 * fails loudly:
 *
 * - **No updates** — the bot has been spoken to by nobody, or the updates have
 *   aged out (Telegram keeps them ~24 h). Say so; do not fall back to anything.
 * - **More than one chat** — the bot is in several conversations and there is
 *   no basis in the data for picking one. List them and require
 *   `TELEGRAM_CHAT_ID` to settle it.
 *
 * `getUpdates` conflicts with a webhook and with another long-poll consumer, so
 * this is a start-up convenience and `TELEGRAM_CHAT_ID` remains the way to pin
 * it once it is known.
 */
export async function resolveChatId(args: {
  token: string
  fetchImpl?: typeof fetch
}): Promise<{ chatId: string; from: string }> {
  if (args.token === '') throw new Error('resolveChatId needs a token')
  const doFetch = args.fetchImpl ?? fetch
  const res = await doFetch(`https://api.telegram.org/bot${args.token}/getUpdates`)
  if (!res.ok) throw new Error(`telegram getUpdates: HTTP ${res.status}`)
  const body = (await res.json()) as {
    ok?: boolean
    description?: string
    result?: { message?: { chat?: { id?: number; type?: string; username?: string; title?: string } } }[]
  }
  // A 200 with ok:false is how Telegram reports a bad token, and it is the same
  // trap the send path has.
  if (body.ok !== true) throw new Error(`telegram getUpdates: ${body.description ?? 'refused'}`)

  const chats = new Map<string, string>()
  for (const update of body.result ?? []) {
    const chat = update.message?.chat
    if (chat?.id === undefined) continue
    chats.set(String(chat.id), chat.username ?? chat.title ?? chat.type ?? 'chat')
  }

  if (chats.size === 0) {
    throw new Error(
      'telegram returned no updates, so there is no chat id to resolve.\n' +
        'Send the bot any message from the account that should receive alerts, then retry. ' +
        'Telegram drops updates after about 24 hours.',
    )
  }
  if (chats.size > 1) {
    const listed = [...chats].map(([id, name]) => `${id} (${name})`).join(', ')
    throw new Error(
      `telegram has ${chats.size} chats and nothing here can choose between them: ${listed}.\n` +
        'Set TELEGRAM_CHAT_ID to the one that should receive alerts.',
    )
  }
  const [chatId, from] = [...chats][0]!
  return { chatId, from }
}
