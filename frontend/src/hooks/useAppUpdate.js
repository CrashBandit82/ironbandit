import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../version.js'

// Wie oft ein offener Tab / eine installierte PWA beim Server nachfragt, ob ein
// neuer Service Worker (= neues Deploy) bereitliegt. 60s ist ein guter
// Kompromiss: schnell genug, dass Gerald den Hinweis nach dem Deploy sieht,
// und billig (ein 304/no-store-GET auf /sw.js).
const CHECK_INTERVAL_MS = 60 * 1000

/**
 * Erkennt, ob eine neue App-Version deployt wurde.
 *
 * Mechanik (Standard-PWA-Flow):
 *  1. Der Browser lädt periodisch /sw.js neu (registration.update()). Weil beim
 *     Build die Versionsnummer in sw.js eingestempelt wird, unterscheidet sich
 *     die Datei nach jedem Bump → der Browser installiert den neuen Worker.
 *  2. Der neue Worker ruft KEIN skipWaiting (siehe public/sw.js) und bleibt
 *     deshalb im Zustand `waiting`. Genau das ist unser Signal: eine neue
 *     Version liegt bereit, die alte läuft unverändert weiter.
 *  3. Der wartende Worker wird per MessageChannel nach seiner Version gefragt,
 *     damit das Banner "Version 1.3.0 verfügbar" anzeigen kann.
 *  4. `applyUpdate()` schickt SKIP_WAITING; der Worker aktiviert, ruft
 *     clients.claim() → `controllerchange` → wir laden neu.
 *
 * Neu geladen wird AUSSCHLIESSLICH nach `applyUpdate()` (Flag `reloadingRef`) —
 * niemand verliert eine halb getippte Satz-Eingabe, weil im Hintergrund ein
 * Deploy lief.
 */
export default function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false)
  const [newVersion, setNewVersion] = useState(null)
  const [applying, setApplying] = useState(false)
  const waitingRef = useRef(null)
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let cancelled = false
    let timer = null
    let registration = null

    const askVersion = (worker, onAnswer) => {
      try {
        const channel = new MessageChannel()
        channel.port1.onmessage = (event) => {
          if (!cancelled) onAnswer((event.data && event.data.version) || null)
        }
        worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
      } catch {
        // Kein Beinbruch — dann zeigt das Banner nur "Neue Version verfügbar".
      }
    }

    const announce = (worker) => {
      if (cancelled || !worker) return
      waitingRef.current = worker

      let settled = false
      const reveal = (version) => {
        if (cancelled || settled) return
        settled = true
        // Sonderfall: der wartende Worker hat DIESELBE Version wie das Bundle,
        // das hier gerade läuft. Passiert beim Reload, während schon ein Worker
        // wartete (network-first liefert das neue HTML/JS, der alte Worker ist
        // aber noch aktiv). Es gibt dann nichts zu aktualisieren — ein Hinweis
        // "Version X verfügbar", während X längst läuft, wäre nur verwirrend.
        if (version && version === APP_VERSION) return
        if (version) setNewVersion(version)
        setUpdateReady(true)
      }

      askVersion(worker, reveal)
      // Fallback für Worker ohne GET_VERSION-Handler (z.B. ein noch aktiver
      // Worker aus der Zeit vor diesem Feature): dann eben ohne Versionsnummer.
      setTimeout(() => reveal(null), 1500)
    }

    const check = () => {
      // Im Hintergrund nicht pollen: spart Akku, und beim Zurückkommen prüfen
      // wir sowieso sofort (visibilitychange unten).
      if (!registration || document.visibilityState !== 'visible') return
      registration.update().catch(() => {})
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') check() }

    const onControllerChange = () => {
      // Nur reagieren, wenn der Nutzer das Update selbst ausgelöst hat.
      if (reloadingRef.current) window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return
      registration = reg

      // Fall A: Deploy passierte, während der Tab geschlossen/im Hintergrund war
      // → es wartet schon einer. `controller` prüfen, damit die allererste
      // Installation (noch nie ein Worker aktiv) kein Update-Banner auslöst.
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting)

      // Fall B: Deploy passiert bei offenem Tab → updatefound.
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            announce(reg.waiting || installing)
          }
        })
      })

      timer = setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('online', check)
      check()
    }).catch(() => {})

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', check)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    const worker = waitingRef.current
    setApplying(true)
    reloadingRef.current = true
    if (!worker) {
      window.location.reload()
      return
    }
    worker.postMessage({ type: 'SKIP_WAITING' })
    // Sicherheitsnetz: bleibt `controllerchange` aus (z.B. Worker schon aktiv,
    // oder Browser-Eigenheit), nach 2,5s trotzdem neu laden. Das frische HTML
    // kommt dank network-first ohnehin vom Server.
    setTimeout(() => window.location.reload(), 2500)
  }, [])

  return { updateReady, newVersion, applying, applyUpdate }
}
