import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

// Dezenter, sachlicher Hinweis auf Übungen, die zuletzt nicht vorangeschritten
// sind. Bewusst neutral formuliert (kein negativer Ton) und nur sichtbar, wenn
// das Backend genügend Datenpunkte hatte — sonst wird gar nichts gerendert.
export default function StagnatingExercises({ refreshKey }) {
  const { t } = useTranslation()
  const { authFetch } = useAuth()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/workouts/stagnating`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.exercises || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoaded(true) }
  }, [authFetch])

  useEffect(() => { load() }, [load, refreshKey])

  // Vor dem ersten Laden und wenn nichts stagniert: nichts anzeigen.
  if (!loaded || items.length === 0) return null

  const lineFor = (ex) => {
    if (ex.metric === "weight") {
      return t('stagnation.weightStuck', { name: ex.exercise_name, weeks: ex.weeks_span, value: Math.round(ex.last_value), count: ex.weeks_span })
    }
    return t('stagnation.volumeStuck', { name: ex.exercise_name, weeks: ex.weeks_span, count: ex.weeks_span })
  }

  return (
    <div className="mb-6 panel-info rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="trend" size={18} />
        <h3 className="font-bold text-sm">{t('stagnation.title')}</h3>
      </div>
      <p className="text-xs opacity-80 font-medium mb-3">{t('stagnation.subtitle')}</p>
      <ul className="space-y-1.5">
        {items.map(ex => (
          <li key={ex.exercise_id} className="text-sm font-semibold flex items-start gap-2">
            <span aria-hidden="true" className="opacity-60">•</span>
            <span>{lineFor(ex)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-70 mt-3">{t('stagnation.hint')}</p>
    </div>
  )
}
