import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import i18n from '../i18n.js'
import WeightTracker from './WeightTracker'
import WorkoutTemplates from './WorkoutTemplates'
import WeeklyOverview from './WeeklyOverview'
import StagnatingExercises from './StagnatingExercises'
import ActiveExerciseCard from './ActiveExerciseCard'
import SessionTimer, { formatDuration } from './SessionTimer'
import RestTimer from './RestTimer'
import { clearRest } from '../utils/restTimerStore'
import AdminPanel from './AdminPanel'
import RestDurationPicker from './RestDurationPicker'
import RestNotifySettings from './RestNotifySettings'
import ShareButton from './ShareButton'
import UpdateBanner from './UpdateBanner'
import useWakeLock from '../hooks/useWakeLock'
import { APP_VERSION } from '../version.js'
import { searchExercises } from '../utils/exerciseSearch'
import Icon from './Icon'
import Sheet from './Sheet'
import ShakeModal from './ShakeModal'

// Redesign 2026-10: einheitliche Felder und Knöpfe in den Fenstern
const feld = 'w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-11 text-sm font-semibold outline-none focus:border-brand-orange transition-colors placeholder:text-s500 placeholder:font-normal'
const feldInnen = feld.replace('bg-s900', 'bg-s800')
const label = 'block text-xs font-semibold text-s400 mb-1.5'
const knopfHaupt = 'flex-1 bg-brand-gradient text-white font-bold h-11 rounded-xl text-sm disabled:opacity-50'
const knopfZweit = 'flex-1 border border-s600 text-content font-semibold h-11 rounded-xl text-sm hover:bg-s700 transition-colors'

