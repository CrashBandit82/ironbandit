import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

export default function WeeklyOverview({ userColor, refreshKey, onEditGoal }) {
  const { t } = useTranslation()
  const { authFetch } = useAuth()
  const [weekly, setWeekly] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/workouts/weekly`)
      if (res.ok) setWeekly(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [authFetch])

  useEffect(() => { load() }, [load, refreshKey])

  if (loading) return <div className="h-28 bg-s800 rounded-xl animate-pulse" />
  if (!weekly) return null

  const pct = weekly.weekly_goal > 0
    ? Math.min((weekly.weekly_total_sessions / weekly.weekly_goal) * 100, 100)
    : 0

  return (
    <div className="bg-s800 border border-s700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-content font-bold text-[15px]">{t('weekly.title')}</h3>
        <button onClick={onEditGoal} className="text-xs text-accent font-semibold hover:opacity-80 h-8">
          {t('weekly.editGoal')}
        </button>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-4xl font-extrabold tracking-tight text-content">{weekly.weekly_total_sessions}</span>
        <span className="text-s400 font-semibold mb-1">/ {weekly.weekly_goal} {t('weekly.workoutsUnit')}</span>
      </div>

      <div className="w-full bg-s700 h-1.5 rounded-full overflow-hidden mb-4">
        <div className={`bg-brand-gradient h-full rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex justify-between gap-1">
        {weekly.days.map(d => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full aspect-square max-w-[44px] rounded-lg flex items-center justify-center ${
              d.workout_done ? `bg-brand-gradient text-white` : "bg-s900 border border-s700"
            }`}>
              {d.workout_done && <Icon name="check" size={15} strokeWidth={2.4} />}
            </div>
            <span className="text-[11px] text-s500 font-medium">{d.day_name}</span>
          </div>
        ))}
      </div>

      {/* Kompakte Wochen-Kacheln: Volumen (mit Vorwochen-Vergleich) & Workouts */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-s900 border border-s700 rounded-lg p-3 flex flex-col">
          <span className="flex items-center gap-1.5 text-xs text-s400 font-medium mb-1"><span className="w-2 h-2 rounded-full bg-chart3" />{t('weekly.volumeLabel')}</span>
          <span className="text-xl font-extrabold text-content leading-none">{Math.round(weekly.weekly_total_volume_kg)} kg</span>
          <VolumeTrend pct={weekly.volume_change_pct} t={t} />
        </div>
        <div className="bg-s900 border border-s700 rounded-lg p-3 flex flex-col">
          <span className="flex items-center gap-1.5 text-xs text-s400 font-medium mb-1"><span className="w-2 h-2 rounded-full bg-chart1" />{t('weekly.workoutsLabel')}</span>
          <span className="text-xl font-extrabold text-content leading-none">{weekly.weekly_total_sessions}</span>
          <span className="text-[11px] text-s500 font-bold mt-1.5">
            {t('weekly.perWeek')}: {weekly.prev_week_total_sessions}
          </span>
        </div>
      </div>
    </div>
  )
}

// Kleiner Trend-Indikator für die Volumen-Kachel: Pfeil + Prozent ggü. Vorwoche.
function VolumeTrend({ pct, t }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[11px] text-s500 font-bold mt-1.5">{t('weekly.noPrevWeek')}</span>
  }
  const up = pct > 0
  const flat = pct === 0
  const color = flat ? "text-s400" : up ? "text-success" : "text-danger"
  const arrow = flat ? "→" : up ? "↑" : "↓"
  return (
    <span className={`text-[11px] font-black mt-1.5 ${color}`}>
      {arrow} {up ? "+" : ""}{pct}% <span className="text-s500 font-bold">{t('weekly.vsLastWeek')}</span>
    </span>
  )
}
