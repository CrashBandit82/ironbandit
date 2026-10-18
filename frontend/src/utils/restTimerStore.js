// Gemeinsamer Zustand des Pausen-Timers: { endAt (ms), body (Text der Benachrichtigung), done } oder null.
// Liegt außerhalb der Komponenten und zusätzlich in localStorage, damit eine laufende Pause weder beim
// Zuklappen der Übung (die Karte samt Timer wird abgebaut) noch beim Neuladen der App verloren geht —
// Android beendet eine App im Hintergrund gern und lädt sie beim Zurückkehren neu.
// Es gibt immer nur eine Pause; jede RestTimer-Instanz zeigt dieselbe.

const KEY = "ironbandit_rest_timer"
const NACHLAUF_MS = 2000   // so lange bleibt "Pause vorbei!" stehen

function laden() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    // Während die App weg war abgelaufene Pausen nicht wieder anzeigen
    return v && typeof v.endAt === "number" && v.endAt > Date.now() - NACHLAUF_MS ? v : null
  } catch { return null }
}

let zustand = laden()
const abonnenten = new Set()

export function getRest() { return zustand }

export function setRest(next) {
  zustand = next
  try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY) } catch { /* ignore */ }
  abonnenten.forEach(f => f())
}

export function clearRest() { setRest(null) }

export function subscribeRest(f) {
  abonnenten.add(f)
  return () => abonnenten.delete(f)
}
