/* IronBandit service worker — minimal, network-first.
 *
 * Purpose:
 *  1. Makes the app installable (Chrome requires a registered SW with a fetch
 *     handler before it fires `beforeinstallprompt` / offers "Add to home screen").
 *  2. Network-first for navigations so returning users always get the freshest
 *     HTML (no stale SPA shell after a deploy); falls back to cache when offline.
 *  3. Trägt die App-Version — daraus baut das Frontend die Update-Benachrichtigung
 *     ("Version 1.3.0 verfügbar", siehe src/hooks/useAppUpdate.js).
 *
 * Deliberately NOT precaching hashed assets — Vite fingerprints them, so the
 * network-first HTML always references the current bundle.
 */

/* APP_VERSION wird beim Build aus package.json eingestempelt (Plugin
 * "ironbandit-version-stamp" in vite.config.js). Dadurch ändert sich der Inhalt
 * dieser Datei bei JEDEM Version-Bump — nur dann erkennt der Browser überhaupt
 * einen neuen Service Worker (er vergleicht byteweise). Ohne den Stempel bliebe
 * sw.js identisch und ein Deploy würde keine Update-Meldung auslösen. */
const APP_VERSION = "__APP_VERSION__"
const CACHE = `ironbandit-${APP_VERSION}`

/* WICHTIG: hier ist absichtlich KEIN self.skipWaiting().
 * Der neue Worker bleibt im Zustand "waiting", bis der Nutzer im Banner auf
 * "Jetzt aktualisieren" tippt (→ Nachricht SKIP_WAITING unten). Sonst würde die
 * neue Version sofort übernehmen und ein Reload mitten in einer Eingabe
 * erzwingen. Beim allerersten Install (kein aktiver Worker) aktiviert der
 * Browser ohnehin direkt. */
self.addEventListener("install", () => {})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || typeof data !== "object") return

  // Nutzer hat "Jetzt aktualisieren" gedrückt → warten beenden, aktivieren.
  // Der clients.claim() im activate-Handler löst dann im Tab ein
  // `controllerchange` aus, worauf das Frontend neu lädt.
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting()
    return
  }

  // Version des (u.U. noch wartenden) Workers abfragen — so kann das Banner die
  // neue Versionsnummer nennen, ohne extra Request.
  if (data.type === "GET_VERSION") {
    const port = event.ports && event.ports[0]
    if (port) port.postMessage({ version: APP_VERSION })
  }
})

// Tipp auf eine Benachrichtigung (z.B. "Pause vorbei"): vorhandenes
// IronBandit-Fenster nach vorne holen, sonst die App öffnen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      return win ? win.focus() : self.clients.openWindow(url)
    })
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  // Only handle same-origin GET requests; let the API and cross-origin pass through.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return
  const path = new URL(req.url).pathname
  if (path.startsWith("/api/")) return
  // version.json ist die Deploy-Anzeige — nie aus dem Cache beantworten.
  if (path === "/version.json") return

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a copy of successful responses for offline fallback.
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("/index.html"))
      )
  )
})
