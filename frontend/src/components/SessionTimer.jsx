import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import Icon from "./Icon"

// Sekunden → "0:42:13" bzw. "12:05" (unter einer Stunde ohne Stundenstelle).
export function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

// Laufende Trainingsdauer seit `startedAtMs` (bereits um die Abweichung der
// Geräte-Uhr zur Server-Uhr korrigiert). Tickt in eigenem State, damit nicht
// jede Sekunde das ganze Dashboard neu rendert.
export default function SessionTimer({ startedAtMs }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center justify-between rounded-xl bg-s800 border border-s700 px-4 h-12">
      <span className="flex items-center gap-2 text-xs font-semibold text-s400"><Icon name="timer" size={15} />{t("activeSession.elapsed")}</span>
      <span className="text-lg font-extrabold text-content tabular-nums">{formatDuration((now - startedAtMs) / 1000)}</span>
    </div>
  )
}
