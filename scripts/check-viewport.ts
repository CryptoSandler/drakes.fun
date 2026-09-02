// Does anything on these pages force the viewport wider than it is?
//
//   node scripts/check-viewport.ts --base http://localhost:3115 [--widths 360,390]
//
// Caller: the operator, and the close of any batch that touches the site.
// Nothing in the application calls it.
//
// **Why a guard and not an eye.** `html, body { overflow-x: clip }` means an
// element that is too wide produces no scrollbar and no error — the page simply
// **loses its right edge**, silently, at exactly the widths nobody develops at.
// It went unnoticed on a live public page until a 390px capture was read by
// hand (b22), and reading captures by hand is not a check.
//
// **It reports WHICH element**, because `scrollWidth > clientWidth` on its own
// sends you looking through a stylesheet. It walks the DOM for anything whose
// right edge is past the documentElement's.
//
// It drives Chrome over the DevTools protocol with node's own WebSocket: no
// browser-automation dependency for one assertion.

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}
function die(message: string): never {
  process.stderr.write(`${message}\n`)
  return process.exit(1)
}

const base = (flag('base') ?? die('--base <url> is required')).replace(/\/$/, '')
const widths = (flag('widths') ?? '360,390').split(',').map((w) => Number(w.trim()))
const paths = (flag('paths') ?? '/,/verify,/verify/378,/verify/timeline').split(',')
const port = Number(flag('port') ?? 9222)

/** The measurement, run inside the page. */
const PROBE = `(() => {
  const root = document.documentElement
  const limit = root.clientWidth

  // **An element inside its own scroll container is not an overflow.** The
  // command blocks on /verify are \`pre.cmd { overflow-x: auto }\`: the code
  // inside them is deliberately wider than the page and scrolls in its own box.
  // A walk that flags it reports a defect on every page that shows a command,
  // and a guard that cries wolf is a guard somebody turns off.
  const contained = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p)
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        // Only if the CONTAINER itself fits. A scroll box that is itself too
        // wide is the defect, and its children should not hide behind it.
        if (p.getBoundingClientRect().right <= limit + 1) return true
      }
    }
    return false
  }

  const over = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.right > limit + 1 && r.width > 0 && !contained(el)) {
      over.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 40)) || '',
        right: Math.round(r.right),
        width: Math.round(r.width),
      })
    }
  }
  over.sort((a, b) => b.width - a.width)
  return JSON.stringify({ scrollWidth: root.scrollWidth, clientWidth: limit, over: over.slice(0, 5) })
})()`

interface Probe {
  scrollWidth: number
  clientWidth: number
  over: { tag: string; cls: string; right: number; width: number }[]
}

/**
 * One browser per width, sized with `--window-size`.
 *
 * **Not `Emulation.setDeviceMetricsOverride`.** With `mobile: true` it laid
 * every page out at 980 — the width a page falls back to when its viewport meta
 * is ignored — and the guard reported 8 of 8 fitting, which is the vacuous pass
 * this whole file exists to prevent. With `mobile: false` it reported 560 for a
 * requested 360. The window size is what actually decides the layout viewport
 * here, and it is what the screenshots that found the defect used.
 */
