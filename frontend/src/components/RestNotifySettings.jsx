import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  restNotifySupported, restNotifyEnabled, restNotifyPermission, isIosBrowserTab,
  enableRestNotify, setRestNotifyEnabled, sendTestNotification,
} from "../utils/restNotify"
import Icon from "./Icon"

// Einstellung "Pausen-Ende als Benachrichtigung" (für Smartwatches). Gilt pro
// Gerät — die Erlaubnis für Mitteilungen erteilt der Browser je Gerät.
export default function RestNotifySettings() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(restNotifyEnabled)
  const [perm, setPerm] = useState(restNotifyPermission)
  const [msg, setMsg] = useState(null)

  const toggle = async () => {
    setMsg(null)
    if (enabled) { setRestNotifyEnabled(false); setEnabled(false); return }
    const p = await enableRestNotify()
    setPerm(p)
    setEnabled(p === "granted")
    if (p === "granted") {
      sendTestNotification(t("rest.notifyTitle"), t("rest.notifyTestBody")).catch(() => {})
      setMsg(t("rest.notifyTestSent"))
    }
  }

  const test = async () => {
    setMsg(null)
    try { await sendTestNotification(t("rest.notifyTitle"), t("rest.notifyTestBody")); setMsg(t("rest.notifyTestSent")) }
    catch { setMsg(t("rest.notifyTestFailed")) }
  }

  return (
    <div className="rounded-xl bg-s900 border border-s700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-content font-bold text-sm flex items-center gap-2"><Icon name="watch" size={16} />{t("rest.notifyTitleSetting")}</p>
          <p className="text-s400 text-xs mt-1">{t("rest.notifyInfo")}</p>
        </div>
        {restNotifySupported() && !isIosBrowserTab() && (
          <button type="button" role="switch" aria-checked={enabled} onClick={toggle}
            className={`flex-shrink-0 w-12 h-7 rounded-full p-1 transition-colors ${enabled ? "bg-success" : "bg-s700"}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
        )}
      </div>

      {!restNotifySupported() && <p className="text-warn text-xs font-bold">{t("rest.notifyUnsupported")}</p>}
      {restNotifySupported() && isIosBrowserTab() && <p className="text-warn text-xs font-bold">{t("rest.notifyIosHint")}</p>}
      {perm === "denied" && <p className="text-danger text-xs font-bold">{t("rest.notifyDenied")}</p>}

      {enabled && (
        <>
          <p className="text-s400 text-xs">{t("rest.notifyWatchHint")}</p>
          <button type="button" onClick={test}
            className="w-full border border-s600 text-content font-semibold h-11 rounded-xl text-sm hover:bg-s800 transition-colors">{t("rest.notifyTestButton")}</button>
        </>
      )}
      {msg && <p className="text-s300 text-xs font-bold">{msg}</p>}
    </div>
  )
}
