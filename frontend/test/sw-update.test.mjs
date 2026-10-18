/* End-to-End-Test der Update-Benachrichtigung (echtes Chromium, echter Service
 * Worker). Prüft den Ablauf, den Gerald nach einem Deploy erlebt:
 *
 *   1. Version A ist installiert, Tab offen und vom SW kontrolliert.
 *   2. Deploy von Version B (neue Dateien auf dem "Server").
 *   3. Der offene Tab erkennt das von selbst (Polling, ohne Reload) und zeigt
 *      "Version B verfügbar" — ohne die Seite neu zu laden.
 *   4. Klick auf "Jetzt aktualisieren" → Seite läuft danach auf Version B.
 *
 * Gefahren wird ein eigener Static-Server + der swtest.html-Harness (rendert nur
 * UpdateBanner mit dem echten Hook), damit kein Login/Backend nötig ist und die
 * Produktion nicht angefasst wird.
 *
 * Aufruf: node test/sw-update.test.mjs
 */
import { createServer } from 'node:http'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { cpSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const FRONTEND = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WORK = process.env.SWTEST_WORK || '/tmp/swtest'
const SERVE = join(WORK, 'serve')
const PORT = 8099
const ORIGIN = `http://127.0.0.1:${PORT}`
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(ok, label, extra = '') {
  log(`${ok ? '  ✓' : '  ✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

// ── Builds vorbereiten ────────────────────────────────────────────────────────
// Wichtig: der Build läuft asynchron (execFile + await), NICHT execFileSync —
// sonst blockiert er den Event-Loop dieses Prozesses und damit den Static-Server
// darunter. Ein wartender Polling-Request des Browsers würde dann erst nach dem
// Build beantwortet und die gemessene Erkennungszeit wäre künstlich ~0s.
const execFileAsync = promisify(execFile)

async function buildVersion(version) {
  const pkgPath = join(FRONTEND, 'package.json')
  const original = readFileSync(pkgPath, 'utf-8')
  const patched = original.replace(/"version": "[^"]+"/, `"version": "${version}"`)
  const out = join(WORK, `dist-${version}`)
  writeFileSync(pkgPath, patched)
  try {
    await execFileAsync('npx', ['vite', 'build', '--config', 'vite.swtest.config.mjs'], {
      cwd: FRONTEND,
      env: { ...process.env, SWTEST_OUT: out },
    })
  } finally {
    // package.json immer zurücksetzen — der Test darf den Repo-Stand nicht ändern.
    writeFileSync(pkgPath, original)
  }
  return out
}

// Der eigentliche "Deploy" ist nur noch ein Verzeichnis-Tausch (Millisekunden),
// damit die Zeitmessung wirklich die Erkennungsdauer im Browser abbildet.
function serveBuild(dir, version) {
  rmSync(SERVE, { recursive: true, force: true })
  mkdirSync(SERVE, { recursive: true })
  cpSync(dir, SERVE, { recursive: true })
  log(`  → deployed v${version}`)
}

// ── Static-Server: sw.js/version.json bewusst no-store, wie in nginx.conf ─────
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  let file = join(SERVE, rel === '/' ? 'swtest.html' : rel)
  if (!existsSync(file)) file = join(SERVE, 'swtest.html')
  const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }
  if (rel === '/sw.js' || rel === '/version.json') headers['Cache-Control'] = 'no-store, must-revalidate'
  else headers['Cache-Control'] = 'no-cache'
  res.writeHead(200, headers)
  res.end(readFileSync(file))
})

async function main() {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })

  // Alle drei Builds vorab erzeugen — danach ist ein "Deploy" nur ein
  // Verzeichnis-Tausch und verzerrt die Messung nicht.
  log('\n[0] Builds vorbereiten (1.2.2, 1.3.0, 1.3.1)')
  const builds = {}
  for (const v of ['1.2.2', '1.3.0', '1.3.1']) builds[v] = await buildVersion(v)

  log('\n[1] Version 1.2.2 deployen und Tab öffnen')
  serveBuild(builds['1.2.2'], '1.2.2')
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // --lang: sonst erkennt i18next im Headless-Chromium "en" und der Test
    // vergleicht gegen die englischen Strings.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=de-DE'],
  })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' })
  page.on('console', (m) => { if (m.type() === 'error') log('    [browser error]', m.text()) })
  // ?lng=de: i18next-Sprachwahl fest auf Deutsch (Headless-Chromium meldet sonst
  // "en", und Screenshots/Assertions sollen die deutsche UI zeigen).
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) // iPhone-Format
  await page.goto(`${ORIGIN}/swtest.html?lng=de`, { waitUntil: 'load' })

  const runningVersion = () =>
    page.$eval('#running-version', (el) => el.dataset.version).catch(() => null)

  check((await runningVersion()) === '1.2.2', 'Tab läuft auf v1.2.2')

  // Auf Kontrolle durch den SW warten (clients.claim() im activate-Handler).
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 })
  check(true, 'Service Worker kontrolliert den Tab')

  const bootId = await page.evaluate(() => window.__harnessBootId)
  check(!(await page.$('[role="status"]')), 'kein Update-Banner ohne neues Deploy')

  log('\n[2] Version 1.3.0 deployen — Tab bleibt offen, KEIN Reload')
  serveBuild(builds['1.3.0'], '1.3.0')

  log('    warte auf die automatische Erkennung (bis zu 150s)…')
  const detectStart = Date.now()
  await page.waitForSelector('[role="status"]', { timeout: 150000, polling: 500 })
  log(`    Banner erschien ${((Date.now() - detectStart) / 1000).toFixed(1)}s nach dem Deploy` +
      ` (Polling-Intervall 60s, Tab wurde NICHT neu geladen)`)

  const shotDir = process.env.SWTEST_SHOTS
  if (shotDir) {
    await page.screenshot({ path: join(shotDir, 'update-banner-dark.png') })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await sleep(200)
    await page.screenshot({ path: join(shotDir, 'update-banner-light.png') })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    log(`    Screenshots in ${shotDir}`)
  }

  const bannerText = await page.$eval('[role="status"]', (el) => el.innerText.replace(/\n+/g, ' | '))
  check(bannerText.includes('1.3.0'), 'Banner nennt die neue Versionsnummer', bannerText)
  const buttonLabel = await page.$eval('[role="status"] button', (el) => el.innerText.trim())
  check(
    ['Jetzt aktualisieren', 'Update now'].includes(buttonLabel),
    'Banner hat den Update-Button',
    buttonLabel,
  )
  check((await runningVersion()) === '1.2.2', 'Tab läuft noch unverändert auf v1.2.2 (nicht blockiert)')
  check(
    (await page.evaluate(() => window.__harnessBootId)) === bootId,
    'kein automatischer Reload — der Nutzer entscheidet',
  )

  // Eingabe-Schutz: eine laufende Eingabe darf nicht verloren gehen.
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'mid-typing'
    document.body.appendChild(input)
    input.value = '80kg x 8'
  })
  await sleep(3000)
  check(
    (await page.$eval('#mid-typing', (el) => el.value)) === '80kg x 8',
    'laufende Eingabe bleibt erhalten, solange nicht geklickt wird',
  )

  log('\n[3] "Jetzt aktualisieren" klicken')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }),
    page.click('[role="status"] button'),
  ])
  await page.waitForSelector('#running-version', { timeout: 15000 })
  const after = await runningVersion()
  check(after === '1.3.0', 'Tab läuft nach dem Klick auf v1.3.0', `gemessen: ${after}`)
  check(!(await page.$('[role="status"]')), 'Banner ist nach dem Update weg')

  const swVersion = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return new Promise((res) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = (e) => res(e.data.version)
      reg.active.postMessage({ type: 'GET_VERSION' }, [ch.port2])
      setTimeout(() => res(null), 3000)
    })
  })
  check(swVersion === '1.3.0', 'aktiver Service Worker ist die neue Version', `gemessen: ${swVersion}`)

  // Phase 4 isoliert das Polling: der Tab wird ab jetzt NICHT mehr angefasst
  // (kein evaluate, kein Klick), es zählt nur der Timer aus useAppUpdate.
  log('\n[4] Polling isoliert prüfen: Version 1.3.1 deployen, Tab nicht anfassen')
  const bootBefore = await page.evaluate(() => window.__harnessBootId)
  serveBuild(builds['1.3.1'], '1.3.1')
  const pollStart = Date.now()
  await page.waitForSelector('[role="status"]', { timeout: 120000, polling: 500 })
  const pollSeconds = (Date.now() - pollStart) / 1000
  log(`    Banner erschien ${pollSeconds.toFixed(1)}s nach Deploy-Ende`)
  check(pollSeconds > 0.5, 'Erkennung kam vom Hintergrund-Polling (nicht von einem Reload)')
  check(pollSeconds < 90, 'Erkennung innerhalb eines Polling-Zyklus (60s + Puffer)')
  const banner4 = await page.$eval('[role="status"]', (el) => el.innerText.replace(/\n+/g, ' | '))
  check(banner4.includes('1.3.1'), 'Banner nennt v1.3.1', banner4)
  check(
    (await page.evaluate(() => window.__harnessBootId)) === bootBefore,
    'Tab lief die ganze Zeit ohne Reload weiter',
  )

  // Phase 5: Übergangsfall. Reload, WÄHREND 1.3.1 noch wartet — dank
  // network-first lädt der Tab dann bereits das 1.3.1-Bundle, der wartende
  // Worker ist aber ebenfalls 1.3.1. Es gibt nichts zu aktualisieren, also darf
  // kein Banner erscheinen.
  log('\n[5] Reload mit wartendem Worker gleicher Version → kein Hinweis')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#running-version', { timeout: 15000 })
  check((await runningVersion()) === '1.3.1', 'Tab läuft nach Reload auf v1.3.1')
  const stillWaiting = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg && !!reg.waiting
  })
  check(stillWaiting, 'ein Worker wartet weiterhin (Voraussetzung des Tests)')
  await sleep(4000) // > 1,5s-Fallback im Hook
  check(!(await page.$('[role="status"]')), 'kein irreführendes Banner für die schon laufende Version')

  await browser.close()
  server.close()

  log(`\n${failures === 0 ? '✅ alle Checks bestanden' : `❌ ${failures} Check(s) fehlgeschlagen`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\n❌ Test abgebrochen:', err)
  process.exit(1)
})
