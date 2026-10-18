import { useTranslation } from "react-i18next"

// Wiederverwendbarer Auswahl-Baustein für die Pausendauer:
//  · Schnellwahl-Buttons (60/90/120 s)
//  · große −/+ Stepper (15-s-Schritte) für schnelle Anpassung am Handy
//  · freie min:sek-Eingabe
// Arbeitet in Sekunden; value + onChange(seconds). Genutzt in den Einstellungen
// (Standard, serverseitig) UND live im Workout (Session-Wert).

const QUICK = [60, 90, 120]
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function RestDurationPicker({ value, onChange, min = 5, max = 3600, step = 15 }) {
  const { t } = useTranslation()
  const clamp = (s) => Math.max(min, Math.min(max, s))
  const mins = Math.floor(value / 60)
  const secs = value % 60
  const setMS = (m, s) => onChange(clamp(m * 60 + s))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(clamp(value - step))}
          className="w-12 h-12 flex-shrink-0 rounded-xl bg-s900 border border-s700 text-content font-bold text-2xl active:scale-95 transition-transform"
          aria-label={`−${step}s`}>−</button>

        <div className="flex-1 flex items-center justify-center gap-0.5 bg-s900 border border-s700 rounded-xl h-12">
          <input type="number" inputMode="numeric" value={mins}
            onChange={e => setMS(Math.max(0, parseInt(e.target.value) || 0), secs)}
            className="w-10 bg-transparent text-content text-2xl font-extrabold text-right outline-none tabular-nums" />
          <span className="text-content text-2xl font-extrabold">:</span>
          <input type="number" inputMode="numeric" value={String(secs).padStart(2, "0")}
            onChange={e => setMS(mins, Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-10 bg-transparent text-content text-2xl font-extrabold text-left outline-none tabular-nums" />
          <span className="text-s500 text-[10px] font-bold ml-1 leading-none">{t('rest.minSec')}</span>
        </div>

        <button type="button" onClick={() => onChange(clamp(value + step))}
          className="w-12 h-12 flex-shrink-0 rounded-xl bg-s900 border border-s700 text-content font-bold text-2xl active:scale-95 transition-transform"
          aria-label={`+${step}s`}>+</button>
      </div>

      <div className="flex gap-2">
        {QUICK.map(q => (
          <button type="button" key={q} onClick={() => onChange(q)}
            className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-colors ${
              value === q ? "bg-brand-gradient text-white" : "bg-s900 border border-s700 text-s300 hover:text-content"
            }`}>
            {fmt(q)}
          </button>
        ))}
      </div>
    </div>
  )
}
