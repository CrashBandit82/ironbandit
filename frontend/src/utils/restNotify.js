// Pausen-Ende als System-Benachrichtigung — damit eine gekoppelte Smartwatch
// (Garmin, Apple Watch, Wear OS, …) per Vibration meldet, dass es weitergeht.
// Die Web-App kann keine Uhr direkt ansteuern; die Begleit-App der Uhr leitet
// die Handy-Benachrichtigung weiter. Länge/Stärke der Vibration bestimmt die Uhr.
//
// Die Einstellung gilt pro Gerät/Browser (die Erlaubnis für Mitteilungen ist
// ohnehin gerätegebunden) und wird daher in localStorage gehalten, nicht am Konto.

const KEY = "ironbandit_rest_notify"
const TAG = "ironbandit-rest"

export function restNotifySupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator
}

// iPhone/iPad: Mitteilungen gibt es nur für die auf dem Home-Bildschirm
// installierte App (iOS ≥ 16.4), nicht im normalen Safari-Tab.
export function isIosBrowserTab() {
  const ua = navigator.userAgent || ""
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true
  return ios && !standalone
}

export function restNotifyPermission() {
  return restNotifySupported() ? Notification.permission : "unsupported"
}

export function restNotifyEnabled() {
  try {
    return restNotifySupported() && Notification.permission === "granted" && localStorage.getItem(KEY) === "1"
  } catch { return false }
}

export function setRestNotifyEnabled(on) {
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// Fragt (falls nötig) die Erlaubnis ab und aktiviert die Funktion.
// → "granted" | "denied" | "default" | "unsupported"
export async function enableRestNotify() {
  if (!restNotifySupported()) return "unsupported"
  let perm = Notification.permission
  if (perm === "default") perm = await Notification.requestPermission()
  setRestNotifyEnabled(perm === "granted")
  return perm
}

async function show(title, body) {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification(title, {
    body,
    tag: TAG,             // ersetzt eine noch offene Pausen-Meldung …
    renotify: true,       // … meldet sich aber trotzdem erneut (Vibration auf der Uhr)
    vibrate: [2000],      // Handy (Android); die Uhr nutzt ihr eigenes Muster
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/" },
  })
}

// Am Pausenende aufrufen — tut nichts, wenn nicht aktiviert. Fehler werden
// geschluckt: die Meldung ist ein Zusatz, der Timer selbst muss weiterlaufen.
export function notifyRestDone(title, body) {
  if (!restNotifyEnabled()) return
  show(title, body).catch(() => {})
}

export function sendTestNotification(title, body) {
  return show(title, body)
}
