import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

function WeightChart({ entries, chartMinMsg }) {
  if (!entries || entries.length < 2) return (
    <div className="flex items-center justify-center h-32 text-s500 text-sm">
      {chartMinMsg}
    </div>
  )

  const W = 320, H = 120, PAD = 16
  const weights = entries.map(e => e.weight_kg)
  const min = Math.min(...weights) - 1
  const max = Math.max(...weights) + 1
  const range = max - min || 1

  const points = entries.map((e, i) => {
    const x = PAD + (i / (entries.length - 1)) * (W - PAD * 2)
    const y = PAD + ((max - e.weight_kg) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const firstPt = points[0].split(",")
  const lastPt  = points[points.length - 1].split(",")

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      {[0, 0.5, 1].map(t => (
        <line key={t}
          x1={PAD} y1={PAD + t * (H - PAD * 2)}
          x2={W - PAD} y2={PAD + t * (H - PAD * 2)}
          stroke="var(--grid-line)" strokeWidth="1" strokeDasharray="4,4"
        />
      ))}
      <polyline
        points={points.join(" ")}
        fill="none" stroke="var(--brand-line)" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"
      />
      <polygon
        points={`${PAD},${H - PAD} ${points.join(" ")} ${W - PAD},${H - PAD}`}
        fill="url(#weightGrad)" opacity="0.18"
      />
      <defs>
        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-line)" />
          <stop offset="100%" stopColor="var(--brand-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx={firstPt[0]} cy={firstPt[1]} r="4" fill="var(--s400)" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="5" fill="var(--brand-line)" stroke="var(--s900)" strokeWidth="2" />
      <text x={PAD} y={H - 2} fill="var(--s500)" fontSize="9" textAnchor="middle">
        {entries[0].date.slice(5).replace("-", ".")}
      </text>
      <text x={W - PAD} y={H - 2} fill="var(--s500)" fontSize="9" textAnchor="middle">
        {entries[entries.length - 1].date.slice(5).replace("-", ".")}
      </text>
      <text x={parseFloat(lastPt[0])} y={parseFloat(lastPt[1]) - 8} fill="var(--brand-line)" fontSize="10" textAnchor="middle" fontWeight="bold">
        {entries[entries.length - 1].weight_kg}
      </text>
    </svg>
  )
}

export default function WeightTracker({ userColor }) {
  const { t } = useTranslation()
  const { authFetch } = useAuth()

  const [history, setHistory] = useState(null)
  const [weightInput, setWeightInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer) }
  }, [success])
  useEffect(() => {
    if (error) { const timer = setTimeout(() => setError(null), 4000); return () => clearTimeout(timer) }
  }, [error])

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/weight/history?days=60`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
        if (data.latest) setWeightInput(data.latest.toString())
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [authFetch])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleLogWeight = async (e) => {
    e.preventDefault()
    const kg = parseFloat(weightInput)
    if (!kg || kg <= 0) return
    try {
      const res = await authFetch(`${API}/weight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_kg: kg })
      })
      if (!res.ok) throw new Error("Fehler")
      setSuccess(t('weight.saved'))
      loadHistory()
    } catch { setError(t('weight.saveError')) }
  }

  // Per-entry editing/deleting of past weight logs (also weeks old).
  const [editEntryId, setEditEntryId] = useState(null)
  const [editWeight, setEditWeight] = useState("")

  const saveEditEntry = async (id) => {
    const kg = parseFloat(editWeight)
    if (!kg || kg <= 0) return
    try {
      const res = await authFetch(`${API}/weight/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_kg: kg })
      })
      if (!res.ok) throw new Error()
      setEditEntryId(null)
      setSuccess(t('weight.saved'))
      loadHistory()
    } catch { setError(t('weight.saveError')) }
  }

  const deleteEntry = async (id) => {
    if (!window.confirm(t('weight.deleteConfirm'))) return
    try {
      const res = await authFetch(`${API}/weight/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      loadHistory()
    } catch { setError(t('weight.saveError')) }
  }

  const trendColor = !history?.trend ? "text-s400"
    : history.trend < -0.1 ? "text-success"
    : history.trend > 0.1  ? "text-danger"
    : "text-warn"

  const trendIcon = !history?.trend ? "→"
    : history.trend < -0.1 ? "↓"
    : history.trend > 0.1  ? "↑"
    : "→"

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-s800 rounded-xl" />
      <div className="h-48 bg-s800 rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-4">

      {error   && <div className="panel-danger rounded-xl px-4 py-2.5 font-semibold text-sm">{error}</div>}
      {success && <div className="panel-success rounded-xl px-4 py-2.5 font-semibold text-sm">{success}</div>}

      <div className="bg-s800 border border-s700 rounded-xl p-4">
        <h3 className="text-content font-bold text-[15px] mb-3">{t('weight.title')}</h3>
        <form onSubmit={handleLogWeight} className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="number" step="0.1" min="20" max="300"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              placeholder={t('weight.placeholder')} aria-label={t('weight.title')} inputMode="decimal"
              className="w-full bg-s900 border border-s700 text-content text-2xl font-extrabold rounded-xl px-4 h-14 outline-none focus:border-brand-orange transition-colors pr-12"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-s400 font-semibold">{t('weight.unit')}</span>
          </div>
          <button type="submit" aria-label={t('common.save')}
            className="w-16 h-14 rounded-xl bg-brand-gradient text-white flex items-center justify-center">
            <Icon name="check" size={24} strokeWidth={2.4} />
          </button>
        </form>

        {history && history.entries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-s900 border border-s700 rounded-lg p-3">
              <div className="text-xs text-s400 font-medium mb-1">{t('weight.current')}</div>
              <div className="text-lg font-extrabold text-content">{history.latest} {t('weight.unit')}</div>
            </div>
            <div className="bg-s900 border border-s700 rounded-lg p-3">
              <div className="text-xs text-s400 font-medium mb-1">{t('weight.start')}</div>
              <div className="text-lg font-extrabold text-s300">{history.start_weight} {t('weight.unit')}</div>
            </div>
            <div className="bg-s900 border border-s700 rounded-lg p-3">
              <div className="text-xs text-s400 font-medium mb-1">{t('weight.trend7d')}</div>
              <div className={`text-lg font-extrabold ${trendColor}`}>
                {trendIcon} {history.trend !== null ? `${Math.abs(history.trend)} ${t('weight.unit')}` : "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {history && history.entries.length > 0 && (
        <div className="bg-s800 border border-s700 rounded-xl p-4">
          <h3 className="text-content font-bold text-[15px] mb-3">{t('weight.chartTitle')}</h3>
          <WeightChart entries={history.entries} chartMinMsg={t('weight.chartMin')} />
        </div>
      )}

      {history && history.entries.length > 0 && (
        <div className="bg-s800 border border-s700 rounded-xl p-4">
          <h3 className="text-content font-bold text-[15px] mb-3">{t('weight.entriesTitle')}</h3>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-s700 divide-y divide-s700">
            {[...history.entries].reverse().map(entry => (
              <div key={entry.id} className="flex items-center gap-2 bg-s900 pl-3.5 pr-1 min-h-[48px]">
                <span className="text-s400 text-xs font-medium w-16 flex-shrink-0 tabular-nums">{entry.date.slice(5).replace("-", ".")}</span>
                {editEntryId === entry.id ? (
                  <>
                    <input type="number" step="0.1" inputMode="decimal" value={editWeight} onChange={e => setEditWeight(e.target.value)}
                      className="w-24 bg-s800 border border-s700 text-content rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-brand-orange transition-colors" autoFocus />
                    <span className="text-s500 text-xs">{t('weight.unit')}</span>
                    <button onClick={() => saveEditEntry(entry.id)} aria-label={t('common.save')}
                      className="ml-auto w-9 h-9 bg-brand-gradient text-white rounded-lg flex items-center justify-center"><Icon name="check" size={16} strokeWidth={2.2} /></button>
                    <button onClick={() => setEditEntryId(null)} aria-label={t('common.cancel')}
                      className="w-9 h-9 text-s400 hover:text-content rounded-lg flex items-center justify-center"><Icon name="close" size={16} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-content font-bold text-sm tabular-nums">{entry.weight_kg} {t('weight.unit')}</span>
                    <div className="ml-auto flex items-center">
                      <button onClick={() => { setEditEntryId(entry.id); setEditWeight(String(entry.weight_kg)) }}
                        className="w-10 h-10 rounded-lg text-s400 hover:text-content flex items-center justify-center" title={t('common.edit')} aria-label={t('common.edit')}><Icon name="edit" size={16} /></button>
                      <button onClick={() => deleteEntry(entry.id)}
                        className="w-10 h-10 rounded-lg text-s400 hover:text-danger flex items-center justify-center" title={t('common.delete')} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
