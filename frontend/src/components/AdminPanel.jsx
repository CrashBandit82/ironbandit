import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

export default function AdminPanel({ onClose }) {
  const { t } = useTranslation()
  const { authFetch } = useAuth()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [activeTab, setActiveTab] = useState("users")
  const [broadcastSubject, setBroadcastSubject] = useState("")
  const [broadcastMsg, setBroadcastMsg] = useState("")
  const [inactiveDays, setInactiveDays] = useState(30)
  const [warningDays, setWarningDays] = useState(7)
  const [sending, setSending] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer) }
  }, [success])

  const load = useCallback(async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        authFetch(`${API}/admin/users`),
        authFetch(`${API}/admin/stats`)
      ])
      setUsers(await usersRes.json())
      setStats(await statsRes.json())
    } catch (e) { setError(t('admin.loadError')) }
    finally { setLoading(false) }
  }, [authFetch, t])

  useEffect(() => { load() }, [load])

  const deleteUser = async (user) => {
    if (!window.confirm(t('admin.deleteUserConfirm', { username: user.username, email: user.email }))) return
    setLoadingId(`del-${user.id}`)
    try {
      const res = await authFetch(`${API}/admin/users/${user.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
      load()
    } catch (e) { setError(e.message) } finally { setLoadingId(null) }
  }

  const toggleActive = async (user) => {
    setLoadingId(`active-${user.id}`)
    try {
      const res = await authFetch(`${API}/admin/users/${user.id}/toggle-active`, { method: "PUT" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
      load()
    } catch (e) { setError(e.message) } finally { setLoadingId(null) }
  }

  const toggleVerified = async (user) => {
    const action = user.is_verified ? t('admin.revokeVerification') : t('admin.manualVerify')
    if (!window.confirm(t('admin.confirmAction', { action, username: user.username }))) return
    setLoadingId(`ver-${user.id}`)
    try {
      const res = await authFetch(`${API}/admin/users/${user.id}/toggle-verified`, { method: "PUT" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
      load()
    } catch (e) { setError(e.message) } finally { setLoadingId(null) }
  }

  const resendVerification = async (user) => {
    if (!window.confirm(t('admin.resendVerificationConfirm', { username: user.username, email: user.email }))) return
    setLoadingId(`resend-${user.id}`)
    try {
      const res = await authFetch(`${API}/admin/users/${user.id}/resend-verification`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(t('admin.verificationSentTo', { username: user.username }))
    } catch (e) { setError(e.message) } finally { setLoadingId(null) }
  }

  const handleBroadcast = async (e) => {
    e.preventDefault()
    if (!broadcastSubject.trim() || !broadcastMsg.trim()) return
    if (!window.confirm(t('admin.confirmBroadcast'))) return
    setSending(true)
    try {
      const res = await authFetch(`${API}/admin/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: broadcastSubject, message: broadcastMsg })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
      setBroadcastSubject(""); setBroadcastMsg("")
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  const handleNotifyInactive = async () => {
    if (!window.confirm(t('admin.inactiveConfirm', { days: inactiveDays }))) return
    setSending(true)
    try {
      const res = await authFetch(`${API}/admin/notify-inactive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days_inactive: inactiveDays, warning_days: warningDays })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  const handleImportWger = async () => {
    if (!window.confirm(t('admin.importWgerConfirm'))) return
    setImporting(true)
    try {
      const res = await authFetch(`${API}/admin/import-wger`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setSuccess(data.message)
      load()
    } catch (e) { setError(e.message) } finally { setImporting(false) }
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const tabs = [
    { id: "users",     label: t('admin.tabUsers') },
    { id: "broadcast", label: t('admin.tabBroadcast') },
    { id: "inactive",  label: t('admin.tabInactive') },
    { id: "import",    label: t('admin.tabImport') },
  ]

  const feld = "w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-11 text-sm outline-none focus:border-brand-orange transition-colors placeholder:text-s500"
  const label = "block text-xs font-semibold text-s400 mb-1.5"
  const aktion = "w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
  const warte = <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />

  return (
    <div className="fixed inset-0 bg-s900 z-50 flex flex-col overflow-hidden">

      <div className="border-b border-s700 px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-500/15 text-warn"><Icon name="shield" /></span>
          <div>
            <h1 className="text-content font-extrabold text-lg leading-tight tracking-tight">{t('admin.title')}</h1>
            <p className="text-s400 text-xs">{t('admin.subtitle')}</p>
          </div>
        </div>
        <button onClick={onClose} aria-label={t('admin.close')}
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-s400 hover:text-content hover:bg-s800 transition-colors">
          <Icon name="close" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
       <div className="max-w-3xl mx-auto p-4 space-y-4">

        {error   && <div className="panel-danger rounded-xl px-4 py-2.5 font-semibold text-sm">{error}</div>}
        {success && <div className="panel-success rounded-xl px-4 py-2.5 font-semibold text-sm">{success}</div>}

        <div className="grid grid-cols-4 gap-1 bg-s800 border border-s700 p-1 rounded-xl">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 rounded-lg text-xs sm:text-sm truncate transition-colors ${activeTab === tab.id ? "bg-s900 text-content font-semibold" : "text-s400 font-medium hover:text-content"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Broadcast ── */}
        {activeTab === "broadcast" && (
          <div className="bg-s800 border border-s700 rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-content font-bold text-[15px]">{t('admin.broadcastTitle')}</h3>
              <p className="text-s400 text-xs mt-0.5">{t('admin.broadcastInfo')}</p>
            </div>
            <form onSubmit={handleBroadcast} className="space-y-3">
              <div>
                <label htmlFor="adm-subject" className={label}>{t('admin.subjectLabel')}</label>
                <input id="adm-subject" type="text" value={broadcastSubject} onChange={e => setBroadcastSubject(e.target.value)}
                  placeholder={t('admin.subjectPlaceholder')} className={feld} required />
              </div>
              <div>
                <label htmlFor="adm-msg" className={label}>{t('admin.messageLabel')}</label>
                <textarea id="adm-msg" value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
                  placeholder={t('admin.messagePlaceholder')}
                  rows={6} required
                  className={feld.replace('h-11', 'py-3') + " resize-none"} />
              </div>
              <button type="submit" disabled={sending || !broadcastSubject.trim() || !broadcastMsg.trim()}
                className="w-full bg-brand-gradient disabled:opacity-50 text-white font-bold h-11 rounded-xl text-sm">
                {sending ? t('admin.sending') : t('admin.sendToUsers', { count: stats?.verified_users || '—' })}
              </button>
            </form>
          </div>
        )}

        {/* ── TAB: Inaktiv ── */}
        {activeTab === "inactive" && (
          <div className="bg-s800 border border-s700 rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-content font-bold text-[15px]">{t('admin.inactiveTitle')}</h3>
              <p className="text-s400 text-xs mt-0.5">{t('admin.inactiveInfo')}</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adm-inactive" className={label}>{t('admin.inactiveDaysLabel')}</label>
                  <input id="adm-inactive" type="number" inputMode="numeric" value={inactiveDays} onChange={e => setInactiveDays(parseInt(e.target.value))}
                    min={7} max={365} className={feld} />
                </div>
                <div>
                  <label htmlFor="adm-warning" className={label}>{t('admin.warningDaysLabel')}</label>
                  <input id="adm-warning" type="number" inputMode="numeric" value={warningDays} onChange={e => setWarningDays(parseInt(e.target.value))}
                    min={1} max={30} className={feld} />
                </div>
              </div>
              <p className="text-s500 text-xs">{t('admin.inactiveSince', { days: inactiveDays })}</p>
              <div className="bg-s900 border border-s700 rounded-lg p-3.5 text-xs text-s400 space-y-1">
                <p className="font-semibold text-s300">{t('admin.mailContains')}</p>
                <p>{t('admin.mailHint1', { days: inactiveDays })}</p>
                <p>{t('admin.mailHint2', { days: warningDays })}</p>
                <p>{t('admin.mailHint3')}</p>
                <p className="text-warn font-semibold pt-1">{t('admin.noDelete')}</p>
              </div>
              <button onClick={handleNotifyInactive} disabled={sending}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#1a1205] font-bold h-11 rounded-xl text-sm transition-colors">
                {sending ? t('admin.sending') : t('admin.sendWarnings')}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: wger Import ── */}
        {activeTab === "import" && (
          <div className="bg-s800 border border-s700 rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-content font-bold text-[15px]">{t('admin.importWgerTitle')}</h3>
              <p className="text-s400 text-xs mt-0.5">{t('admin.importWgerInfo')}</p>
            </div>
            <div className="bg-s900 border border-s700 rounded-lg p-3.5 text-xs text-s400 space-y-1">
              <p>{t('admin.importWgerHint1')}</p>
              <p>{t('admin.importWgerHint2')}</p>
            </div>
            <button onClick={handleImportWger} disabled={importing}
              className="w-full border border-s600 text-content hover:bg-s700 disabled:opacity-50 font-semibold h-11 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              <Icon name="download" size={16} />
              {importing ? t('admin.importing') : t('admin.importWgerButton')}
            </button>
          </div>
        )}

        {/* ── TAB: Users ── */}
        {activeTab === "users" && <>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('admin.totalUsers'),   value: stats.total_users,         dot: "bg-chart1" },
              { label: t('admin.verified'),     value: stats.verified_users,      dot: "bg-chart2" },
              { label: t('admin.totalLogs'),    value: stats.total_workout_logs,  dot: "bg-chart3" },
              { label: t('admin.todayLogs'),    value: stats.today_workout_logs,  dot: "bg-chart4" },
            ].map(s => (
              <div key={s.label} className="bg-s800 border border-s700 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 text-s400 text-xs font-medium"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</div>
                <div className="text-2xl font-extrabold text-content mt-1 tracking-tight">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-s500 pointer-events-none"><Icon name="search" /></span>
          <input
            type="text" placeholder={t('admin.searchPlaceholder')} value={search} aria-label={t('admin.searchPlaceholder')}
            onChange={e => setSearch(e.target.value)}
            className={feld.replace('bg-s900', 'bg-s800') + " pl-10"}
          />
        </div>

        {loading ? (
          <div className="text-s400 text-center py-8 text-sm">{t('admin.loading')}</div>
        ) : (
          <div className="bg-s800 border border-s700 rounded-xl divide-y divide-s700 overflow-hidden">
            {filtered.map(user => (
              <div key={user.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-content font-semibold">{user.username}</span>
                      {user.is_admin    && <span className="text-[11px] bg-amber-500/15 text-warn px-1.5 py-0.5 rounded font-semibold">{t('admin.badgeAdmin')}</span>}
                      {!user.is_active  && <span className="text-[11px] bg-rose-500/15 text-danger px-1.5 py-0.5 rounded font-semibold">{t('admin.badgeBanned')}</span>}
                      {!user.is_verified && <span className="text-[11px] bg-s700 text-s300 px-1.5 py-0.5 rounded font-semibold">{t('admin.badgeUnverified')}</span>}
                    </div>
                    <div className="text-s400 text-xs mt-0.5 truncate">{user.email}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-s500">
                      <span>seit {user.created_at}</span>
                      <span>{user.workout_log_count} Workouts</span>
                      {user.last_active && <span>zuletzt {user.last_active}</span>}
                    </div>
                  </div>

                  {!user.is_admin && (
                    <div className="flex gap-1 flex-shrink-0">
                      {!user.is_verified && (
                        <>
                          <button
                            onClick={() => resendVerification(user)}
                            disabled={loadingId === `resend-${user.id}`}
                            title={t('admin.resendVerificationConfirm', { username: user.username, email: user.email })}
                            aria-label={t('admin.resendVerificationConfirm', { username: user.username, email: user.email })}
                            className={`${aktion} text-info hover:bg-s700`}
                          >
                            {loadingId === `resend-${user.id}` ? warte : <Icon name="mail" size={16} />}
                          </button>
                          <button
                            onClick={() => toggleVerified(user)}
                            disabled={loadingId === `ver-${user.id}`}
                            title={t('admin.manualVerify')} aria-label={t('admin.manualVerify')}
                            className={`${aktion} text-success hover:bg-s700`}
                          >
                            {loadingId === `ver-${user.id}` ? warte : <Icon name="check" size={16} />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => toggleActive(user)}
                        title={user.is_active ? t('admin.badgeBanned') : "Entsperren"}
                        aria-label={user.is_active ? t('admin.badgeBanned') : "Entsperren"}
                        disabled={loadingId === `active-${user.id}`}
                        className={`${aktion} ${user.is_active ? "text-warn hover:bg-s700" : "text-s300 bg-s700 hover:bg-s600"}`}
                      >
                        {loadingId === `active-${user.id}` ? warte : <Icon name={user.is_active ? "lock" : "unlock"} size={16} />}
                      </button>
                      <button
                        onClick={() => deleteUser(user)}
                        title={t('admin.deleteUserConfirm', { username: user.username, email: user.email })}
                        aria-label={t('admin.deleteUserConfirm', { username: user.username, email: user.email })}
                        className={`${aktion} text-danger hover:bg-rose-500/10`}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-s500 text-center py-8 text-sm">{t('admin.noUsers')}</div>
            )}
          </div>
        )}
        </>}
       </div>
      </div>
    </div>
  )
}
