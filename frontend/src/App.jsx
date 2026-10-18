import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import LandingPage from './components/LandingPage'
import { Impressum, Datenschutz, AGB, InstallGuide } from './components/PublicPages'

// Public, always-accessible pages (no login required). Keyed by pathname.
const PUBLIC_ROUTES = {
  '/impressum': Impressum,
  '/datenschutz': Datenschutz,
  '/agb': AGB,
  '/app-installieren': InstallGuide,
}

const API = import.meta.env.VITE_API_URL || '/api'

// Einmal-Tokens (E-Mail-Bestätigung, Passwort-Reset) kommen als URL-FRAGMENT
// (#token=…). Fragmente sendet der Browser nie an den Server — anders als ein
// Query-Parameter landen sie damit nicht im nginx-Access-Log. `?token=` wird
// weiterhin gelesen, damit E-Mail-Links von vor dieser Umstellung (24 h bzw.
// 1 h Gültigkeit) nicht ins Leere laufen.
function readTokenFromUrl() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
  return fromHash || new URLSearchParams(window.location.search).get('token')
}

function VerifyEmailScreen({ token, onDone }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    // POST mit Token im Body — als Query-Parameter stünde er im Access-Log.
    fetch(`${API}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => { if (!res.ok) throw new Error(); setStatus('ok') })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-screen bg-s900 flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-s800 border border-s700 rounded-2xl p-8 max-w-sm">
        {status === 'pending' && <p className="text-s300 font-bold">{t('verify.pending')}</p>}
        {status === 'ok' && <p className="text-success font-bold">{t('verify.ok')}</p>}
        {status === 'error' && <p className="text-danger font-bold">{t('verify.error')}</p>}
        <button
          onClick={() => { window.history.replaceState({}, '', '/'); onDone() }}
          className="mt-5 w-full bg-brand-gradient text-white font-black py-3 rounded-xl"
        >
          {t('verify.continue')}
        </button>
      </div>
    </div>
  )
}

function Root() {
  const { user, loading } = useAuth()
  const { t } = useTranslation()
  const [route, setRoute] = useState(() => {
    const path = window.location.pathname
    const token = readTokenFromUrl()
    if (path === '/verify-email' && token) return { name: 'verify-email', token }
    if (path === '/reset-password' && token) return { name: 'reset-password', token }
    if (PUBLIC_ROUTES[path]) return { name: 'public', path }
    return { name: 'app' }
  })

  // Token nach dem Einlesen aus der Adresszeile entfernen, damit er nicht in
  // Browser-History, Bookmarks oder einem Referer weiterlebt. Bewusst hier und
  // nicht im useState-Initializer: der läuft unter React.StrictMode doppelt,
  // beim zweiten Durchlauf wäre der Token dann schon weg.
  useEffect(() => {
    if (route.name === 'verify-email' || route.name === 'reset-password') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [route.name])

  // Public legal / install pages — reachable whether logged in or not.
  if (route.name === 'public') {
    const Page = PUBLIC_ROUTES[route.path]
    return <Page />
  }

  if (route.name === 'verify-email') {
    return <VerifyEmailScreen token={route.token} onDone={() => setRoute({ name: 'app' })} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-s900 flex items-center justify-center">
        <p className="text-s400 font-bold">{t('app.loading')}</p>
      </div>
    )
  }

  if (!user) {
    // Reset-Password kommt per E-Mail-Link mit Token → direkt in die AuthPage.
    // Alle anderen ausgeloggten Besucher sehen die Landingpage (mit Inline-Login).
    if (route.name === 'reset-password') {
      return <AuthPage resetToken={route.token} initialMode="reset" />
    }
    return <LandingPage />
  }

  return <Dashboard />
}

// Fallback-Hinweis im Querformat. Sichtbarkeit steuert reines CSS
// (@media orientation: landscape auf Phones) — siehe index.css. Der Text
// kommt aus i18n, deshalb als React-Komponente statt statisch im HTML.
function OrientationLock() {
  const { t } = useTranslation()
  return (
    <div className="orientation-lock" role="alert" aria-live="polite">
      <div className="orientation-lock__icon">📱</div>
      <div className="orientation-lock__title">{t('orientation.title')}</div>
      <div className="orientation-lock__hint">{t('orientation.hint')}</div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <OrientationLock />
    </AuthProvider>
  )
}