function KontoZeile({ icon, title, sub, onClick, chevron, danger }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors text-left ${danger ? 'hover:bg-rose-500/10' : 'hover:bg-s700'}`}>
      <span className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-s800 ${danger ? 'text-danger' : 'text-s300'}`}><Icon name={icon} /></span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${danger ? 'text-danger' : 'text-content'}`}>{title}</span>
        {sub && <span className="block text-xs text-s400 truncate tabular-nums">{sub}</span>}
      </span>
      {chevron && <span className="text-s500"><Icon name="next" size={16} /></span>}
    </button>
  )
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const USER_COLORS = [
  'from-pink-500 to-rose-500', 'from-red-500 to-orange-600', 'from-blue-500 to-cyan-500',
  'from-teal-500 to-emerald-500', 'from-green-500 to-lime-500', 'from-yellow-500 to-amber-500',
  'from-orange-500 to-red-500', 'from-fuchsia-500 to-pink-500', 'from-amber-600 to-red-600',
  'from-sky-500 to-blue-600',
]

const todayStr = () => new Date().toISOString().split('T')[0]

function cardioLabel(log) {
  const parts = [`${log.duration_min}min`]
  if (log.distance_km) parts.push(`${log.distance_km}km`)
  return parts.join(' · ')
}

// Ein Chip pro Satz, z.B. "60kg × 10" — log.sets ist ein Array von
// {set_number, reps, weight_kg} Objekten, nicht ein Zähler/String.
function setLabel(s) {
  return `${s.weight_kg != null ? `${s.weight_kg}kg` : '–'} × ${s.reps}`
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { user, logout, authFetch, refreshUser, theme, setTheme, setRestDefault } = useAuth()

  const userColor = USER_COLORS[(user.id - 1) % USER_COLORS.length]

  const [activeMainTab, setActiveMainTab] = useState('workouts')
  const [selectedDate, setSelectedDate] = useState(null)
  const [totals, setTotals] = useState(null)
  const [logs, setLogs] = useState([])
  const [exercises, setExercises] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [showAddWorkout, setShowAddWorkout] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [activeAdHocLog, setActiveAdHocLog] = useState(null)
  const [liveSession, setLiveSession] = useState([])
  // Laufendes Training (serverseitig, routers/sessions.py): Start für die
  // Trainingsdauer. startedAtMs ist um die Abweichung der Geräte-Uhr korrigiert.
  const [activeWorkout, setActiveWorkout] = useState(null)
  // Abgeschlossene Trainings des angezeigten Tages (Dauer im Verlauf).
  const [daySessions, setDaySessions] = useState([])
  // Welche Übung der aktiven Session ist gerade geöffnet (null = Übersicht).
  const [expandedLogId, setExpandedLogId] = useState(null)
  // Merkt sich den Startpunkt einer Touch-Geste, um im aktiven Workout per
  // horizontalem Wischen zwischen Übungen zu wechseln (Feature: Swipe-Navigation).
  const swipeStart = useRef(null)
  // Als "abgeschlossen" markierte Übungen — rein visueller Status, keine Sperre.
  // In localStorage gehalten (pro Tag), damit die Markierung einen Reload
  // während des Trainings übersteht, ohne die Live-DB anzufassen.
  const [completedLogIds, setCompletedLogIds] = useState(() => {
    try {
      const raw = localStorage.getItem('ironbandit_completed_ex')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.date === todayStr()) return new Set(parsed.ids)
      }
    } catch { /* localStorage nicht verfügbar → einfach ohne Persistenz */ }
    return new Set()
  })
  const [logDuration, setLogDuration] = useState('20')
  const [logDistance, setLogDistance] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [showCustomExercise, setShowCustomExercise] = useState(false)
  const [editingExerciseId, setEditingExerciseId] = useState(null)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState('Push')
  const [customEquipment, setCustomEquipment] = useState('')
  const [customMuscle, setCustomMuscle] = useState('')
  const [customIsCardio, setCustomIsCardio] = useState(false)

  const [editingLog, setEditingLog] = useState(null)

  const [showEditGoal, setShowEditGoal] = useState(false)
  const [goalInput, setGoalInput] = useState(user.weekly_workout_goal)

  const [showAdmin, setShowAdmin] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [accountTab, setAccountTab] = useState('menu')
  const [newUsername, setNewUsername] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [reminderTime, setReminderTime] = useState(user.reminder_time || '')
  const [reminderSaving, setReminderSaving] = useState(false)

  const [showFeedback, setShowFeedback] = useState(false)
  const [showShake, setShowShake] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [apiLoading, setApiLoading] = useState(false)

  useEffect(() => {
    if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer) }
  }, [success])
  useEffect(() => {
    if (error) { const timer = setTimeout(() => setError(null), 5000); return () => clearTimeout(timer) }
  }, [error])

  const loadDashboard = useCallback(async (date = null) => {
    try {
      const dateStr = date || todayStr()
      const isToday = dateStr === todayStr()
      const [totalsRes, logsRes] = await Promise.all([
        authFetch(`${API_BASE}/workouts/totals/${isToday ? 'today' : `date/${dateStr}`}`),
        authFetch(`${API_BASE}/workouts/${isToday ? 'today' : `date/${dateStr}`}`),
      ])
      setTotals(await totalsRes.json())
      setLogs(await logsRes.json())
    } catch (err) { console.error(err) }
    // Trainingsdauer des Tages — getrennt geladen, damit ein Fehler hier die
    // eigentliche Tagesansicht nicht mitreißt.
    try {
      const res = await authFetch(`${API_BASE}/sessions/date/${date || todayStr()}`)
      setDaySessions(res.ok ? await res.json() : [])
    } catch { setDaySessions([]) }
  }, [authFetch])

  // Laufendes Training vom Server holen und die Live-Ansicht daraus aufbauen.
  // Damit übersteht ein Training einen Reload oder App-Wechsel (vorher lebte
  // die Session nur im React-State). Liefert die Session oder null.
  const restoreActiveSession = useCallback(async () => {
    const res = await authFetch(`${API_BASE}/sessions/active`)
    if (!res.ok) return null
    const session = await res.json()
    if (!session) { setActiveWorkout(null); return null }
    const clockOffset = Date.parse(session.server_now) - Date.now()
    setActiveWorkout({
      id: session.id,
      startedAtMs: Date.parse(session.started_at) - clockOffset,
      templateName: session.template_name,
    })
    const logsRes = await authFetch(`${API_BASE}/workouts/date/${session.date}`)
    const dayLogs = logsRes.ok ? await logsRes.json() : []
    const byId = Object.fromEntries(dayLogs.map(l => [l.id, l]))
    setLiveSession(session.entries
      .map(e => ({ log: byId[e.log_id], isCardio: e.is_cardio }))
      .filter(e => e.log))
    return session
  }, [authFetch])

  useEffect(() => { restoreActiveSession().catch(err => console.error(err)) }, [restoreActiveSession])

  // Die Übungsliste ist serverseitig paginiert (Default 100, max. 1000 pro
  // Anfrage). Hier werden die Seiten nacheinander geholt und zusammengesetzt,
  // damit die Relevanzsuche (exerciseSearch.js) weiterhin den kompletten
  // Bestand durchsucht und nicht nur die erste Seite.
  const loadExercises = useCallback(async () => {
    const PAGE_SIZE = 500
    const HARD_CAP = 5000   // Sicherheitsnetz gegen eine Endlosschleife
    try {
      const all = []
      for (let offset = 0; offset < HARD_CAP; offset += PAGE_SIZE) {
        const res = await authFetch(`${API_BASE}/workouts/exercises?limit=${PAGE_SIZE}&offset=${offset}`)
        if (!res.ok) break
        const page = await res.json()
        all.push(...page)
        if (page.length < PAGE_SIZE) break
      }
      setExercises(all)
    } catch (err) { console.error(err) }
  }, [authFetch])

  useEffect(() => { loadDashboard(selectedDate) }, [loadDashboard, selectedDate, refreshKey])
  useEffect(() => { loadExercises() }, [loadExercises])

  const isToday = !selectedDate || selectedDate === todayStr()

  const goToPrevDay = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date()
    base.setDate(base.getDate() - 1)
    setSelectedDate(base.toISOString().split('T')[0])
  }
  const goToNextDay = () => {
    if (isToday) return
    const base = new Date(selectedDate)
    base.setDate(base.getDate() + 1)
    const next = base.toISOString().split('T')[0]
    setSelectedDate(next >= todayStr() ? null : next)
  }

  const formatDisplayDate = () => {
    const date = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()
    const today = new Date()
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
    const locale = i18n.language.startsWith('de') ? 'de-DE' : 'en-US'
    if (!selectedDate) return `${t('dashboard.today')}, ${date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`
    if (date.toDateString() === yesterday.toDateString()) return `${t('dashboard.yesterday')}, ${date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const resetAddWorkoutForm = () => {
    setExerciseSearch(''); setSelectedExercise(null); setActiveAdHocLog(null)
    setLogDuration('20'); setLogDistance(''); setLogNotes('')
    setShowCustomExercise(false); setCustomName('')
  }

  // Strength exercises are created empty (sets: []) and logged live, one set at a
  // time, via ActiveExerciseCard — not filled in upfront as a static form.
  const handleSelectExercise = async (exercise) => {
    setSelectedExercise(exercise)
    if (exercise.is_cardio) return
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: exercise.id, sets: [], date: isToday ? undefined : selectedDate })
      })
      if (!res.ok) throw new Error()
      const log = await res.json()
      setActiveAdHocLog(log)
      setRefreshKey(k => k + 1)
    } catch { setError(t('dashboard.logError')) } finally { setApiLoading(false) }
  }

  const resetCustomExerciseForm = () => {
    setEditingExerciseId(null); setCustomName(''); setCustomCategory('Push')
    setCustomEquipment(''); setCustomMuscle(''); setCustomIsCardio(false)
  }

  const openEditExercise = (ex) => {
    setEditingExerciseId(ex.id)
    setCustomName(ex.name)
    setCustomCategory(ex.category || 'Push')
    setCustomEquipment(ex.equipment || '')
    setCustomMuscle(ex.muscle_group || '')
    setCustomIsCardio(!!ex.is_cardio)
    setShowCustomExercise(true)
  }

  // Create a new exercise, or (when editing) save changes. Editing is permitted
  // by the backend only for the creator or an admin (403 otherwise).
  const handleSaveCustomExercise = async () => {
    if (!customName.trim()) return
    setApiLoading(true)
    try {
      const payload = {
        name: customName.trim(), category: customCategory,
        equipment: customEquipment || null, muscle_group: customMuscle || null,
        is_cardio: customIsCardio
      }
      const res = await authFetch(
        `${API_BASE}/workouts/exercises${editingExerciseId ? `/${editingExerciseId}` : ''}`,
        {
          method: editingExerciseId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      )
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || t('dashboard.saveError')) }
      const saved = await res.json()
      await loadExercises()
      setShowCustomExercise(false)
      if (editingExerciseId) {
        setSuccess(t('dashboard.exerciseUpdated', { name: saved.name }))
        resetCustomExerciseForm()
      } else {
        resetCustomExerciseForm()
        await handleSelectExercise(saved)
      }
    } catch (err) { setError(err.message || t('dashboard.saveError')) } finally { setApiLoading(false) }
  }

  // Exercises are shared by everyone; edit/delete is only offered in the UI when
  // the user created it (or is admin) — the backend enforces the same rule with a
  // 403, this just avoids showing a control that would fail.
  const canEditExercise = (exercise) => exercise.can_edit ?? (user.is_admin || exercise.created_by_user_id === user.id)

  const handleDeleteExercise = async (exercise) => {
    if (!window.confirm(t('dashboard.deleteExerciseConfirm', { name: exercise.name }))) return
    try {
      const res = await authFetch(`${API_BASE}/workouts/exercises/${exercise.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('app.error')) }
      await loadExercises()
    } catch (err) { setError(err.message) }
  }

  const handleAdHocLogChanged = (updatedLog) => {
    setActiveAdHocLog(updatedLog)
    setRefreshKey(k => k + 1)
  }

  const finishAdHocWorkout = () => {
    if (selectedExercise) setSuccess(t('dashboard.workoutAdded', { name: selectedExercise.name }))
    setShowAddWorkout(false)
    resetAddWorkoutForm()
  }

  // Kraftübungen legen beim Auswählen sofort einen (leeren) Log-Eintrag an, in den
  // dann live Sätze eingetragen werden. Bricht man ab, bevor ein Satz drin ist,
  // würde ein leerer Eintrag am Tag zurückbleiben → hier wegräumen.
  const discardEmptyAdHocLog = () => {
    const log = activeAdHocLog
    if (log && (!log.sets || log.sets.length === 0)) {
      authFetch(`${API_BASE}/workouts/${log.id}`, { method: 'DELETE' })
        .then(() => setRefreshKey(k => k + 1))
        .catch(() => {})
    }
  }

  // Abbrechen aus der geöffneten Kraftübung: leeren Eintrag verwerfen und zurück
  // zur Übungsauswahl (Modal bleibt offen, man kann direkt eine andere wählen).
  const cancelAdHocExercise = () => {
    discardEmptyAdHocLog()
    setSelectedExercise(null)
    setActiveAdHocLog(null)
  }

  // Modal komplett schließen (auch via ✕): einen versehentlich angelegten,
  // leeren Eintrag ebenfalls verwerfen.
  const closeAddWorkout = () => {
    discardEmptyAdHocLog()
    setShowAddWorkout(false)
    resetAddWorkoutForm()
  }

  const handleAddCardioWorkout = async (e) => {
    e.preventDefault()
    if (!selectedExercise) return
    setApiLoading(true)
    try {
      const body = {
        exercise_id: selectedExercise.id,
        duration_min: parseFloat(logDuration),
        notes: logNotes || null,
      }
      if (logDistance) body.distance_km = parseFloat(logDistance)
      if (!isToday) body.date = selectedDate
      const res = await authFetch(`${API_BASE}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('dashboard.logError')) }
      setSuccess(t('dashboard.workoutAdded', { name: selectedExercise.name }))
      setShowAddWorkout(false)
      resetAddWorkoutForm()
      setRefreshKey(k => k + 1)
    } catch (err) {
      setError(err.message || t('dashboard.logError'))
    } finally { setApiLoading(false) }
  }

  // Starting a workout from a template creates one empty log per exercise on the
  // backend (no planned values — a plan is just exercise + order); here we fetch
  // the full log objects for the live session view.
  const handleWorkoutStarted = async (sessionSummary) => {
    try {
      // Normalfall: der Server führt das Training (inkl. Startzeit) — von dort
      // laden. Ein zweiter Plan während eines Trainings wird dort angehängt.
      if (await restoreActiveSession()) { setRefreshKey(k => k + 1); return }
    } catch (e) { console.error(e) }
    try {
      const res = await authFetch(`${API_BASE}/workouts/today`)
      const todaysLogs = await res.json()
      const byId = Object.fromEntries(todaysLogs.map(l => [l.id, l]))
      const entries = sessionSummary
        .map(s => ({ log: byId[s.log_id], isCardio: s.is_cardio }))
        .filter(e => e.log)
      setLiveSession(entries)
      setRefreshKey(k => k + 1)
    } catch (e) { console.error(e) }
  }

  const handleLiveLogChanged = (updatedLog) => {
    setLiveSession(prev => prev.map(e => e.log.id === updatedLog.id ? { ...e, log: updatedLog } : e))
    setRefreshKey(k => k + 1)
  }

  const finishLiveSession = async () => {
    let durationSec = null
    if (activeWorkout) {
      try {
        const res = await authFetch(`${API_BASE}/sessions/${activeWorkout.id}/finish`, { method: 'POST' })
        if (res.ok) durationSec = (await res.json()).duration_sec
      } catch (e) { console.error(e) }
    }
    setActiveWorkout(null)
    setLiveSession([])
    setExpandedLogId(null)
    setCompletedLogIds(new Set())
    clearRest()
    if (durationSec != null) setSuccess(t('activeSession.finishedWithDuration', { duration: formatDuration(durationSec) }))
    setRefreshKey(k => k + 1)
  }

  // Training abbrechen: Uhr verwerfen (keine Dauer), leere Plan-Übungen
  // entfernen — erfasste Sätze bleiben. Das Aufräumen macht der Server.
  const cancelLiveSession = async () => {
    if (!window.confirm(t('activeSession.cancelConfirm'))) return
    let removed = 0
    if (activeWorkout) {
      try {
        const res = await authFetch(`${API_BASE}/sessions/${activeWorkout.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        removed = (await res.json()).removed_empty_logs || 0
      } catch { setError(t('activeSession.cancelError')); return }
    }
    setActiveWorkout(null)
    setLiveSession([])
    setExpandedLogId(null)
    setCompletedLogIds(new Set())
    clearRest()
    setSuccess(t('activeSession.cancelled', { count: removed }))
    setRefreshKey(k => k + 1)
  }

  // "Übung abschließen" — rein visuelle Markierung, sperrt nichts. Schließt die
  // geöffnete Übung und führt zurück zur Übersicht.
  const markExerciseCompleted = (logId) => {
    setCompletedLogIds(prev => new Set(prev).add(logId))
    setExpandedLogId(null)
  }

  // "Als offen markieren" — nimmt die Markierung zurück, Übung bleibt geöffnet.
  const markExerciseOpen = (logId) => {
    setCompletedLogIds(prev => { const next = new Set(prev); next.delete(logId); return next })
  }

  // ── Swipe-Navigation im aktiven Workout ──────────────────────────────────────
  // Öffnet die Übung an Position `index` der laufenden Session. Alle Sätze/Notizen
  // liegen bereits serverseitig + im liveSession-State, ein Wechsel verliert also
  // nichts (identisch zum Navigieren über die Übersicht).
  const goToLiveExercise = (index) => {
    if (index < 0 || index >= liveSession.length) return
    setExpandedLogId(liveSession[index].log.id)
  }

  const onLiveSwipeStart = (e) => {
    const tch = e.touches[0]
    swipeStart.current = { x: tch.clientX, y: tch.clientY }
  }

  const onLiveSwipeEnd = (e, index) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const tch = e.changedTouches[0]
    const dx = tch.clientX - start.x
    const dy = tch.clientY - start.y
    // Nur klar horizontale, ausreichend weite Wische lösen einen Wechsel aus —
    // vertikales Scrollen (dy dominiert) bleibt komplett unangetastet.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    goToLiveExercise(dx < 0 ? index + 1 : index - 1)
  }

  // Abschluss-Markierungen pro Tag persistieren (übersteht einen Reload).
  useEffect(() => {
    try {
      localStorage.setItem('ironbandit_completed_ex',
        JSON.stringify({ date: todayStr(), ids: [...completedLogIds] }))
    } catch { /* ignore */ }
  }, [completedLogIds])

  // Während eines laufenden Workouts (aktive Live-Session) den Bildschirm
  // wach halten, damit man zwischen den Sätzen nicht ständig entsperren muss.
  useWakeLock(liveSession.length > 0)

  const handleDeleteLog = async (logId) => {
    if (!window.confirm(t('dashboard.deleteLogConfirm'))) return
    await authFetch(`${API_BASE}/workouts/${logId}`, { method: 'DELETE' })
    setRefreshKey(k => k + 1)
  }

  // Open the per-set editor for any log (today or old history). Editing/adding/
  // deleting sets happens live via ActiveExerciseCard against the same log.
  const openEditLog = (log) => setEditingLog(log)

  const handleEditingLogChanged = (updatedLog) => {
    setEditingLog(updatedLog)
    setRefreshKey(k => k + 1)
  }

  const openEditGoal = () => { setGoalInput(user.weekly_workout_goal); setShowEditGoal(true) }

  const handleSaveGoal = async (e) => {
    e.preventDefault()
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/auth/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_workout_goal: parseInt(goalInput, 10) })
      })
      if (!res.ok) throw new Error('Fehler')
      await refreshUser()
      setShowEditGoal(false)
      setSuccess(t('dashboard.goalsSaved'))
      setRefreshKey(k => k + 1)
    } catch { setError(t('dashboard.saveError')) } finally { setApiLoading(false) }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('dashboard.avatarInvalidType')); e.target.value = ''; return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('dashboard.avatarTooBig')); e.target.value = ''; return
    }
    setApiLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch(`${API_BASE}/auth/avatar`, { method: 'POST', body: formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('dashboard.uploadFailed')) }
      setSuccess(t('dashboard.avatarUpdated'))
      await refreshUser()
    } catch (err) {
      setError(err.message || t('dashboard.uploadFailed'))
    } finally {
      setApiLoading(false)
      e.target.value = ''
    }
  }

  const handleChangeUsername = async (e) => {
    e.preventDefault()
    if (!newUsername.trim()) return
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/auth/username`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() })
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('app.error')) }
      await refreshUser()
      setSuccess(t('dashboard.usernameChanged'))
      setShowAccountMenu(false); setAccountTab('menu'); setNewUsername('')
    } catch (err) { setError(err.message) } finally { setApiLoading(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwNew !== pwConfirm) { setError(t('dashboard.passwordMismatch')); return }
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew })
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('app.error')) }
      setSuccess(t('dashboard.passwordChanged'))
      setShowAccountMenu(false); setAccountTab('menu')
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (err) { setError(err.message) } finally { setApiLoading(false) }
  }

  const handleSaveReminder = async (time) => {
    setReminderTime(time)
    setReminderSaving(true)
    try {
      await authFetch(`${API_BASE}/auth/reminder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_time: time || null })
      })
      setSuccess(time ? t('dashboard.reminderSet', { time }) : t('dashboard.reminderDisabled'))
    } catch { setError(t('dashboard.saveError')) } finally { setReminderSaving(false) }
  }

  const handleExportData = async () => {
    try {
      const res = await authFetch(`${API_BASE}/auth/export`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'ironbandit_export.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { setError(t('dashboard.saveError')) }
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    const confirmWord = t('dashboard.deleteConfirmWord')
    if (deleteConfirm !== confirmWord) { setError(t('dashboard.deleteConfirmMismatch')); return }
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword })
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('app.error')) }
      logout()
    } catch (err) { setError(err.message) } finally { setApiLoading(false) }
  }

  const handleFeedback = async (e) => {
    e.preventDefault()
    if (!feedbackMsg.trim()) return
    setApiLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/auth/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedbackMsg })
      })
      if (!res.ok) throw new Error('Fehler')
      setFeedbackSent(true)
      setFeedbackMsg('')
      setTimeout(() => { setShowFeedback(false); setFeedbackSent(false) }, 2500)
    } catch { setError(t('dashboard.sendError')) } finally { setApiLoading(false) }
  }

  const handleResendVerification = async () => {
    try {
      await authFetch(`${API_BASE}/auth/resend-verification`, { method: 'POST' })
      setSuccess(t('dashboard.verificationSent'))
    } catch { setError(t('dashboard.sendError')) }
  }

  const { results: filteredExercises, total: filteredTotal } = searchExercises(exercises, exerciseSearch, {
    userId: user?.id,
  })

  const liveLogIds = new Set(liveSession.map(e => e.log.id))
  const visibleLogs = logs.filter(l => !liveLogIds.has(l.id))

  const deleteConfirmWord = t('dashboard.deleteConfirmWord')

  return (
    <div className="min-h-screen bg-s900 text-s100 px-4 pt-4 safe-top relative selection:bg-brand-orange selection:text-white flex flex-col"
      // Platz unter dem Footer für die feste „Übung eintragen“-Leiste (.safe-bottom würde pb-* überschreiben)
      style={{ paddingBottom: "calc(10rem + env(safe-area-inset-bottom))" }}>
      <div className="flex-grow">

        {(error || success) && (
          <div className="fixed top-4 left-4 right-4 z-50 space-y-2 pointer-events-none">
            {error && <div className="mx-auto max-w-lg px-4 py-3 bg-rose-600 text-white rounded-xl shadow-xl text-sm font-semibold text-center pointer-events-auto">{error}</div>}
            {success && <div className="mx-auto max-w-lg px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-xl text-sm font-semibold text-center pointer-events-auto">{success}</div>}
          </div>
        )}

        {!user.is_verified && (
          <div className="panel-warn rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-warn font-bold text-sm">{t('dashboard.emailNotVerified')}</p>
              <p className="text-warn/70 text-xs mt-0.5">{t('dashboard.emailNotVerifiedSub')}</p>
            </div>
            <button onClick={handleResendVerification}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-[#1a1205] font-bold px-3 h-9 rounded-lg whitespace-nowrap transition-colors">
              {t('dashboard.resend')}
            </button>
          </div>
        )}

        {/* Kopf — Redesign 2026-10: ohne Karte, Marke + Profil + Konto in einer ruhigen Zeile */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <label className="cursor-pointer relative group flex-shrink-0" title={t('dashboard.changeAvatar')}>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} disabled={apiLoading} />
              {user.avatar_path ? (
                <img src={user.avatar_path} alt={t('dashboard.changeAvatar')}
                  className="w-11 h-11 rounded-full object-cover ring-1 ring-s600 group-hover:ring-brand-orange transition-all" />
              ) : (
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-extrabold bg-brand-gradient ring-1 ring-s600 group-hover:ring-brand-orange transition-all text-white">
                  {user.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Icon name="camera" size={16} />
              </div>
            </label>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-s400 font-medium">
                <img src="/logo.png" alt="" className="w-4 h-4 object-contain rounded" />
                {t('auth.appName')}
              </div>
              <div className="font-extrabold text-lg leading-tight tracking-tight text-content truncate">{user.username}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {user.is_admin && (
              <button onClick={() => setShowAdmin(true)} title="Admin" aria-label="Admin"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-warn hover:bg-s800 transition-colors">
                <Icon name="shield" />
              </button>
            )}
            <button
              onClick={() => { setShowAccountMenu(true); setAccountTab('menu') }}
              className="h-10 px-3.5 flex items-center gap-2 rounded-xl border border-s700 text-content text-sm font-semibold hover:bg-s800 transition-colors"
            >
              <Icon name="user" size={16} />
              {t('dashboard.account')}
            </button>
          </div>
        </div>

        {/* Hauptreiter — Unterstrich statt Pillen */}
        <div className="flex border-b border-s700 mb-6">
          {[['workouts', 'tabWorkouts'], ['weight', 'tabWeight']].map(([tab, key]) => (
            <button key={tab} onClick={() => setActiveMainTab(tab)}
              className={`flex-1 py-3 -mb-px border-b-2 text-sm transition-colors ${
                activeMainTab === tab ? 'border-brand-orange text-content font-bold' : 'border-transparent text-s400 font-medium hover:text-content'
              }`}>
              {t(`dashboard.${key}`)}
            </button>
          ))}
        </div>

        {activeMainTab === 'weight' && (
          <WeightTracker userColor={userColor} />
        )}

        {activeMainTab === 'workouts' && (<>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-content">{t('dashboard.title')}</h1>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={goToPrevDay} aria-label={t('dashboard.prevDay')}
                className="w-9 h-9 flex items-center justify-center border border-s700 hover:bg-s800 text-content rounded-lg transition-colors"><Icon name="back" size={16} /></button>
              <span className="text-sm text-s300 font-semibold min-w-[170px] text-center">{formatDisplayDate()}</span>
              <button onClick={goToNextDay} disabled={isToday} aria-label={t('dashboard.nextDay')}
                className="w-9 h-9 flex items-center justify-center border border-s700 hover:bg-s800 disabled:opacity-30 disabled:cursor-not-allowed text-content rounded-lg transition-colors"><Icon name="next" size={16} /></button>
              {!isToday && (
                <button onClick={() => setSelectedDate(null)} className="text-xs text-accent font-bold hover:opacity-80 transition-colors ml-1">
                  {t('dashboard.today')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <WeeklyOverview userColor={userColor} refreshKey={refreshKey} onEditGoal={openEditGoal} />
        </div>

        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { key: 'statEntries',  value: totals.entries,            dot: 'bg-chart1' },
              { key: 'statSets',     value: totals.total_sets,         dot: 'bg-chart2' },
              { key: 'statVolume',   value: `${Math.round(totals.total_volume_kg)} kg`, dot: 'bg-chart3' },
              { key: 'statDuration', value: `${Math.round(totals.total_duration_min)} min`, dot: 'bg-chart4' },
            ].map(s => (
              <div key={s.key} className="bg-s800 border border-s700 rounded-xl px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs text-s400 font-medium"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{t(`dashboard.${s.key}`)}</span>
                <div className="text-xl font-extrabold text-content mt-1 tracking-tight">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Dezenter Hinweis auf stagnierende Übungen (nur bei genügend Daten) */}
        {isToday && <StagnatingExercises refreshKey={refreshKey} />}

        {isToday && liveSession.length > 0 && (() => {
          const doneCount = liveSession.filter(e => completedLogIds.has(e.log.id)).length
          const allDone = doneCount === liveSession.length
          return (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between pl-1">
              <h2 className="text-lg font-extrabold tracking-tight text-content">{t('activeSession.title')}</h2>
              <span className="text-xs font-semibold text-s400 tabular-nums">
                {t('activeSession.progress', { done: doneCount, total: liveSession.length })}
              </span>
            </div>

            {activeWorkout && <SessionTimer startedAtMs={activeWorkout.startedAtMs} />}

            {/* Laufende Pause auch ohne geöffnete Übung (zugeklappt, Cardio offen, App neu geladen) —
                die geöffnete Kraft-Übung zeigt sie selbst in ihrer Karte */}
            {!liveSession.some(e => e.log.id === expandedLogId && !e.isCardio) && <RestTimer />}

            {liveSession.map((entry, idx) => {
              const log = entry.log
              const isDone = completedLogIds.has(log.id)
              const isOpen = expandedLogId === log.id
              const summary = entry.isCardio
                ? (log.duration_min != null ? cardioLabel(log) : t('dashboard.noSetsYet'))
                : (log.sets.length > 0 ? t('activeSession.setsDone', { count: log.sets.length }) : t('dashboard.noSetsYet'))
              return (
                <div key={log.id}
                  className={`rounded-xl border overflow-hidden ${isDone ? 'bg-s900 border-s700' : 'bg-s800 border-s700'}`}>
                  {/* Übersichts-Zeile — immer tappbar, öffnet/schließt die Übung.
                      Abgeschlossene Übungen bleiben voll anklickbar. */}
                  <button type="button" onClick={() => setExpandedLogId(isOpen ? null : log.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      isDone ? 'bg-success text-white' : 'bg-s900 text-s600 border border-s700'}`}>
                      {isDone && <Icon name="check" size={14} strokeWidth={2.4} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block font-bold truncate ${isDone ? 'text-s500 line-through' : 'text-content'}`}>
                        {log.exercise_name}
                      </span>
                      <span className="block text-xs text-s500 font-medium truncate">
                        {isDone ? t('activeSession.completedBadge') : summary}
                      </span>
                    </span>
                    <span className="text-s500 flex-shrink-0"><Icon name={isOpen ? 'up' : 'down'} size={16} /></span>
                  </button>

                  {/* Geöffnete Übung — voll bearbeitbar (Sätze hinzufügen/ändern/löschen),
                      unabhängig vom Abschluss-Status. Horizontal wischbar, um zur
                      nächsten/vorherigen Übung zu springen. */}
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3"
                      onTouchStart={onLiveSwipeStart}
                      onTouchEnd={(e) => onLiveSwipeEnd(e, idx)}>

                      {/* Karussell-Navigation: Pfeile + Punkte-Indikator zeigen
                          Position und Gesamtzahl und machen das Wischen erkennbar. */}
                      {liveSession.length > 1 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <button type="button" onClick={() => goToLiveExercise(idx - 1)} disabled={idx === 0}
                              aria-label={t('activeSession.prevExercise')}
                              className="w-9 h-9 rounded-lg border border-s700 text-content flex items-center justify-center disabled:opacity-30 flex-shrink-0 active:scale-95"><Icon name="back" size={16} /></button>
                            <div className="flex items-center gap-1.5">
                              {liveSession.map((s, i) => (
                                <button type="button" key={s.log.id} onClick={() => goToLiveExercise(i)}
                                  aria-label={t('activeSession.position', { current: i + 1, total: liveSession.length })}
                                  className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-brand-gradient' : 'w-1.5 bg-s600'}`} />
                              ))}
                            </div>
                            <button type="button" onClick={() => goToLiveExercise(idx + 1)} disabled={idx === liveSession.length - 1}
                              aria-label={t('activeSession.nextExercise')}
                              className="w-9 h-9 rounded-lg border border-s700 text-content flex items-center justify-center disabled:opacity-30 flex-shrink-0 active:scale-95"><Icon name="next" size={16} /></button>
                          </div>
                          <p className="text-center text-[11px] text-s500 font-medium">
                            {t('activeSession.position', { current: idx + 1, total: liveSession.length })}
                          </p>
                        </div>
                      )}

                      <ActiveExerciseCard
                        log={log}
                        isCardio={entry.isCardio}
                        onLogChanged={handleLiveLogChanged}
                        userColor={userColor}
                        hideTitle
                      />
                      {isDone ? (
                        <button onClick={() => markExerciseOpen(log.id)}
                          className="w-full border border-s600 text-content font-semibold h-11 rounded-xl text-sm hover:bg-s700 transition-colors">
                          {t('activeSession.reopenExercise')}
                        </button>
                      ) : (
                        <button onClick={() => markExerciseCompleted(log.id)}
                          className="w-full bg-success text-white font-bold h-11 rounded-xl text-sm flex items-center justify-center gap-2">
                          <Icon name="check" size={16} strokeWidth={2.2} /> {t('activeSession.completeExercise')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Sobald alle Übungen erledigt sind: hervorgehobener Abschluss-Hinweis */}
            {allDone ? (
              <div className="panel-success rounded-xl px-4 py-3 text-center space-y-2">
                <p className="font-bold text-sm">{t('activeSession.allDone')}</p>
                <button onClick={finishLiveSession}
                  className="w-full bg-brand-gradient text-white font-bold h-11 rounded-xl text-sm">
                  {t('activeSession.finishWorkout')}
                </button>
              </div>
            ) : (
              <button onClick={finishLiveSession}
                className="w-full text-sm text-accent font-bold hover:opacity-80 h-10">
                {t('activeSession.finish')}
              </button>
            )}
            <button onClick={cancelLiveSession}
              className="w-full text-xs text-danger font-semibold hover:opacity-80 h-9">
              {t('activeSession.cancelWorkout')}
            </button>
          </div>
          )
        })()}

        {isToday && (
          <div className="mb-6">
            <h2 className="text-lg font-extrabold tracking-tight text-content mb-3">{t('dashboard.templatesTitle')}</h2>
            <WorkoutTemplates exercises={exercises} onStarted={handleWorkoutStarted} userColor={userColor} />
          </div>
        )}

        {/* Heute trainiert — eine Karte, Einträge durch Linien getrennt */}
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold tracking-tight text-content">{isToday ? t('dashboard.todayWorkouts') : t('dashboard.workouts')}</h2>
          {daySessions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {daySessions.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1.5 border border-s700 text-content text-xs font-semibold px-2.5 h-8 rounded-lg tabular-nums">
                  <Icon name="timer" size={14} className="text-s400" />
                  {s.template_name ? `${s.template_name} · ` : ''}{formatDuration(s.duration_sec)}
                </span>
              ))}
            </div>
          )}
          {visibleLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-s700 text-center py-10">
              <p className="text-s400 text-sm">{t('dashboard.noEntries')}</p>
            </div>
          ) : (
            <div className="bg-s800 border border-s700 rounded-xl divide-y divide-s700 overflow-hidden">
              {visibleLogs.map((log) => (
                <div key={log.id} className="px-4 py-3.5 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-content text-[15px]">{log.exercise_name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs tabular-nums">
                      {log.duration_min != null ? (
                        <span className="bg-s900 text-warn font-semibold px-2 py-0.5 rounded">{cardioLabel(log)}</span>
                      ) : log.sets.length > 0 ? (
                        log.sets.map(s => (
                          <span key={s.id} className="bg-s900 text-warn font-semibold px-2 py-0.5 rounded">{setLabel(s)}</span>
                        ))
                      ) : (
                        <span className="bg-s900 text-s500 font-medium px-2 py-0.5 rounded">{t('dashboard.noSetsYet')}</span>
                      )}
                      {log.volume_kg != null && <span className="text-s400 font-semibold px-1 py-0.5">{log.volume_kg} kg Vol.</span>}
                    </div>
                    {log.notes && (
                      <p className="mt-1.5 text-xs text-s400 whitespace-pre-wrap break-words flex gap-1.5">
                        <Icon name="note" size={14} className="mt-px" /><span>{log.notes}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex -mr-2">
                    <button onClick={() => openEditLog(log)} title={t('common.edit')} aria-label={t('common.edit')}
                      className="w-10 h-10 rounded-lg text-s400 hover:text-content hover:bg-s700 flex items-center justify-center transition-colors"><Icon name="edit" size={17} /></button>
                    <button onClick={() => handleDeleteLog(log.id)} title={t('common.delete')} aria-label={t('common.delete')}
                      className="w-10 h-10 rounded-lg text-s400 hover:text-danger hover:bg-s700 flex items-center justify-center transition-colors"><Icon name="trash" size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        </>)}
      </div>

      {/* Footer */}
      <div className="mt-12 mb-6 text-center space-y-3">
        {/* wie MacroBandit: CrashBandit82 = Feedback, darunter Shake, darunter Version */}
        <div className="inline-flex items-center gap-0.5 text-sm font-semibold">
          <button onClick={() => setShowFeedback(true)} className="hover:opacity-80 transition-opacity" title="Feedback senden">
            <span className="text-accent">Crash</span>
            <span className="text-success">Bandit</span>
            <span className="text-s500 font-black">82</span>
          </button>
        </div>
        <div>
          <button onClick={() => setShowShake(true)} className="text-sm text-s500 hover:text-content transition-colors">
            🥤 Buy me a Shake
          </button>
        </div>
        {/* Versionsnummer — dezent, aus frontend/package.json injiziert */}
        <p className="text-s500 text-[11px] font-mono tracking-wider">v{APP_VERSION}</p>
      </div>
      {showShake && <ShakeModal onClose={() => setShowShake(false)} />}

      {/* Update-Hinweis, sobald ein neues Deploy bereitliegt (nicht blockierend) */}
      <UpdateBanner />

      {/* FAB — add an exercise to the currently viewed day (today or a past day) */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-3 bg-gradient-to-t from-s900 via-s900 to-transparent pointer-events-none"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <button onClick={() => { resetAddWorkoutForm(); setShowAddWorkout(true) }}
          className="pointer-events-auto mx-auto max-w-lg w-full h-14 bg-brand-gradient text-white rounded-xl shadow-xl flex items-center justify-center gap-2 text-base font-bold">
          <Icon name="plus" size={20} strokeWidth={2.2} />
          {t('dashboard.addExerciseBar')}
        </button>
      </div>

      {/* MODAL: Workout hinzufügen — Redesign 2026-10: einheitliches Fenster (Sheet) */}
      {showAddWorkout && (
        <Sheet title={t('dashboard.addWorkoutTitle')} onClose={closeAddWorkout} z="z-40">
            {!selectedExercise ? (
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-s500 pointer-events-none"><Icon name="search" /></span>
                  <input
                    type="text" placeholder={t('dashboard.exerciseSearchPlaceholder')} aria-label={t('dashboard.exerciseSearchPlaceholder')}
                    value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
                    className={`${feld} pl-10`}
                    autoFocus
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-s700 divide-y divide-s700 empty:hidden">
                  {filteredExercises.map(ex => (
                    <div key={ex.id} className="flex items-center">
                      <button onClick={() => handleSelectExercise(ex)}
                        className="flex-1 text-left px-3.5 py-3 hover:bg-s700 text-sm text-content transition-colors min-w-0">
                        <span className="block font-semibold truncate">{ex.name}</span>
                        <span className="block text-s500 text-xs truncate">{ex.muscle_group || ex.category}{ex.is_cardio ? ' · Cardio' : ''}</span>
                      </button>
                      {canEditExercise(ex) && (
                        <>
                          <button onClick={() => openEditExercise(ex)}
                            title={t('common.edit')} aria-label={t('common.edit')}
                            className="w-10 h-10 flex-shrink-0 rounded-lg text-s400 hover:text-content hover:bg-s700 flex items-center justify-center transition-colors">
                            <Icon name="edit" size={16} />
                          </button>
                          <button onClick={() => handleDeleteExercise(ex)}
                            title={t('dashboard.deleteExerciseButton')} aria-label={t('dashboard.deleteExerciseButton')}
                            className="w-10 h-10 mr-1 flex-shrink-0 rounded-lg text-s400 hover:text-danger hover:bg-s700 flex items-center justify-center transition-colors">
                            <Icon name="trash" size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {filteredTotal > filteredExercises.length && (
                    <p className="text-s500 text-xs px-3.5 py-2">
                      {t('dashboard.moreResults', { count: filteredTotal - filteredExercises.length })}
                    </p>
                  )}
                  {exerciseSearch && filteredExercises.length === 0 && !showCustomExercise && (
                    <button onClick={() => { resetCustomExerciseForm(); setShowCustomExercise(true); setCustomName(exerciseSearch) }}
                      className="w-full text-left px-3.5 py-3 text-sm text-success font-semibold flex items-center gap-2">
                      <Icon name="plus" size={16} />{t('dashboard.createExercise', { name: exerciseSearch })}
                    </button>
                  )}
                </div>

                {/* Immer sichtbarer Weg, eine eigene Übung anzulegen */}
                {!showCustomExercise && (
                  <button onClick={() => { resetCustomExerciseForm(); setShowCustomExercise(true); setCustomName(exerciseSearch) }}
                    className="w-full h-11 rounded-xl border border-dashed border-s600 text-content hover:border-brand-orange hover:text-accent transition-colors text-sm font-semibold flex items-center justify-center gap-2">
                    <Icon name="plus" size={16} /> {t('dashboard.newExerciseButton')}
                  </button>
                )}

                {showCustomExercise && (
                  <div className="bg-s900 rounded-xl p-4 space-y-3 border border-s700">
                    <h4 className="text-content font-bold text-sm">{editingExerciseId ? t('dashboard.editExerciseTitle') : t('dashboard.createExerciseButton')}</h4>
                    <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                      placeholder={t('dashboard.exerciseNameLabel')} aria-label={t('dashboard.exerciseNameLabel')}
                      className={feldInnen} />
                    <div className="grid grid-cols-5 gap-1 bg-s800 p-1 rounded-lg border border-s700">
                      {['Push', 'Pull', 'Legs', 'Core', 'Cardio'].map(cat => (
                        <button key={cat} type="button" onClick={() => { setCustomCategory(cat); setCustomIsCardio(cat === 'Cardio') }}
                          className={`py-2 rounded-md text-xs transition-colors ${customCategory === cat ? 'bg-brand-gradient text-white font-bold' : 'text-s400 font-medium hover:text-content'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={customMuscle} onChange={e => setCustomMuscle(e.target.value)}
                      placeholder={t('dashboard.muscleGroupLabel')} aria-label={t('dashboard.muscleGroupLabel')}
                      className={feldInnen} />
                    <input type="text" value={customEquipment} onChange={e => setCustomEquipment(e.target.value)}
                      placeholder={t('dashboard.equipmentLabel')} aria-label={t('dashboard.equipmentLabel')}
                      className={feldInnen} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowCustomExercise(false); resetCustomExerciseForm() }}
                        className={knopfZweit}>{t('common.cancel')}</button>
                      <button type="button" onClick={handleSaveCustomExercise} disabled={apiLoading || !customName.trim()}
                        className={knopfHaupt}>
                        {editingExerciseId ? t('common.save') : t('dashboard.createExerciseButton')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedExercise.is_cardio ? (
              <form onSubmit={handleAddCardioWorkout} className="space-y-4">
                <div className="bg-s900 border border-s700 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                  <span className="text-content font-bold truncate">{selectedExercise.name}</span>
                  <button type="button" onClick={() => setSelectedExercise(null)} className="text-s400 hover:text-content text-sm font-semibold">{t('templates.cancel')}</button>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label htmlFor="add-duration" className={label}>{t('templates.durationLabel')}</label>
                    <input id="add-duration" type="number" inputMode="decimal" required value={logDuration} onChange={e => setLogDuration(e.target.value)}
                      className={feld} />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="add-distance" className={label}>{t('templates.distanceLabel')}</label>
                    <input id="add-distance" type="number" inputMode="decimal" step="0.1" value={logDistance} onChange={e => setLogDistance(e.target.value)}
                      className={feld} />
                  </div>
                </div>

                <button type="submit" disabled={apiLoading}
                  className="w-full bg-brand-gradient text-white font-bold h-12 rounded-xl disabled:opacity-50">
                  {apiLoading ? t('auth.loading') : t('dashboard.logWorkoutButton')}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {!activeAdHocLog ? (
                  <p className="text-s400 text-sm text-center py-6">{t('activeSession.saving')}</p>
                ) : (
                  <ActiveExerciseCard
                    log={activeAdHocLog}
                    isCardio={false}
                    onLogChanged={handleAdHocLogChanged}
                    userColor={userColor}
                  />
                )}
                <div className="flex gap-2">
                  <button onClick={cancelAdHocExercise} className={knopfZweit}>
                    {t('common.cancel')}
                  </button>
                  <button onClick={finishAdHocWorkout} className={knopfHaupt}>
                    {t('activeSession.finish')}
                  </button>
                </div>
              </div>
            )}
        </Sheet>
      )}

      {/* MODAL: Log bearbeiten — per-set editor, works for any day incl. history */}
      {editingLog && (
        <Sheet title={t('dashboard.editAmountTitle')} onClose={() => setEditingLog(null)}>
            <p className="text-s400 text-sm -mt-3 mb-4">{formatDisplayDate()}</p>
            <ActiveExerciseCard
              log={editingLog}
              isCardio={editingLog.duration_min != null}
              onLogChanged={handleEditingLogChanged}
              userColor={userColor}
              hideRestTimer
            />
            <button onClick={() => setEditingLog(null)}
              className="w-full mt-4 bg-brand-gradient text-white font-bold h-12 rounded-xl">
              {t('activeSession.finish')}
            </button>
        </Sheet>
      )}

      {/* MODAL: Wochenziel bearbeiten */}
      {showEditGoal && (
        <Sheet title={t('weekly.editGoal')} onClose={() => setShowEditGoal(false)} maxW="max-w-sm">
            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label htmlFor="goal-input" className={label}>{t('weekly.workoutsUnit')} / {t('weekly.perWeek')}</label>
                <input id="goal-input" type="number" inputMode="numeric" min="1" max="14" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                  className="w-full bg-s900 border border-s700 text-content text-2xl font-extrabold rounded-xl px-4 h-14 outline-none focus:border-brand-orange transition-colors text-center"
                  autoFocus />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowEditGoal(false)} className={knopfZweit}>{t('dashboard.cancelButton')}</button>
                <button type="submit" disabled={apiLoading} className={knopfHaupt}>
                  {apiLoading ? '...' : t('dashboard.saveButton')}
                </button>
              </div>
            </form>
        </Sheet>
      )}

      {/* MODAL: Konto — Liste mit Symbolen wie MacroBandit 2.0 */}
      {showAccountMenu && (
        <Sheet
          title={{
            menu: t('dashboard.account'),
            username: t('dashboard.changeUsername'),
            password: t('dashboard.changePassword'),
            reminder: t('dashboard.reminderMenuItem'),
            restTimer: t('rest.settingsMenuItem'),
            delete: t('dashboard.deleteAccountMenuItem'),
          }[accountTab] || t('dashboard.account')}
          onBack={accountTab !== 'menu' ? () => setAccountTab('menu') : undefined}
          onClose={() => { setShowAccountMenu(false); setAccountTab('menu') }}>
              {accountTab === 'menu' && (
                <div className="space-y-4">
                  {/* Theme toggle — light/dark, persisted to the account */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-content font-semibold text-sm">{t('dashboard.themeLabel')}</span>
                    <div className="grid grid-cols-2 gap-1 bg-s900 rounded-xl p-1 border border-s700">
                      {[['light', 'sun', 'themeLight'], ['dark', 'moon', 'themeDark']].map(([val, icon, key]) => (
                        <button key={val} onClick={() => setTheme(val)}
                          className={`px-3 h-9 rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors ${theme === val ? 'bg-s800 text-content font-semibold shadow-md' : 'text-s400 font-medium hover:text-content'}`}>
                          <Icon name={icon} size={15} /> {t(`dashboard.${key}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-s900 border border-s700 rounded-xl divide-y divide-s700 overflow-hidden">
                    <KontoZeile icon="user" title={t('dashboard.changeUsername')} sub={user.username} onClick={() => setAccountTab('username')} chevron />
                    <KontoZeile icon="key" title={t('dashboard.changePassword')} onClick={() => setAccountTab('password')} chevron />
                    <KontoZeile icon="bell" title={t('dashboard.reminderMenuItem')} sub={reminderTime || undefined} onClick={() => setAccountTab('reminder')} chevron />
                    <KontoZeile icon="timer" title={t('rest.settingsMenuItem')}
                      sub={`${Math.floor((user.rest_timer_seconds ?? 90) / 60)}:${String((user.rest_timer_seconds ?? 90) % 60).padStart(2, '0')} min`}
                      onClick={() => setAccountTab('restTimer')} chevron />
                    <KontoZeile icon="download" title={t('dashboard.exportData')} onClick={handleExportData} />
                    <ShareButton className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-s700 transition-colors text-left text-sm font-semibold text-accent" compact />
                  </div>

                  <div className="bg-s900 border border-s700 rounded-xl divide-y divide-s700 overflow-hidden">
                    <KontoZeile icon="logout" title={t('dashboard.logoutMenuItem')} onClick={logout} />
                    <KontoZeile icon="trash" title={t('dashboard.deleteAccountMenuItem')} onClick={() => setAccountTab('delete')} danger chevron />
                  </div>
                </div>
              )}

              {accountTab === 'username' && (
                <form onSubmit={handleChangeUsername} className="space-y-4">
                  <div>
                    <label htmlFor="acc-username" className={label}>{t('dashboard.changeUsername')}</label>
                    <input id="acc-username" type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
                      placeholder={user.username} autoFocus className={feld} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAccountTab('menu')} className={knopfZweit}>{t('dashboard.cancelButton')}</button>
                    <button type="submit" disabled={apiLoading} className={knopfHaupt}>{t('dashboard.saveButton')}</button>
                  </div>
                </form>
              )}

              {accountTab === 'password' && (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label htmlFor="acc-pw-cur" className={label}>{t('dashboard.currentPasswordLabel')}</label>
                    <input id="acc-pw-cur" type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} required
                      autoFocus className={feld} />
                  </div>
                  <div>
                    <label htmlFor="acc-pw-new" className={label}>{t('dashboard.newPasswordLabel')}</label>
                    <input id="acc-pw-new" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} required
                      className={feld} />
                  </div>
                  <div>
                    <label htmlFor="acc-pw-rep" className={label}>{t('auth.repeatLabel')}</label>
                    <input id="acc-pw-rep" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} required
                      className={feld} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAccountTab('menu')} className={knopfZweit}>{t('dashboard.cancelButton')}</button>
                    <button type="submit" disabled={apiLoading} className={knopfHaupt}>{t('dashboard.saveButton')}</button>
                  </div>
                </form>
              )}

              {accountTab === 'reminder' && (
                <div className="space-y-4">
                  <p className="text-s400 text-sm">{t('dashboard.reminderInfo')}</p>
                  <input type="time" value={reminderTime} onChange={e => handleSaveReminder(e.target.value)} aria-label={t('dashboard.reminderMenuItem')}
                    className="w-full bg-s900 border border-s700 text-content text-xl font-bold rounded-xl px-4 h-12 outline-none focus:border-brand-orange transition-colors" />
                  {reminderTime && (
                    <button onClick={() => handleSaveReminder('')} disabled={reminderSaving}
                      className="w-full text-danger font-semibold h-10 rounded-xl text-sm hover:bg-s700 transition-colors">{t('dashboard.reminderDisable')}</button>
                  )}
                </div>
              )}

              {accountTab === 'restTimer' && (
                <div className="space-y-4">
                  <p className="text-s400 text-sm">{t('rest.settingsInfo')}</p>
                  {/* Bindet direkt an den serverseitigen Standard — jede Änderung
                      wird sofort pro Konto gespeichert (geräteübergreifend). */}
                  <RestDurationPicker
                    value={user.rest_timer_seconds ?? 90}
                    onChange={(s) => setRestDefault(s)}
                  />
                  <RestNotifySettings />
                </div>
              )}

              {accountTab === 'delete' && (
                <form onSubmit={handleDeleteAccount} className="space-y-4">
                  <p className="panel-danger rounded-xl px-4 py-3 text-sm font-semibold">{t('dashboard.deleteWarning')}</p>
                  <div>
                    <label htmlFor="acc-del-pw" className={label}>{t('dashboard.currentPasswordLabel')}</label>
                    <input id="acc-del-pw" type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} required
                      className={feld.replace('focus:border-brand-orange', 'focus:border-rose-500')} />
                  </div>
                  <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} required
                    placeholder={t('dashboard.deleteConfirmPlaceholder', { word: deleteConfirmWord })}
                    aria-label={t('dashboard.deleteConfirmPlaceholder', { word: deleteConfirmWord })}
                    className={feld.replace('focus:border-brand-orange', 'focus:border-rose-500')} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAccountTab('menu')} className={knopfZweit}>{t('dashboard.cancelButton')}</button>
                    <button type="submit" disabled={apiLoading} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold h-11 rounded-xl text-sm disabled:opacity-50 transition-colors">{t('dashboard.deleteAccountConfirmButton')}</button>
                  </div>
                </form>
              )}
        </Sheet>
      )}

      {/* MODAL: Feedback */}
      {showFeedback && (
        <Sheet title={t('dashboard.feedbackTitle')} onClose={() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackMsg('') }}>
              {feedbackSent ? (
                <div className="text-center space-y-3 py-6">
                  <div className="w-12 h-12 mx-auto rounded-full bg-success text-white flex items-center justify-center"><Icon name="check" size={24} strokeWidth={2.4} /></div>
                  <p className="text-success font-bold text-lg">{t('dashboard.feedbackThanks')}</p>
                </div>
              ) : (
                <form onSubmit={handleFeedback} className="space-y-4">
                  <textarea value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)}
                    placeholder={t('dashboard.feedbackPlaceholder')} aria-label={t('dashboard.feedbackTitle')}
                    rows={5} required autoFocus
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-orange transition-colors placeholder-s500 resize-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setShowFeedback(false); setFeedbackMsg('') }} className={knopfZweit}>{t('dashboard.cancelButton')}</button>
                    <button type="submit" disabled={apiLoading || !feedbackMsg.trim()} className={knopfHaupt}>
                      {apiLoading ? t('dashboard.sending') : t('dashboard.sendButton')}
                    </button>
                  </div>
                </form>
              )}
        </Sheet>
      )}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  )
}
