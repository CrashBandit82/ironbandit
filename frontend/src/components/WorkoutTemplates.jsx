import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import { searchExercises } from "../utils/exerciseSearch"
import PlanImport from "./PlanImport"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

export default function WorkoutTemplates({ exercises, onStarted, userColor }) {
  const { t } = useTranslation()
  const { authFetch, user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)   // null = creating a new plan
  const [newName, setNewName] = useState("")
  const [selectedExercises, setSelectedExercises] = useState([])
  const [exerciseSearch, setExerciseSearch] = useState("")
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(null)

  // Teilen: pro Plan aufklappbares Username-Feld + Eingangsliste geteilter Pläne
  const [incoming, setIncoming] = useState([])
  const [sharingId, setSharingId] = useState(null)
  const [shareUsername, setShareUsername] = useState("")
  const [shareSending, setShareSending] = useState(false)

  useEffect(() => {
    if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer) }
  }, [success])

  const load = useCallback(async () => {
    try {
      const [tplRes, shareRes] = await Promise.all([
        authFetch(`${API}/templates`),
        authFetch(`${API}/templates/shares/incoming`),
      ])
      setTemplates(await tplRes.json())
      if (shareRes.ok) setIncoming(await shareRes.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [authFetch])

  const shareTemplate = async (templateId) => {
    if (!shareUsername.trim()) return
    setShareSending(true)
    try {
      const res = await authFetch(`${API}/templates/${templateId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: shareUsername.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t('templates.shareError'))
      setSuccess(data.message)
      setSharingId(null); setShareUsername("")
    } catch (e) { setError(e.message) }
    finally { setShareSending(false) }
  }

  const acceptShare = async (shareId) => {
    try {
      const res = await authFetch(`${API}/templates/shares/${shareId}/accept`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t('templates.shareError'))
      setSuccess(t('templates.shareAccepted', { name: data.name }))
      load()
    } catch (e) { setError(e.message) }
  }

  const declineShare = async (shareId) => {
    try {
      await authFetch(`${API}/templates/shares/${shareId}`, { method: "DELETE" })
      load()
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [load])

  const startTemplate = async (template) => {
    setStarting(template.id)
    try {
      const res = await authFetch(`${API}/templates/${template.id}/start`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(t('templates.applied', { name: template.name, count: data.count }))
      onStarted(data.session)
    } catch (e) { setError(e.message) }
    finally { setStarting(null) }
  }

  const deleteTemplate = async (id) => {
    if (!window.confirm(t('templates.deleteConfirm'))) return
    await authFetch(`${API}/templates/${id}`, { method: "DELETE" })
    load()
  }

  const startCreate = () => {
    setEditingId(null); setNewName(""); setSelectedExercises([]); setShowCreate(true)
  }

  // Editing an existing plan: prefill name + ordered exercises, then PUT on save.
  // Works any time, also after the plan has been used for workouts.
  const startEdit = (tmpl) => {
    setEditingId(tmpl.id)
    setNewName(tmpl.name)
    const byId = Object.fromEntries(exercises.map(e => [e.id, e]))
    setSelectedExercises(
      tmpl.items.map(it => ({
        ...(byId[it.exercise_id] || { id: it.exercise_id, name: it.exercise_name, is_cardio: it.is_cardio }),
        // Notiz mitführen: update_template ersetzt die Items komplett, ohne das
        // Feld würde ein Umbenennen die importierten Notizen still löschen.
        notes: it.notes || null,
      }))
    )
    setShowCreate(true)
  }

  const cancelForm = () => {
    setShowCreate(false); setEditingId(null); setNewName(""); setSelectedExercises([])
  }

  const addExerciseToNew = (exercise) => {
    if (selectedExercises.find(e => e.id === exercise.id)) return
    setSelectedExercises(prev => [...prev, exercise])
    setExerciseSearch("")
  }

  const removeExerciseFromNew = (exerciseId) => {
    setSelectedExercises(prev => prev.filter(e => e.id !== exerciseId))
  }

  const moveExercise = (index, direction) => {
    setSelectedExercises(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const saveTemplate = async () => {
    if (!newName.trim() || selectedExercises.length === 0) return
    try {
      const res = await authFetch(`${API}/templates${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          items: selectedExercises.map(e => ({ exercise_id: e.id, notes: e.notes || null }))
        })
      })
      if (!res.ok) throw new Error("Fehler")
      setSuccess(editingId ? t('templates.updated') : t('templates.saved'))
      cancelForm()
      load()
    } catch { setError(t('templates.saveError')) }
  }

  const { results: filteredExercises, total: filteredTotal } = searchExercises(exercises, exerciseSearch, {
    excludeIds: selectedExercises.map(sel => sel.id),
    userId: user?.id,
  })

  if (loading) return <div className="text-s400 text-center py-4 text-sm">{t('templates.loading')}</div>

  return (
    <div className="space-y-3">
      {error   && <div className="panel-danger rounded-xl px-4 py-2.5 text-sm font-semibold">{error}</div>}
      {success && <div className="panel-success rounded-xl px-4 py-2.5 text-sm font-semibold">{success}</div>}

      {/* Mit dir geteilte Pläne — übernehmen erstellt eine eigene Kopie */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-accent font-semibold text-xs">{t('templates.incomingTitle')}</h4>
          {incoming.map(sh => (
            <div key={sh.id} className="bg-s800 rounded-xl p-4 border border-brand-orange/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-content font-bold text-[15px] truncate flex items-center gap-1.5"><Icon name="download" size={16} className="text-accent" />{sh.template_name}</h4>
                  <span className="text-xs text-s400 font-medium">{t('templates.sharedBy', { username: sh.from_username })}</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {sh.exercises.map((name, i) => (
                      <span key={i} className="text-xs bg-s900 text-s300 px-2 py-1 rounded-md">{i + 1}. {name}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => acceptShare(sh.id)}
                    className="bg-brand-gradient text-white font-bold px-3.5 h-9 rounded-lg text-xs">
                    {t('templates.acceptShare')}
                  </button>
                  <button onClick={() => declineShare(sh.id)}
                    className="text-s400 hover:text-danger font-semibold text-xs px-3 h-8">
                    {t('templates.declineShare')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {templates.length === 0 && !showCreate && (
        <div className="text-center py-6">
          <p className="text-s400 text-sm mb-3">{t('templates.empty')}</p>
        </div>
      )}

      {templates.map(tmpl => (
        <div key={tmpl.id} className="bg-s800 rounded-xl p-4 border border-s700">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h4 className="text-content font-bold text-[15px] truncate">{tmpl.name}</h4>
              <span className="text-xs text-s400 font-medium">{t('templates.itemCount', { count: tmpl.items.length })}</span>
            </div>
            <div className="flex items-center flex-shrink-0">
              <button onClick={() => { setSharingId(sharingId === tmpl.id ? null : tmpl.id); setShareUsername("") }}
                title={t('templates.shareButton')} aria-label={t('templates.shareButton')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${sharingId === tmpl.id ? 'text-accent bg-s700' : 'text-s400 hover:text-content hover:bg-s700'}`}><Icon name="share" size={16} /></button>
              <button onClick={() => startEdit(tmpl)} title={t('common.edit')} aria-label={t('common.edit')}
                className="w-9 h-9 rounded-lg text-s400 hover:text-content hover:bg-s700 flex items-center justify-center transition-colors"><Icon name="edit" size={16} /></button>
              <button onClick={() => deleteTemplate(tmpl.id)} title={t('common.delete')} aria-label={t('common.delete')}
                className="w-9 h-9 rounded-lg text-s400 hover:text-danger hover:bg-s700 flex items-center justify-center transition-colors"><Icon name="trash" size={16} /></button>
            </div>
          </div>
          <ol className="flex flex-wrap gap-1.5 list-none">
            {tmpl.items.map((item, i) => (
              <li key={item.id} title={item.notes || undefined}
                  className="text-xs bg-s900 text-s300 px-2 py-1 rounded-md">
                {i + 1}. {item.exercise_name}{item.is_cardio ? " · Cardio" : ""}
                {item.notes ? <span className="text-s500"> · {item.notes}</span> : null}
              </li>
            ))}
          </ol>
          <button
            onClick={() => startTemplate(tmpl)}
            disabled={starting === tmpl.id}
            className="mt-3 w-full bg-brand-gradient text-white font-bold h-11 rounded-xl text-sm disabled:opacity-50"
          >
            {starting === tmpl.id ? t('templates.applying') : t('templates.applyButton')}
          </button>

          {/* Teilen: exakten Benutzernamen eingeben — keine Suche, keine Vorschläge */}
          {sharingId === tmpl.id && (
            <div className="mt-3 pt-3 border-t border-s700">
              <p className="text-s500 text-xs mb-2">{t('templates.shareHint')}</p>
              <div className="flex gap-2">
                <input
                  type="text" value={shareUsername} onChange={e => setShareUsername(e.target.value)}
                  placeholder={t('templates.shareUsernamePlaceholder')}
                  autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") shareTemplate(tmpl.id) }}
                  aria-label={t('templates.shareUsernamePlaceholder')}
                  className="flex-1 min-w-0 bg-s900 border border-s700 text-content rounded-xl px-3.5 h-11 text-sm font-semibold outline-none focus:border-brand-orange transition-colors"
                />
                <button onClick={() => shareTemplate(tmpl.id)} disabled={shareSending || !shareUsername.trim()}
                  className="bg-brand-gradient text-white font-bold px-4 h-11 rounded-xl text-sm disabled:opacity-40">
                  {shareSending ? "…" : t('templates.shareSend')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {!showCreate ? (
        <>
          <button
            onClick={startCreate}
            className="w-full h-12 rounded-xl border border-dashed border-s600 text-s300 hover:border-brand-orange hover:text-accent transition-colors text-sm font-semibold"
          >
            {t('templates.createNew')}
          </button>
          <PlanImport exercises={exercises} onImported={load} />
        </>
      ) : (
        <div className="bg-s800 rounded-xl p-4 border border-s600 space-y-3">
          <h4 className="text-content font-bold text-[15px]">{editingId ? t('templates.editTitle') : t('templates.newTitle')}</h4>
          <p className="text-s500 text-xs -mt-2">{t('templates.newHint')}</p>
          <input
            type="text" placeholder={t('templates.namePlaceholder')}
            value={newName} onChange={e => setNewName(e.target.value)}
            aria-label={t('templates.namePlaceholder')}
            className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-11 text-sm font-semibold outline-none focus:border-brand-orange transition-colors placeholder:text-s500 placeholder:font-normal"
            autoFocus
          />

          <input
            type="text" placeholder={t('templates.exerciseSearch')}
            value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
            aria-label={t('templates.exerciseSearch')}
            className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-11 text-sm outline-none focus:border-brand-orange transition-colors placeholder:text-s500 placeholder:font-normal"
          />
          {exerciseSearch && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-s700 divide-y divide-s700">
              {filteredExercises.map(ex => (
                <button key={ex.id} onClick={() => addExerciseToNew(ex)}
                  className="w-full text-left px-3.5 py-2.5 bg-s900 hover:bg-s700 text-sm text-content transition-colors">
                  {ex.name} <span className="text-s500 text-xs">— {ex.category}{ex.is_cardio ? " · Cardio" : ""}</span>
                </button>
              ))}
              {filteredTotal > filteredExercises.length && (
                <p className="text-s500 text-xs px-3 py-1">
                  {t('templates.moreResults', { count: filteredTotal - filteredExercises.length })}
                </p>
              )}
              {filteredExercises.length === 0 && <p className="text-s500 text-xs px-3">{t('templates.notFound')}</p>}
            </div>
          )}

          {selectedExercises.length > 0 && (
            <ol className="space-y-2 list-none">
              {selectedExercises.map((exercise, i) => (
                <li key={exercise.id} className="flex items-center gap-2 bg-s900 border border-s700 rounded-xl pl-3 pr-1.5 py-1.5">
                  <span className="text-s500 font-semibold text-sm w-5 flex-shrink-0 tabular-nums">{i + 1}.</span>
                  <span className="text-content text-sm flex-1 truncate font-semibold">
                    {exercise.name}{exercise.is_cardio ? <span className="text-s500 font-normal"> · Cardio</span> : null}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => moveExercise(i, -1)} disabled={i === 0}
                      aria-label="↑" className="w-9 h-9 rounded-lg text-s300 hover:bg-s700 disabled:opacity-30 flex items-center justify-center"><Icon name="arrowUp" size={16} /></button>
                    <button type="button" onClick={() => moveExercise(i, 1)} disabled={i === selectedExercises.length - 1}
                      aria-label="↓" className="w-9 h-9 rounded-lg text-s300 hover:bg-s700 disabled:opacity-30 flex items-center justify-center"><Icon name="arrowDown" size={16} /></button>
                    <button type="button" onClick={() => removeExerciseFromNew(exercise.id)}
                      aria-label={t('common.delete')} className="w-9 h-9 rounded-lg text-s400 hover:text-danger hover:bg-s700 flex items-center justify-center"><Icon name="close" size={16} /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={cancelForm}
              className="flex-1 border border-s600 text-content font-semibold h-11 rounded-xl text-sm hover:bg-s700 transition-colors">{t('templates.cancel')}</button>
            <button
              onClick={saveTemplate}
              disabled={!newName.trim() || selectedExercises.length === 0}
              className="flex-1 bg-brand-gradient text-white font-bold h-11 rounded-xl text-sm disabled:opacity-40"
            >
              {t('templates.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
