import { useEffect, useRef } from 'react'

// Hält den Bildschirm wach, solange `active` true ist (z.B. während eines
// laufenden Workouts). Nutzt die Screen Wake Lock API. Browser ohne Support
// (u.a. älteres iOS-Safari) laufen einfach ohne diese Funktion weiter.
//
// Gotcha: Browser geben den Wake Lock automatisch frei, sobald die Seite in den
// Hintergrund wechselt (Tab-Wechsel, Display aus). Kommt der Nutzer zurück
// (visibilitychange → visible), muss er neu angefordert werden — deshalb der
// visibilitychange-Listener.
export default function useWakeLock(active) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!active) return
    if (!('wakeLock' in navigator)) return

    let cancelled = false

    const request = async () => {
      // Nur anfordern, wenn die Seite sichtbar ist — sonst lehnt der Browser ab.
      if (document.visibilityState !== 'visible') return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        // Wird der Lock vom System freigegeben, Referenz aufräumen.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        // z.B. NotAllowedError bei geringem Akkustand — still weiterlaufen.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        request()
      }
    }

    request()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {})
        sentinelRef.current = null
      }
    }
  }, [active])
}