async function measure(width: number, paths: string[]): Promise<Map<string, Probe>> {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--window-size=${width},900`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/claude-viewport-${width}`,
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    interface Target { webSocketDebuggerUrl?: string }
    let target: Target | undefined
    for (let attempt = 0; attempt < 60 && target === undefined; attempt += 1) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[]
        target = list.find((t) => t.webSocketDebuggerUrl !== undefined)
      } catch {
        await sleep(250)
      }
    }
    if (target === undefined) die('chrome never opened a debugging target')

    const ws = new WebSocket(target.webSocketDebuggerUrl!)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })

    let id = 0
    const pending = new Map<number, (value: Record<string, unknown>) => void>()
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown> }
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)!(message.result ?? {})
        pending.delete(message.id)
      }
    })
    const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
      id += 1
      const mine = id
      return new Promise((resolve) => {
        pending.set(mine, resolve)
        ws.send(JSON.stringify({ id: mine, method, params }))
      })
    }
    await send('Page.enable')
    await send('Runtime.enable')
    // **The window is not the viewport here.** macOS Chrome refuses a window
    // narrower than ~560px, headless included, so `--window-size=360` lays out
    // at 560 and every verdict would be about a viewport nobody asked for. The
    // emulation override is what actually sets the layout viewport, and it has
    // to be applied AFTER the page is enabled and re-applied after each
    // navigation or the page keeps the window's width.
    const applyViewport = async () => {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: true,
        screenWidth: width, screenHeight: 900,
      })
    }
    await applyViewport()

    const results = new Map<string, Probe>()
    for (const path of paths) {
      await send('Page.navigate', { url: `${base}${path}` })
      await applyViewport()
      // Wait for the layout rather than guessing at it: a fixed sleep raced the
      // navigation and measured about:blank, which reports a clientWidth of 1.
      let value: string | undefined
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const ready = await send('Runtime.evaluate', {
          expression: "document.readyState === 'complete' && document.documentElement.clientWidth > 1",
          returnByValue: true,
        })
        if ((ready.result as { value?: boolean } | undefined)?.value === true) {
          // Re-applied once the document exists: an override set against
          // about:blank does not survive the navigation that follows it.
          await applyViewport()
          await sleep(150)
          const evaluated = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true })
          value = (evaluated.result as { value?: string } | undefined)?.value
          if (value !== undefined) break
        }
        await sleep(250)
      }
      if (value === undefined) die(`${path} at ${width}: the page never finished laying out`)
      results.set(path, JSON.parse(value) as Probe)
    }
    ws.close()
    return results
  } finally {
    chrome.kill()
    await sleep(400)
  }
}

let failures = 0
let checked = 0
for (const width of widths) {
  const results = await measure(width, paths)
  for (const [path, probe] of results) {
    checked += 1
    // The control, per page: if the browser did not lay out at the width asked
    // for, every verdict about it is about a viewport nobody requested. A few
    // pixels of chrome are tolerated; a different viewport is not.
    if (Math.abs(probe.clientWidth - width) > 2) {
      die(
        `${path}: asked for ${width}px and the page laid out at ${probe.clientWidth}px. ` +
          'The window size did not take, so this run proves nothing.',
      )
    }
    // **`scrollWidth <= clientWidth` cannot fail on this site, and that is not
    // good news.** `html, body { overflow-x: clip }` removes the scroll
    // container, so `scrollWidth` never grows past the viewport no matter how
    // far the content runs. Verified by planting a 300px overflow in the
    // masthead: the ratio said the page fitted while the element hung 300px
    // past the edge. The verdict is therefore the element walk, and the ratio
    // is reported beside it because when it DOES exceed, it is real.
    const fits = probe.over.length === 0 && probe.scrollWidth <= probe.clientWidth
    out(
      `${fits ? 'OK  ' : 'FAIL'} ${String(width).padStart(4)}px ${path.padEnd(18)} ` +
        `scrollWidth ${probe.scrollWidth} · clientWidth ${probe.clientWidth} · ` +
        `${probe.over.length} element${probe.over.length === 1 ? '' : 's'} past the edge`,
    )
    if (!fits) {
      failures += 1
      for (const el of probe.over) {
        out(`       ${el.tag}${el.cls === '' ? '' : `.${el.cls}`} — ${el.width}px wide, right edge at ${el.right}`)
      }
    }
  }
}

out('')
if (checked !== widths.length * paths.length) {
  die(`${checked} of ${widths.length * paths.length} pages were measured; this proves nothing`)
}
if (failures > 0) {
  die(`${failures} of ${checked} clip. \`overflow-x: clip\` means nobody sees a scrollbar; they lose the right edge.`)
}
out(`${checked} of ${checked} fit their viewport at ${widths.join(', ')}px`)
