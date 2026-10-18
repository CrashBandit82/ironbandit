import { useTranslation } from "react-i18next"
import Icon from "./Icon"

// Redesign 2026-10: einheitliches Fenster — auf dem Handy von unten (mit Griff),
// ab Tablet-Breite mittig. Ersetzt die bisherigen, unterschiedlich gebauten Modals.
export default function Sheet({ title, onClose, onBack, children, z = "z-50", maxW = "max-w-md" }) {
  const { t } = useTranslation()
  return (
    <div className={`fixed inset-0 bg-overlay ${z} flex items-end sm:items-center justify-center sm:p-4`}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        className={`bg-s800 border-t sm:border border-s700 w-full ${maxW} rounded-t-2xl sm:rounded-2xl px-5 pt-3 shadow-2xl max-h-[92vh] overflow-y-auto`}
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded bg-s600 sm:hidden" />
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1 min-w-0">
            {onBack && (
              <button type="button" onClick={onBack} aria-label={t("common.back")}
                className="w-10 h-10 -ml-2 flex-shrink-0 flex items-center justify-center rounded-xl text-s400 hover:text-content hover:bg-s700 transition-colors">
                <Icon name="back" />
              </button>
            )}
            <h2 className="text-xl font-extrabold tracking-tight text-content truncate">{title}</h2>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label={t("common.close")}
              className="w-11 h-11 -mr-2 flex-shrink-0 flex items-center justify-center rounded-xl text-s400 hover:text-content hover:bg-s700 transition-colors">
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
