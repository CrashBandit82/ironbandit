import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { notifyRestDone } from "../utils/restNotify"
import { getRest, setRest, clearRest, subscribeRest } from "../utils/restTimerStore"
import Icon from "./Icon"

const FALLBACK_SECONDS = 90
const LIVE_STEP = 15  // ±-Schritt zum Anpassen des laufenden Countdowns

// defaultSeconds = bevorzugte Pausendauer; wird verwendet, wenn start() ohne
// explizite Sekunden aufgerufen wird. notifyBody = Text der Benachrichtigung
// am Pausenende (z.B. "Bankdrücken – Satz 3"), siehe utils/restNotify.js.
//
// Der Countdown läuft gegen eine feste Endzeit (endAt) statt sekundenweise
// herunterzuzählen: gedrosselte Timer (Handy bremst die App im Hintergrund)
// verschieben so nur die Anzeige, nicht das Pausenende. Das Ende selbst hat
// einen eigenen Timeout auf genau diesen Zeitpunkt.
//
// Die Pause selbst liegt in utils/restTimerStore.js (+ localStorage), nicht in der Komponente: sie überlebt
// so das Zuklappen der Übung und ein Neuladen der App. Mehrere Instanzen (Übungskarte, Übersicht) zeigen
// dieselbe Pause; Vibration/Benachrichtigung löst nur die Instanz aus, die das Ende als Erste vermerkt.
const RestTimer = forwardRef(function RestTimer({ defaultSeconds = FALLBACK_SECONDS, notifyBody }, ref) {
  const { t } = useTranslation()
  const rest = useSyncExternalStore(subscribeRest, getRest)
  const endAt = rest ? rest.endAt : null
  const done = !!rest?.done
  const [now, setNow] = useState(() => Date.now())
  const notifyBodyRef = useRef(notifyBody)
  notifyBodyRef.current = notifyBody

  useImperativeHandle(ref, () => ({
    start: (seconds) => {
      const s = seconds != null ? seconds : defaultSeconds
      setNow(Date.now())
      setRest({ endAt: Date.now() + s * 1000, body: notifyBodyRef.current || null, done: false })
    }
  }), [defaultSeconds])

  // Anzeige-Takt (nur solange ein Countdown läuft)
  useEffect(() => {
    if (endAt === null || done) return
    const id = setInterval(() => setNow(Date.now()), 250)
    // Zurück aus dem Hintergrund: sofort aktualisieren statt auf den Takt warten
    const onVisible = () => setNow(Date.now())
    document.addEventListener("visibilitychange", onVisible)
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible) }
  }, [endAt, done])

  // Pausenende: exakt auf endAt; ein Verlängern/Verkürzen setzt den Timeout neu
  const finish = useCallback(() => {
    const r = getRest()
    if (!r || r.done || r.endAt > Date.now()) return     // schon von einer anderen Instanz vermerkt
    setRest({ ...r, done: true })
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    notifyRestDone(t('rest.notifyTitle'), r.body || notifyBodyRef.current || t('rest.notifyBodyFallback'))
  }, [t])

  useEffect(() => {
    if (endAt === null || done) return
    const id = setTimeout(finish, Math.max(0, endAt - Date.now()))
    return () => clearTimeout(id)
  }, [endAt, done, finish])

  // "Pause vorbei!" 2 s stehen lassen, dann ausblenden
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => { if (getRest()?.done && getRest()?.endAt === endAt) clearRest() }, 2000)
    return () => clearTimeout(id)
  }, [done, endAt])

  if (endAt === null) return null
  const secondsLeft = done ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000))
  const adjust = (delta) => {
    const r = getRest()
    if (r) setRest({ ...r, endAt: Math.max(Date.now() + 1000, r.endAt + delta * 1000) })
  }

  const mm = String(Math.floor(Math.max(secondsLeft, 0) / 60)).padStart(2, "0")
  const ss = String(Math.max(secondsLeft, 0) % 60).padStart(2, "0")
  const isDone = done

  return (
    // Zwei-Reihen-Layout: die Zeit steht groß & zentriert allein in der oberen
    // Reihe (auch auf 360px klar lesbar, nicht mehr von den Buttons verdrängt),
    // die Steuer-Buttons darunter in einer vollbreiten Reihe.
    <div className={`rounded-xl px-3 py-3 border ${
      isDone ? "panel-success" : "bg-s900 border-s700"
    }`}>
      <div className="flex items-center justify-center gap-2">
        <span className={isDone ? "text-success" : "text-s400"}><Icon name={isDone ? "check" : "timer"} size={22} /></span>
        <span className={`font-extrabold tracking-tight tabular-nums leading-none ${
          isDone ? "text-success text-xl" : "text-content text-3xl"
        }`}>
          {isDone ? t('activeSession.restDone') : `${mm}:${ss}`}
        </span>
      </div>
      {!isDone && (
        <div className="mt-2 flex items-stretch gap-2">
          {/* Laufenden Countdown spontan verlängern/verkürzen */}
          <button onClick={() => adjust(-LIVE_STEP)}
            className="w-12 h-10 flex-shrink-0 rounded-lg border border-s700 text-content flex items-center justify-center active:scale-95" aria-label={`−${LIVE_STEP}s`}><Icon name="minus" size={18} strokeWidth={2.2} /></button>
          <button onClick={() => adjust(LIVE_STEP)}
            className="w-12 h-10 flex-shrink-0 rounded-lg border border-s700 text-content flex items-center justify-center active:scale-95" aria-label={`+${LIVE_STEP}s`}><Icon name="plus" size={18} strokeWidth={2.2} /></button>
          <button onClick={clearRest}
            className="flex-1 h-10 text-sm text-s300 hover:text-content font-semibold rounded-lg border border-s700 active:scale-95">
            {t('activeSession.skipRest')}
          </button>
        </div>
      )}
    </div>
  )
})

export default RestTimer
