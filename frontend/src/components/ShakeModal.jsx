import { useTranslation } from "react-i18next"

// "Buy me a Shake"-Fenster (PayPal + SEPA-QR) – genutzt auf der Startseite und im Dashboard-Footer
export default function ShakeModal({ onClose }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} className="bg-s800 border border-s700 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-s700">
          <h2 className="text-content font-black text-lg tracking-widest uppercase">{t("shake.title")}</h2>
          <button onClick={onClose} className="text-s400 hover:text-content text-2xl leading-none transition-colors">✕</button>
        </div>
        <div className="px-6 py-6 space-y-6">
          <p className="text-s400 text-sm leading-relaxed">{t("shake.text")}</p>
          <a href="https://www.paypal.me/GeriPe" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 rounded-xl transition-colors text-sm">
            {t("shake.paypal")}
          </a>
          <div className="bg-s900 border border-s700 rounded-xl p-4 text-center space-y-3">
            <p className="text-s400 text-xs font-bold uppercase tracking-widest">{t("shake.sepa")}</p>
            <div className="flex justify-center">
              <img src="/qr-code.png" alt="SEPA QR Code" width="160" height="160"
                className="w-40 h-40 rounded-lg bg-white p-2" />
            </div>
            <p className="text-s400 text-xs leading-relaxed whitespace-pre-line">{t("shake.sepaText")}</p>
          </div>
          <button onClick={onClose}
            className="w-full bg-s900 hover:bg-s700 border border-s700 text-content font-bold py-3 rounded-xl transition-colors text-sm">
            {t("shake.back")}
          </button>
        </div>
      </div>
    </div>
  )
}
