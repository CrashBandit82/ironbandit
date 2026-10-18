import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import RestTimer from "./RestTimer"
import RestDurationPicker from "./RestDurationPicker"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"
const fmtRest = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function ActiveExerciseCard({ log, isCardio, onLogChanged, userColor, hideRestTimer = false, hideTitle = false }) {
  const { t, i18n } = useTranslation()
  const { authFetch, user, setRestDefault } = useAuth()
  const restTimerRef = useRef(null)

  const [reps, setReps] = useState("")
  const [weight, setWeight] = useState("")
  const [duration, setDuration] = useState(log.duration_min != null ? String(log.duration_min) : "")
  const [distance, setDistance] = useState(log.distance_km != null ? String(log.distance_km) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Dauernotiz zu dieser Übung — pro Nutzer, NICHT pro Training: sie erscheint
  // bei jedem Training dieser Übung wieder, bis man sie ändert ("Sitz Stufe 4").
  // Gespeichert wird automatisch kurz nach dem Tippen, beim Verlassen des Feldes
  // und beim Schließen/Wechseln der Übung — ein vergessener Blur verliert nichts.
  const exerciseId = log.exercise_id
  const [notes, setNotes] = useState("")
  const [noteStatus, setNoteStatus] = useState("idle")   // idle | saving | saved | error
  const savedNoteRef = useRef("")       // zuletzt serverseitig bestätigter Text
  const pendingNoteRef = useRef(null)   // getippt, aber noch nicht gespeichert
  const noteTimerRef = useRef(null)
  const noteExerciseRef = useRef(exerciseId)   // für welche Übung die Refs gerade gelten

  useEffect(() => {
    noteExerciseRef.current = exerciseId
    setNotes(""); setNoteStatus("idle")
    savedNoteRef.current = ""; pendingNoteRef.current = null
    if (!exerciseId) return
    let cancelled = false
    authFetch(`${API}/workouts/exercises/${exerciseId}/note`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data) return
        savedNoteRef.current = data.notes || ""
        // Hat der Nutzer schon losgetippt, seine Eingabe nicht überschreiben.
        if (pendingNoteRef.current == null) setNotes(data.notes || "")
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  const saveNotes = async (value = notes) => {
    clearTimeout(noteTimerRef.current)
    const forExercise = exerciseId
    const text = (value || "").trim()
    if (!forExercise || text === savedNoteRef.current) { pendingNoteRef.current = null; return }
    setNoteStatus("saving")
    try {
      const res = await authFetch(`${API}/workouts/exercises/${forExercise}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text || null })
      })
      if (!res.ok) throw new Error()
      // Inzwischen auf eine andere Übung gewechselt? Dann deren Stand nicht anfassen.
      if (noteExerciseRef.current !== forExercise) return
      savedNoteRef.current = text
      if ((pendingNoteRef.current || "").trim() === text) pendingNoteRef.current = null
      setNoteStatus("saved")
    } catch { if (noteExerciseRef.current === forExercise) setNoteStatus("error") }
  }

  const onNotesChange = (value) => {
    setNotes(value)
    pendingNoteRef.current = value
    setNoteStatus("idle")
    clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => saveNotes(value), 1000)
  }

  // Übung wird geschlossen/gewechselt: noch Ungespeichertes sofort sichern.
  useEffect(() => () => {
    clearTimeout(noteTimerRef.current)
    if (pendingNoteRef.current != null) saveNotes(pendingNoteRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  const noteField = exerciseId ? (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-semibold text-s400">{t('activeSession.noteLabel')}</label>
        <span className="text-[11px] font-medium text-s500">
          {noteStatus === "saving" && t('activeSession.saving')}
          {noteStatus === "saved" && t('activeSession.noteSaved')}
          {noteStatus === "error" && <span className="text-danger">{t('activeSession.saveError')}</span>}
        </span>
      </div>
      <textarea rows={2} value={notes} onChange={e => onNotesChange(e.target.value)} onBlur={() => saveNotes()}
        maxLength={500} placeholder={t('activeSession.notePlaceholder')}
        className="w-full bg-s900 border border-s700 text-content text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-orange transition-colors resize-y placeholder:text-s600" />
    </div>
  ) : null

  // Pausendauer für DIESE Session — startet beim gespeicherten Standard des
  // Nutzers, kann aber spontan fürs aktuelle Training angepasst werden.
  const [restSeconds, setRestSeconds] = useState(user?.rest_timer_seconds || 90)
  const [showRestPicker, setShowRestPicker] = useState(false)

  // Folgt dem serverseitigen Standard, wenn er (async) lädt oder in den
  // Einstellungen geändert wird — eine reine Session-Anpassung ändert den
  // Standard nicht und wird daher hier nicht überschrieben.
  const userRestDefault = user?.rest_timer_seconds
  useEffect(() => {
    if (userRestDefault) setRestSeconds(userRestDefault)
  }, [userRestDefault])

  // Letztes Training zu genau dieser Übung — als Platzhalter/Hinweis, NICHT als
  // fest eingetragener Wert, damit der Nutzer ihn immer noch bestätigen/anpassen muss.
  const [lastSets, setLastSets] = useState([])
  const [lastDate, setLastDate] = useState(null)

  useEffect(() => {
    if (isCardio || !log.exercise_id) { setLastSets([]); setLastDate(null); return }
    let cancelled = false
    authFetch(`${API}/workouts/exercises/${log.exercise_id}/last-sets?exclude_log_id=${log.id}`)
      .then(res => res.ok ? res.json() : { sets: [] })
      .then(data => { if (!cancelled) { setLastSets(data.sets || []); setLastDate(data.date || null) } })
      .catch(() => { if (!cancelled) { setLastSets([]); setLastDate(null) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.exercise_id, log.id, isCardio])

  // Welcher Satz kommt als Nächstes dran (1-basiert), und was war das beim
  // letzten Training genau an dieser Stelle (Satz 1 <-> Satz 1, Satz 2 <-> Satz 2, ...).
  const nextSetNumber = log.sets.length + 1
  const lastForNextSet = lastSets.find(s => s.set_number === nextSetNumber)
  const lastDateText = lastDate
    ? new Date(`${lastDate}T00:00:00`).toLocaleDateString(i18n.language.startsWith('de') ? 'de-DE' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    : ""

  useEffect(() => {
    if (isCardio) return
    // Prefill from the previous set — the actual weight/reps are still entered
    // live after each real set at the gym, this just saves re-typing the same numbers.
    if (log.sets.length > 0) {
      const last = log.sets[log.sets.length - 1]
      setReps(String(last.reps))
      setWeight(last.weight_kg != null ? String(last.weight_kg) : "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.sets.length, isCardio])

  const addSet = async () => {
    if (!reps || parseInt(reps) <= 0) return
    setSaving(true); setError(null)
    try {
      const res = await authFetch(`${API}/workouts/${log.id}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reps: parseInt(reps), weight_kg: weight ? parseFloat(weight) : null })
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onLogChanged(updated)
      restTimerRef.current?.start(restSeconds)
    } catch { setError(t('activeSession.saveError')) }
    finally { setSaving(false) }
  }

  const deleteSet = async (setId) => {
    try {
      const res = await authFetch(`${API}/workouts/${log.id}/sets/${setId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onLogChanged(updated)
    } catch { setError(t('activeSession.saveError')) }
  }

  // Inline editing of an already-logged set (weight/reps) — works for old history too.
  const [editingSetId, setEditingSetId] = useState(null)
  const [editReps, setEditReps] = useState("")
  const [editWeight, setEditWeight] = useState("")

  const startEditSet = (s) => {
    setEditingSetId(s.id)
    setEditReps(String(s.reps))
    setEditWeight(s.weight_kg != null ? String(s.weight_kg) : "")
  }

  const saveEditSet = async (setId) => {
    if (!editReps || parseInt(editReps) <= 0) return
    try {
      const res = await authFetch(`${API}/workouts/${log.id}/sets/${setId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reps: parseInt(editReps), weight_kg: editWeight ? parseFloat(editWeight) : null })
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setEditingSetId(null)
      onLogChanged(updated)
    } catch { setError(t('activeSession.saveError')) }
  }

  const saveCardio = async () => {
    setSaving(true); setError(null)
    try {
      const res = await authFetch(`${API}/workouts/${log.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_min: duration ? parseFloat(duration) : null,
          distance_km: distance ? parseFloat(distance) : null
        })
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onLogChanged(updated)
    } catch { setError(t('activeSession.saveError')) }
    finally { setSaving(false) }
  }

  if (isCardio) {
    return (
      <div className="bg-s800 border border-s700 rounded-xl p-4 space-y-3">
        {!hideTitle && <h4 className="text-content font-bold">{log.exercise_name}</h4>}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-s400 mb-1.5">{t('templates.durationLabel')}</label>
            <input type="number" inputMode="decimal" value={duration}
              onChange={e => setDuration(e.target.value)} onBlur={saveCardio}
              className="w-full bg-s900 border border-s700 text-content text-xl font-extrabold rounded-xl px-3 h-14 text-center outline-none focus:border-brand-orange transition-colors" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-s400 mb-1.5">{t('templates.distanceLabel')}</label>
            <input type="number" inputMode="decimal" step="0.1" value={distance}
              onChange={e => setDistance(e.target.value)} onBlur={saveCardio}
              className="w-full bg-s900 border border-s700 text-content text-xl font-extrabold rounded-xl px-3 h-14 text-center outline-none focus:border-brand-orange transition-colors" />
          </div>
        </div>
        {noteField}
        {saving && <p className="text-s500 text-xs">{t('activeSession.saving')}</p>}
        {error && <p className="text-danger text-xs">{error}</p>}
      </div>
    )
  }

  return (
    <div className="bg-s800 border border-s700 rounded-xl p-4 space-y-3">
      {!hideTitle && <h4 className="text-content font-bold">{log.exercise_name}</h4>}

      {log.sets.length > 0 && (
        <div className="rounded-xl border border-s700 divide-y divide-s700 overflow-hidden">
          {log.sets.map(s => (
            editingSetId === s.id ? (
              <div key={s.id} className="flex items-center gap-2 bg-s900 px-2.5 py-2">
                <span className="text-s400 text-xs font-semibold w-10 flex-shrink-0">{t('activeSession.setLabel', { n: s.set_number })}</span>
                <input type="number" inputMode="decimal" step="0.5" value={editWeight} onChange={e => setEditWeight(e.target.value)}
                  placeholder={t('templates.weightLabel')}
                  className="w-16 bg-s800 border border-s700 text-content rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-brand-orange transition-colors" />
                <span className="text-s500 text-xs">kg ×</span>
                <input type="number" inputMode="numeric" value={editReps} onChange={e => setEditReps(e.target.value)}
                  placeholder={t('templates.repsLabel')}
                  className="w-14 bg-s800 border border-s700 text-content rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-brand-orange transition-colors" />
                <button onClick={() => saveEditSet(s.id)} aria-label={t('common.save')}
                  className="ml-auto w-9 h-9 bg-brand-gradient text-white rounded-lg flex items-center justify-center"><Icon name="check" size={16} strokeWidth={2.2} /></button>
                <button onClick={() => setEditingSetId(null)} aria-label={t('common.cancel')}
                  className="w-9 h-9 text-s400 hover:text-content rounded-lg flex items-center justify-center"><Icon name="close" size={16} /></button>
              </div>
            ) : (
              <div key={s.id} className="flex items-center justify-between bg-s900 pl-3.5 pr-1 py-1">
                <span className="text-sm tabular-nums">
                  <span className="text-s400 font-medium">{t('activeSession.setLabel', { n: s.set_number })}</span>
                  <span className="text-content font-bold ml-2">{s.weight_kg != null ? `${s.weight_kg} kg × ` : ""}{s.reps}</span>
                </span>
                <div className="flex items-center">
                  <button onClick={() => startEditSet(s)} title={t('common.edit')} aria-label={t('common.edit')}
                    className="w-10 h-10 rounded-lg text-s400 hover:text-content flex items-center justify-center"><Icon name="edit" size={16} /></button>
                  <button onClick={() => deleteSet(s.id)} title={t('common.delete')} aria-label={t('common.delete')}
                    className="w-10 h-10 rounded-lg text-s400 hover:text-danger flex items-center justify-center"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Alle Sätze des letzten Trainings dieser Übung; der als Nächstes fällige ist hervorgehoben */}
      {lastSets.length > 0 && (
        <div className="border border-dashed border-s600 rounded-xl px-3.5 py-2.5">
          <p className="text-xs text-s400 font-semibold mb-1.5">
            {t('activeSession.lastTraining')}{lastDateText ? ` · ${lastDateText}` : ""}
          </p>
          <div className="space-y-0.5">
            {lastSets.map(s => {
              const next = s.set_number === nextSetNumber
              return (
                <div key={s.id ?? s.set_number}
                  className={`flex justify-between text-xs tabular-nums py-0.5 ${next ? "text-accent font-bold" : "text-s500 font-medium"}`}>
                  <span className="flex items-center gap-1">{next && <Icon name="next" size={12} strokeWidth={2.4} />}{t('activeSession.setLabel', { n: s.set_number })}</span>
                  <span>{s.weight_kg != null ? `${s.weight_kg} kg` : "–"} × {s.reps}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-s400 mb-1.5">{t('templates.weightLabel')}</label>
          <input type="number" inputMode="decimal" step="0.5" value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder={lastForNextSet?.weight_kg != null ? String(lastForNextSet.weight_kg) : ""}
            className="w-full bg-s900 border border-s700 text-content text-xl font-extrabold rounded-xl px-3 h-14 text-center outline-none focus:border-brand-orange transition-colors placeholder:text-s600 placeholder:font-bold" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-s400 mb-1.5">{t('templates.repsLabel')}</label>
          <input type="number" inputMode="numeric" value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder={lastForNextSet ? String(lastForNextSet.reps) : ""}
            className="w-full bg-s900 border border-s700 text-content text-xl font-extrabold rounded-xl px-3 h-14 text-center outline-none focus:border-brand-orange transition-colors placeholder:text-s600 placeholder:font-bold" />
        </div>
        <button onClick={addSet} disabled={saving || !reps}
          aria-label={t('activeSession.addSet', 'Satz eintragen')}
          className="h-14 w-16 flex-shrink-0 rounded-xl bg-brand-gradient text-white flex items-center justify-center disabled:opacity-40">
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </button>
      </div>

      {error && <p className="text-danger text-xs">{error}</p>}

      {noteField}

      {!hideRestTimer && (
        <>
          {/* Pausendauer für diese Session: kompakte Zeile, per Tipp aufklappbar */}
          <div className="rounded-xl bg-s900 border border-s700">
            <button type="button" onClick={() => setShowRestPicker(v => !v)}
              className="w-full flex items-center justify-between px-3.5 h-11">
              <span className="flex items-center gap-2 text-xs font-semibold text-s400"><Icon name="timer" size={15} />{t('rest.pauseLabel')}</span>
              <span className="flex items-center gap-2">
                <span className="text-content font-bold tabular-nums">{fmtRest(restSeconds)}</span>
                <span className="text-s500"><Icon name={showRestPicker ? "up" : "down"} size={15} /></span>
              </span>
            </button>
            {showRestPicker && (
              <div className="px-3 pb-3 space-y-2">
                <RestDurationPicker value={restSeconds} onChange={setRestSeconds} />
                {restSeconds !== (user?.rest_timer_seconds ?? 90) && (
                  <button type="button" onClick={() => setRestDefault(restSeconds)}
                    className="w-full text-xs font-semibold text-accent hover:opacity-80 h-9">
                    {t('rest.saveAsDefault')}
                  </button>
                )}
              </div>
            )}
          </div>

          <RestTimer ref={restTimerRef} defaultSeconds={restSeconds}
            notifyBody={t('rest.notifyBody', { exercise: log.exercise_name, n: log.sets.length + 1 })} />
        </>
      )}
    </div>
  )
}
