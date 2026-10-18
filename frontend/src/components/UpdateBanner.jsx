import { useTranslation } from 'react-i18next'
import useAppUpdate from '../hooks/useAppUpdate'
import Icon from './Icon'

/**
 * Schmale Banner-Leiste am unteren Rand, sobald ein neues Deploy bereitliegt.
 *
 * Absichtlich nicht blockierend: kein Overlay, kein Backdrop, kein Auto-Reload.
 * Wer gerade einen Satz eintippt, arbeitet einfach weiter — der Hinweis bleibt
 * stehen, bis auf "Jetzt aktualisieren" getippt wird.
 *
 * Layout-Gotcha: `bottom-28` parkt die Leiste ÜBER dem FAB (der sitzt fixed auf
 * bottom-8 mit h-16, reicht also bis 6rem hoch) — so bleibt "Übung hinzufügen"
 * bedienbar und die Leiste darf trotzdem die volle Breite nutzen. Auf schmalen
 * Phones (390px) ist Platz knapp: deshalb nur eine Textzeile, die notfalls
 * zweizeilig umbricht, und kein zusätzlicher Erklärtext neben dem Button.
 * z-40 liegt über dem FAB (z-30), aber unter den Toasts (z-50).
 */
export default function UpdateBanner() {
  const { t } = useTranslation()
  const { updateReady, newVersion, applying, applyUpdate } = useAppUpdate()

  if (!updateReady) return null

  return (
    <div
      className="fixed left-4 right-4 bottom-28 z-40"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-lg bg-s800 border border-brand-orange/50 rounded-xl shadow-2xl pl-4 pr-2 py-2 flex items-center gap-2.5">
        <span className="text-accent"><Icon name="download" size={18} /></span>
        <p className="flex-1 min-w-0 text-content font-semibold text-sm leading-snug">
          {newVersion ? t('update.availableVersion', { version: newVersion }) : t('update.available')}
        </p>
        <button
          onClick={applyUpdate}
          disabled={applying}
          className="flex-shrink-0 bg-brand-gradient text-white text-sm font-bold px-3.5 h-10 rounded-lg disabled:opacity-60"
        >
          {applying ? t('update.applying') : t('update.button')}
        </button>
      </div>
    </div>
  )
}
