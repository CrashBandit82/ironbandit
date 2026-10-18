import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

/* Zwei-Schritt-Import für Trainingspläne.
 *
 * Schritt 1 (Vorschau) schreibt serverseitig nichts an Plandaten — der Nutzer
 * sieht erst, was erkannt wurde, ordnet unbekannte Übungen zu und kann Zeilen
 * abwählen. Erst "Import bestätigen" legt Pläne an. Der Bestätigen-Button
 * existiert deshalb überhaupt erst, wenn eine Vorschau geladen ist.
 *
 * Der Client schickt beim Bestätigen NUR die Session-ID plus Korrekturen —
 * niemals die Nutzdaten selbst. Die liegen serverseitig; sonst ließe sich die
 * geprüfte Struktur zwischen den Schritten austauschen.
 */
export default function PlanImport({ exercises, onImported }) {
  const { t } = useTranslation()
  const { authFetch } = useAuth()
  const fileRef = useRef(null)

  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // row-Nummer → exercise_id (manuelle Zuordnung) bzw. Menge übersprungener Zeilen
  const [resolutions, setResolutions] = useState({})
  const [skipped, setSkipped] = useState(() => new Set())

  const sortedExercises = [...exercises].sort((a, b) => a.name.localeCompare(b.name))

  const reset = () => {
    setPreview(null); setResolutions({}); setSkipped(new Set())
    setError(null); setFileName("")
    if (fileRef.current) fileRef.current.value = ""
  }

  const closePanel = () => { reset(); setOpen(false) }

  const download = async (path, filename) => {
    try {
      const res = await authFetch(`${API}${path}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { setError(t('planImport.downloadError')) }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null); setSuccess(null)
    setPreview(null); setResolutions({}); setSkipped(new Set())
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await authFetch(`${API}/plans/import/preview`, { method: "POST", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || t('planImport.uploadError'))
      setPreview(data)
    } catch (err) {
      setError(err.message || t('planImport.uploadError'))
      if (fileRef.current) fileRef.current.value = ""
    } finally {
      setUploading(false)
    }
  }

  const setResolution = (row, exerciseId) => {
    setResolutions(prev => {
      const next = { ...prev }
      if (exerciseId) next[row] = Number(exerciseId)
      else delete next[row]
      return next
    })
  }

  const toggleSkip = (row) => {
    setSkipped(prev => {
      const next = new Set(prev)
      next.has(row) ? next.delete(row) : next.add(row)
      return next
    })
  }

  // Zeile zählt als importierbar, wenn sie nicht abgewählt ist und eine Übung hat.
  const rowIsReady = (row) =>
    !skipped.has(row.row) && (row.matched || resolutions[row.row])

  const readyCount = preview
    ? preview.plans.reduce((sum, p) => sum + p.rows.filter(rowIsReady).length, 0)
    : 0

  const confirmImport = async () => {
    if (!preview) return
    setConfirming(true); setError(null)
    try {
      const res = await authFetch(`${API}/plans/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: preview.session_id,
          resolutions: Object.entries(resolutions).map(([row, exercise_id]) => ({
            row: Number(row), exercise_id,
          })),
          skip_rows: [...skipped],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || t('planImport.confirmError'))
      setSuccess(t('planImport.done', {
        plans: data.created_plans.length, skipped: data.skipped_rows,
      }))
      reset()
      setOpen(false)
      onImported?.()
    } catch (err) {
      setError(err.message || t('planImport.confirmError'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-2">
      {success && <div className="panel-success rounded-xl px-4 py-2 text-sm font-bold">{success}</div>}

      {!open ? (
        <div className="flex gap-2">
          <button
            onClick={() => { setOpen(true); setSuccess(null) }}
            className="flex-1 h-10 rounded-xl text-s300 hover:text-content border border-s700 hover:bg-s800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="upload" size={15} /> {t('planImport.openButton')}
          </button>
          <button
            onClick={() => download("/plans/export", "ironbandit_plaene.csv")}
            className="flex-1 h-10 rounded-xl text-s300 hover:text-content border border-s700 hover:bg-s800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="download" size={15} /> {t('planImport.exportButton')}
          </button>
        </div>
      ) : (
        <div className="bg-s800 rounded-xl p-4 border border-s700 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-content font-bold text-[15px]">{t('planImport.title')}</h4>
              <p className="text-s500 text-xs mt-0.5">{t('planImport.formatHint')}</p>
            </div>
            <button onClick={closePanel} aria-label={t('common.close')}
              className="w-10 h-10 -mr-2 -mt-1 rounded-lg text-s400 hover:text-content hover:bg-s700 flex items-center justify-center flex-shrink-0"><Icon name="close" /></button>
          </div>

          <button
            onClick={() => download("/plans/import/sample", "ironbandit_plan_vorlage.csv")}
            className="text-accent text-xs font-bold underline underline-offset-2"
          >
            {t('planImport.sampleLink')}
          </button>

          {error && <div className="panel-danger rounded-xl px-3 py-2 text-xs font-semibold">{error}</div>}

          {/* ── Schritt 1: Datei wählen ─────────────────────────────────── */}
          <div>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv"
              onChange={handleFile} disabled={uploading}
              className="hidden" id="plan-import-file"
            />
            <label
              htmlFor="plan-import-file"
              className={`block w-full py-3 rounded-xl border border-dashed text-center text-xs font-bold transition-colors ${
                uploading
                  ? "border-s700 text-s500 cursor-wait"
                  : "border-s600 text-s300 hover:border-s500 hover:text-content cursor-pointer"
              }`}
            >
              {uploading
                ? t('planImport.uploading')
                : fileName || t('planImport.chooseFile')}
            </label>
          </div>

          {/* ── Schritt 2: Vorschau ─────────────────────────────────────── */}
          {preview && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="px-2 py-1 rounded-lg bg-s800 text-s300">
                  {t('planImport.statTotal', { count: preview.total_rows })}
                </span>
                <span className="px-2 py-1 rounded-lg bg-s800 text-success">
                  {t('planImport.statMatched', { count: preview.matched_rows })}
                </span>
                {preview.unmatched_rows > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-s800 text-warn">
                    {t('planImport.statUnmatched', { count: preview.unmatched_rows })}
                  </span>
                )}
                {preview.errors.length > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-s800 text-danger">
                    {t('planImport.statErrors', { count: preview.errors.length })}
                  </span>
                )}
              </div>

              {/* Fehlerhafte Zeilen — blockieren den Import der gültigen nicht.
                  Randfarbe solide statt danger/40: die Theme-Farben sind
                  CSS-Variablen, auf die Tailwind-v3-Opacity-Modifier nicht
                  greifen — die Klasse käme im Build gar nicht erst an. */}
              {preview.errors.length > 0 && (
                <div className="rounded-xl border border-danger bg-s900/40 p-3">
                  <p className="text-danger text-xs font-black mb-1.5">{t('planImport.errorsTitle')}</p>
                  <ul className="space-y-0.5 list-none max-h-32 overflow-y-auto">
                    {preview.errors.map((e, i) => (
                      <li key={i} className="text-xs text-s400">
                        {e.row ? t('planImport.lineLabel', { line: e.row }) : ""} {e.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="text-s500 text-xs mt-1.5">{t('planImport.errorsHint')}</p>
                </div>
              )}

              {preview.plans.map(plan => (
                <div key={plan.plan_name} className="rounded-xl border border-s700 bg-s900/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h5 className="text-content font-black text-sm truncate">{plan.plan_name}</h5>
                    {plan.already_exists && (
                      <span className="text-warn text-xs font-bold flex-shrink-0">
                        {t('planImport.duplicateWarning')}
                      </span>
                    )}
                  </div>

                  <ul className="space-y-1.5 list-none">
                    {plan.rows.map(row => {
                      const isSkipped = skipped.has(row.row)
                      const resolved = resolutions[row.row]
                      return (
                        <li
                          key={row.row}
                          className={`rounded-lg p-2 ${isSkipped ? "bg-s900/40 opacity-50" : "bg-s800"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`flex-shrink-0 ${row.matched ? "text-success" : resolved ? "text-info" : "text-warn"}`}>
                              <Icon name={row.matched ? "check" : resolved ? "link" : "help"} size={15} strokeWidth={2} />
                            </span>
                            <span className={`text-xs flex-1 min-w-0 truncate font-bold ${
                              row.matched || resolved ? "text-content" : "text-warn"
                            }`}>
                              {row.exercise_name}
                            </span>
                            <button
                              onClick={() => toggleSkip(row.row)}
                              title={isSkipped ? t('planImport.include') : t('planImport.skip')}
                              aria-label={isSkipped ? t('planImport.include') : t('planImport.skip')}
                              className="w-8 h-8 rounded-md text-s400 hover:text-danger flex items-center justify-center flex-shrink-0"
                            >
                              <Icon name={isSkipped ? "undo" : "close"} size={15} />
                            </button>
                          </div>

                          {row.notes && !isSkipped && (
                            <p className="text-s500 text-xs mt-1 pl-6 truncate">{row.notes}</p>
                          )}

                          {/* Nicht erkannt → manuell zuordnen */}
                          {!row.matched && !isSkipped && (
                            <div className="mt-1.5 pl-6">
                              <select
                                value={resolved || ""}
                                onChange={e => setResolution(row.row, e.target.value)}
                                className="w-full bg-s900 border border-s700 text-content rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-orange transition-colors"
                              >
                                <option value="">{t('planImport.selectExercise')}</option>
                                {row.suggestions.length > 0 && (
                                  <optgroup label={t('planImport.suggestions')}>
                                    {row.suggestions.map(s => (
                                      <option key={`s-${s.exercise_id}`} value={s.exercise_id}>{s.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label={t('planImport.allExercises')}>
                                  {sortedExercises.map(ex => (
                                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={closePanel}
                  className="flex-1 bg-s700 text-content font-bold py-2 rounded-xl text-sm"
                >
                  {t('planImport.cancel')}
                </button>
                <button
                  onClick={confirmImport}
                  disabled={confirming || readyCount === 0}
                  className="flex-1 bg-brand-gradient text-white font-black py-2 rounded-xl text-sm disabled:opacity-40"
                >
                  {confirming
                    ? t('planImport.confirming')
                    : t('planImport.confirmButton', { count: readyCount })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
