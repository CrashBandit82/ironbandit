// Test-Harness (kein Produktionscode): rendert NUR den UpdateBanner samt echtem
// useAppUpdate-Hook, damit der Service-Worker-Update-Flow ohne Login/Backend in
// einem echten Browser geprüft werden kann. Wird von test/sw-update.test.mjs
// gebaut/gefahren.
import React from 'react'
import ReactDOM from 'react-dom/client'
import '../i18n.js'
import '../index.css'
import UpdateBanner from '../components/UpdateBanner'
import { APP_VERSION } from '../version.js'

// Marker, an dem der Test erkennt, welche Bundle-Version gerade läuft und ob
// zwischenzeitlich (unerwünscht) neu geladen wurde.
window.__harnessBootId = Math.random().toString(36).slice(2)

ReactDOM.createRoot(document.getElementById('root')).render(
  <div className="min-h-screen bg-s900 text-s100 pb-32 px-4 pt-4 flex flex-col">
    {/* Kulisse, damit der Screenshot die Platzverhältnisse des Dashboards
        abbildet — inkl. FAB an genau derselben Position wie im Dashboard. */}
    <div className="flex items-center gap-2 mb-4 px-1">
      <span className="text-content font-black text-sm tracking-wide">IronBandit</span>
    </div>
    <div className="bg-s800/80 p-4 rounded-3xl border border-s700 shadow-xl mb-6">
      <div className="text-xs text-s400 font-bold uppercase tracking-widest">Angemeldet als</div>
      <div className="font-black text-lg leading-none">Gerald</div>
    </div>
    <div className="bg-s800 border border-s700/60 rounded-2xl p-4 mb-3">
      <h3 className="font-bold text-content text-base">Bankdrücken</h3>
      <div className="flex gap-2 mt-1.5 text-xs">
        <span className="bg-s900 text-warn font-black px-2 py-0.5 rounded-md">80kg × 8</span>
        <span className="bg-s900 text-warn font-black px-2 py-0.5 rounded-md">80kg × 7</span>
      </div>
    </div>
    <div className="flex-grow" />
    <div className="mt-12 mb-6 text-center space-y-3">
      <span className="text-sm font-black tracking-widest uppercase">
        <span className="text-brand-gradient">Iron</span>
        <span className="text-s500 font-black">Bandit</span>
      </span>
      <p className="text-[11px] text-s500 font-medium tracking-wide">v{APP_VERSION}</p>
    </div>

    <p id="running-version" data-version={APP_VERSION} className="hidden">
      running v{APP_VERSION}
    </p>

    <UpdateBanner />

    <button className="fixed bottom-8 right-6 w-16 h-16 bg-brand-gradient text-white rounded-full shadow-2xl flex items-center justify-center text-3xl font-black z-30">
      +
    </button>
  </div>
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
