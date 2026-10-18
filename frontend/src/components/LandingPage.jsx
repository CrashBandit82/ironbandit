import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import PasswordStrength from "./PasswordStrength"
import ShakeModal from "./ShakeModal"

// ── IronBandit landing page ────────────────────────────────────────────────
// Structure ported from the MacroBandit landing hand-over (header · hero+auth
// tabs · sister-app card · feature grid · how-it-works · benefits · footer ·
// auto-install banner · share/install modals), but rendered entirely in
// IronBandit's own design tokens (bg-s900 / brand-gradient / accent, theme-aware
// via data-theme + CSS variables) and driven by IronBandit's AuthContext theme —
// no second theme system. Legal links point to the real routed pages so the
// crawler-visible /impressum, /datenschutz, /agb URLs (sitemap) keep working.

const API = import.meta.env.VITE_API_URL || "/api"
const GRAD = "bg-brand-gradient"
const SITE = "https://ironbandit.at/"

// ── Share fallback menu (browsers without navigator.share, i.e. most desktops) ─
function ShareModal({ onClose }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const text = t("share.text")
  const e = encodeURIComponent
  const targets = [
    { label: "WhatsApp", color: "bg-[#25D366]", href: `https://wa.me/?text=${e(text + " " + SITE)}` },
    { label: "Telegram", color: "bg-[#229ED9]", href: `https://t.me/share/url?url=${e(SITE)}&text=${e(text)}` },
    { label: "X", color: "bg-black", href: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(SITE)}` },
    { label: "Facebook", color: "bg-[#1877F2]", href: `https://www.facebook.com/sharer/sharer.php?u=${e(SITE)}` },
    { label: "E-Mail", color: "bg-s600", href: `mailto:?subject=${e("IronBandit")}&body=${e(text + " " + SITE)}` },
  ]
  const copy = async () => {
    try { await navigator.clipboard.writeText(SITE); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { window.prompt(t("share.copyPrompt"), SITE) }
  }
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} className="bg-s800 border border-s700 rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-s700">
          <h2 className="text-content font-black text-lg">{t("share.title")}</h2>
          <button onClick={onClose} className="text-s400 hover:text-content text-2xl leading-none transition-colors">✕</button>
        </div>
        <div className="px-6 py-6 space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {targets.map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" onClick={onClose}
                className={`${s.color} text-white font-black text-sm py-3 rounded-xl text-center transition-opacity hover:opacity-90`}>
                {s.label}
              </a>
            ))}
          </div>
          <button onClick={copy}
            className="w-full bg-s900 hover:bg-s700 border border-s700 text-content font-bold py-3 rounded-xl transition-colors text-sm">
            {copied ? t("share.copied") : t("share.copy")}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── "Buy me a Shake" support / donation modal ─────────────────────────────────

// ── Inline auth card: Anmelden / Registrieren / Passwort vergessen ────────────
function AuthCard() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [mode, setMode] = useState("login")        // login | register | forgot | registered
  const [form, setForm] = useState({ email: "", username: "", password: "" })
  const [forgotEmail, setForgotEmail] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value })
  const label = "block text-s400 text-xs font-bold uppercase tracking-widest mb-1"
  const field = "w-full bg-s900 border border-s700 text-content rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-brand-orange placeholder-s500"

  const submit = async (e) => {
    e.preventDefault()
    setError(""); setSuccess(""); setLoading(true)
    try {
      if (mode === "login") {
        try { await login(form.email, form.password) }
        catch (err) { throw new Error(Array.isArray(err.message) ? err.message.join(", ") : err.message) }
      } else if (mode === "register") {
        const res = await fetch(`${API}/auth/register`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, username: form.username, password: form.password }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(Array.isArray(err.detail) ? err.detail.map(x => x.msg).join(", ") : err.detail || t("auth.registerFailed"))
        }
        setRegisteredEmail(form.email); setMode("registered")
      } else if (mode === "forgot") {
        const res = await fetch(`${API}/auth/forgot-password`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: forgotEmail }),
        })
        const data = await res.json()
        setSuccess(data.message || t("auth.emailSent"))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-s800 border border-s700 rounded-3xl shadow-xl w-full max-w-md p-6">
      {mode === "registered" ? (
        <div className="text-center space-y-4">
          <div className="text-5xl mb-1">📧</div>
          <h3 className="text-content font-black text-xl">{t("auth.registeredTitle")}</h3>
          <p className="text-s400 text-sm leading-relaxed">
            {t("auth.registeredText1")}<br />
            <strong className="text-success">{registeredEmail}</strong><br />
            {t("auth.registeredText2")}
          </p>
          <div className="bg-s900 border border-s700 rounded-2xl p-4 text-left space-y-2">
            <p className="text-s300 text-sm font-bold">{t("auth.registeredStepsTitle")}</p>
            <p className="text-s400 text-xs">{t("auth.registeredStep1")}</p>
            <p className="text-s400 text-xs">{t("auth.registeredStep2")}</p>
            <p className="text-s400 text-xs">{t("auth.registeredStep3")}</p>
          </div>
          <button onClick={() => { setMode("login"); setForm({ email: registeredEmail, username: "", password: "" }) }}
            className={`w-full ${GRAD} text-white font-black py-3 rounded-xl`}>
            {t("auth.toLogin")}
          </button>
          <p className="text-s600 text-xs">{t("auth.noEmail")}</p>
        </div>
      ) : (
        <>
          {(mode === "login" || mode === "register") && (
            <div className="flex bg-s900 border border-s700 p-1 rounded-xl mb-6">
              <button onClick={() => { setMode("login"); setError(""); setSuccess("") }}
                className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${mode === "login" ? `${GRAD} text-white` : "text-s400 hover:text-content"}`}>
                {t("auth.loginTab")}
              </button>
              <button onClick={() => { setMode("register"); setError(""); setSuccess("") }}
                className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${mode === "register" ? `${GRAD} text-white` : "text-s400 hover:text-content"}`}>
                {t("auth.registerTab")}
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <div className="mb-4">
              <h2 className="text-content font-black text-lg">{t("auth.forgotHeader")}</h2>
              <p className="text-s400 text-sm mt-1">{t("auth.forgotSubtitle")}</p>
            </div>
          )}

          {error && <div className="panel-danger rounded-xl px-4 py-3 mb-4 text-sm font-bold">⚠️ {error}</div>}
          {success && <div className="panel-success rounded-xl px-4 py-3 mb-4 text-sm font-bold">✓ {success}</div>}

          <form onSubmit={submit} className="space-y-4">
            {(mode === "login" || mode === "register") && (
              <div>
                <label className={label}>{t("auth.emailLabel")}</label>
                <input type="email" value={form.email} onChange={set("email")} required placeholder={t("auth.emailPlaceholder")} className={field} />
              </div>
            )}
            {mode === "register" && (
              <div>
                <label className={label}>{t("auth.usernameLabel")}</label>
                <input type="text" value={form.username} onChange={set("username")} required placeholder={t("auth.usernamePlaceholder")} className={field} />
              </div>
            )}
            {(mode === "login" || mode === "register") && (
              <div>
                <label className={label}>{t("auth.passwordLabel")}</label>
                <input type="password" value={form.password} onChange={set("password")} required
                  placeholder={mode === "register" ? t("auth.passwordMinHint") : t("auth.passwordPlaceholder")} className={field} />
                {mode === "register" && <PasswordStrength password={form.password} />}
              </div>
            )}

            {mode === "login" && (
              <div className="text-right">
                <button type="button" onClick={() => { setMode("forgot"); setError(""); setSuccess("") }}
                  className="text-xs text-s500 hover:text-s300 transition-colors font-bold">
                  {t("auth.forgotPassword")}
                </button>
              </div>
            )}

            {mode === "register" && (
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${agreed ? "bg-brand-orange border-brand-orange" : "border-s600 group-hover:border-brand-orange"}`}>
                    {agreed && <span className="text-white text-xs font-black">✓</span>}
                  </div>
                </div>
                <span className="text-s400 text-sm leading-relaxed">
                  {t("landing.gateAccept")}{" "}
                  <a href="/agb" target="_blank" rel="noopener noreferrer" className="text-accent underline">{t("landing.gateNutzung")}</a>
                  {" "}{t("landing.gateAnd")}{" "}
                  <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="text-accent underline">{t("landing.gateDatenschutz")}</a>.
                </span>
              </label>
            )}

            {mode === "forgot" && (
              <div>
                <label className={label}>{t("auth.yourEmailLabel")}</label>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required placeholder={t("auth.emailPlaceholder")} className={field} />
              </div>
            )}

            <button type="submit" disabled={loading || (mode === "register" && !agreed)}
              className={`w-full ${GRAD} hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl transition-all mt-2`}>
              {loading ? t("auth.loading")
                : mode === "login" ? t("auth.loginButton")
                : mode === "register" ? t("auth.registerButton")
                : t("auth.sendResetLink")}
            </button>

            {mode === "forgot" && (
              <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess("") }}
                className="w-full text-center text-xs text-s500 hover:text-s300 transition-colors font-bold mt-2">
                {t("auth.backToLogin")}
              </button>
            )}
          </form>
        </>
      )}
    </div>
  )
}

// ── Section heading (label · headline · sub) ──────────────────────────────────
function SectionHead({ label, headline, sub }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-10">
      <h2 className="text-content font-black text-2xl sm:text-3xl tracking-tight mb-3">{headline}</h2>
      <p className="text-s400 text-sm sm:text-base leading-relaxed">{sub}</p>
    </div>
  )
}

// ── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { t } = useTranslation()
  const { theme, setTheme } = useAuth()
  const isDark = theme !== "light"

  const [showShare, setShowShare] = useState(false)
  const [showShake, setShowShake] = useState(false)
  const deferredPrompt = useRef(null)
  const [canInstall, setCanInstall] = useState(false)
  const [bannerClosed, setBannerClosed] = useState(() => sessionStorage.getItem("ib_installBannerClosed") === "1")

  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); deferredPrompt.current = e; setCanInstall(true) }
    const onInstalled = () => { deferredPrompt.current = null; setCanInstall(false) }
    window.addEventListener("beforeinstallprompt", onBip)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    const d = deferredPrompt.current
    if (d) {
      d.prompt()
      await d.userChoice
      deferredPrompt.current = null
      setCanInstall(false)
    } else {
      window.location.href = "/app-installieren"
    }
  }

  const handleShare = async () => {
    const data = { title: "IronBandit", text: t("share.text"), url: SITE }
    if (navigator.share) {
      try { await navigator.share(data) } catch { /* vom Nutzer abgebrochen */ }
    } else {
      setShowShare(true)
    }
  }

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" })

  const featIcons = [
    { icon: "🗂️", color: "from-sky-600 to-blue-700" },
    { icon: "🏋️", color: "from-orange-500 to-red-500" },
    { icon: "➕", color: "from-amber-500 to-orange-500" },
    { icon: "📈", color: "from-rose-500 to-red-600" },
    { icon: "📅", color: "from-emerald-500 to-teal-500" },
    { icon: "⚖️", color: "from-slate-500 to-slate-700" },
  ]
  const features = featIcons.map((f, i) => ({ ...f, title: t(`landing.feat${i + 1}Title`), text: t(`landing.feat${i + 1}Text`) }))
  const steps = [1, 2, 3, 4].map(n => ({ title: t(`landing.how${n}Title`), text: t(`landing.how${n}Text`) }))
  const benefits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ title: t(`landing.b${n}Title`), text: t(`landing.b${n}Text`) }))
  const benefitIcons = ["📓", "🏆", "📊", "🖼️", "📲", "⚖️", "📅", "👀", "🔓", "📝"]

  return (
    <div className="min-h-screen bg-s900 text-content overflow-x-hidden">

      {/* ── Header / Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur bg-s900/80 border-b border-s700">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={scrollTop} className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.png" alt="IronBandit" className="w-9 h-9 rounded-xl object-contain flex-shrink-0" />
            <span className="font-black tracking-widest text-sm sm:text-base truncate">
              <span className="text-brand-gradient">IRON</span><span className="text-s500">BANDIT</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            {canInstall && (
              <button onClick={handleInstall}
                className={`hidden sm:inline-flex items-center ${GRAD} text-white font-black text-xs px-4 py-2 rounded-full`}>
                {t("landing.installApp")}
              </button>
            )}
            <button onClick={handleShare} aria-label={t("share.short")}
              className="inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-full border border-s700 bg-s800 text-content font-black text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              <span className="hidden sm:inline">{t("share.short")}</span>
            </button>
            <button onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Theme"
              className="w-10 h-10 rounded-full border border-s700 bg-s800 flex items-center justify-center text-lg">
              {isDark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero (logo + slogan + description | auth tabs) ────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-16 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div className="text-center lg:text-left">
          <img src="/logo.png" alt="IronBandit" className="w-32 h-32 sm:w-36 sm:h-36 mx-auto lg:mx-0 rounded-3xl object-contain mb-6 drop-shadow-xl" />
          <p className="text-accent font-black text-xs uppercase tracking-widest mb-3">{t("landing.heroKicker")}</p>
          <h1 className="font-black tracking-tight leading-tight text-3xl sm:text-4xl mb-4 break-words">{t("landing.heroTitle")}</h1>
          <p className="text-s300 font-bold text-base sm:text-lg mb-3">{t("auth.subtitle")}</p>
          <p className="text-s400 text-sm sm:text-base leading-relaxed max-w-xl mx-auto lg:mx-0 mb-6">{t("landing.heroText")}</p>
          <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
            {[t("landing.badgeFree"), t("landing.badgeNoAds"), t("landing.badgeInstall")].map((b, i) => (
              <span key={i} className="bg-s800 border border-s700 text-s300 rounded-full px-3 py-1.5 text-xs font-bold">{b}</span>
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <AuthCard />
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <SectionHead label={t("landing.featuresLabel")} headline={t("landing.featuresHeadline")} sub={t("landing.featuresSub")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="bg-s800 border border-s700 rounded-2xl p-5">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-xl mb-4`}>{f.icon}</div>
              <h3 className="text-content font-black text-sm tracking-wide uppercase mb-2">{f.title}</h3>
              <p className="text-s400 text-sm leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sister app / cross-promo: MacroBandit ────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-14">
        <a href="https://macrobandit.at" target="_blank" rel="noopener noreferrer"
          className="group block bg-s800 border border-s700 rounded-2xl p-6 sm:p-7 hover:border-brand-orange transition-colors">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <img src="/macro_logo.png" alt="MacroBandit" className="w-16 h-16 rounded-2xl object-contain flex-shrink-0 drop-shadow-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-accent font-black text-xs tracking-[0.25em] uppercase mb-1">{t("landing.crossBadge")}</p>
              <h3 className="text-content font-black text-lg sm:text-xl mb-1">{t("landing.crossTitle")}</h3>
              <p className="text-s400 text-sm leading-relaxed">{t("landing.crossText")}</p>
            </div>
            <span className={`${GRAD} group-hover:opacity-90 text-white font-black text-sm px-5 py-3 rounded-full whitespace-nowrap flex-shrink-0 transition-all`}>
              {t("landing.crossCta")} →
            </span>
          </div>
        </a>
      </section>

      {/* ── How it works — numbered steps ────────────────────────────── */}
      <section className={`border-y border-s700 ${isDark ? "bg-s800/40" : "bg-s800"}`}>
        <div className="max-w-6xl mx-auto px-4 py-16">
          <SectionHead label={t("landing.howLabel")} headline={t("landing.howTitle")} sub={t("landing.howSubtitle")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={i} className="bg-s900 border border-s700 rounded-2xl p-5">
                <div className={`w-10 h-10 rounded-xl ${GRAD} text-white font-black flex items-center justify-center mb-4`}>{i + 1}</div>
                <h3 className="text-content font-black text-sm tracking-wide uppercase mb-2">{s.title}</h3>
                <p className="text-s400 text-sm leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits — icon cards ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <SectionHead label={t("landing.benefitsLabel")} headline={t("landing.benefitsTitle")} sub={t("landing.benefitsSub")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {benefits.map((b, i) => (
            <div key={i} className="bg-s800 border border-s700 rounded-2xl p-5 text-center">
              <div className="text-3xl mb-3">{benefitIcons[i]}</div>
              <h3 className="text-content font-black text-sm tracking-wide uppercase mb-2">{b.title}</h3>
              <p className="text-s400 text-sm leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-s700 px-4 py-10">
        <div className="max-w-6xl mx-auto space-y-5 text-center">
          <div className="flex items-center justify-center gap-x-5 gap-y-2 flex-wrap text-sm font-bold">
            <button onClick={scrollTop} className="text-s400 hover:text-content transition-colors">{t("public.footerHome")}</button>
            <a href="/app-installieren" className="text-s400 hover:text-content transition-colors">{t("public.footerInstall")}</a>
            <a href="https://macrobandit.at" target="_blank" rel="noopener noreferrer" className="text-s400 hover:text-content transition-colors">MacroBandit</a>
            <a href="/impressum" className="text-s400 hover:text-content transition-colors">{t("public.footerImprint")}</a>
            <a href="/datenschutz" className="text-s400 hover:text-content transition-colors">{t("public.footerPrivacy")}</a>
            <a href="/agb" className="text-s400 hover:text-content transition-colors">{t("public.footerTerms")}</a>
          </div>
          <button onClick={() => setShowShake(true)} className="text-s400 hover:text-content transition-colors text-sm font-bold">
            {t("shake.button")}
          </button>
          <p className="text-accent/80 text-xs font-black tracking-widest uppercase">{t("landing.footerSlogan")}</p>
        </div>
      </footer>

      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
      {showShake && <ShakeModal onClose={() => setShowShake(false)} />}

      {/* ── Auto install banner (fires once Chrome reports installability) ── */}
      {canInstall && !bannerClosed && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 flex justify-center pointer-events-none safe-bottom">
          <div className="pointer-events-auto bg-s800 border border-s700 shadow-2xl rounded-2xl w-full max-w-md p-4 flex items-center gap-3">
            <img src="/icon-192.png" alt="IronBandit" className="w-11 h-11 rounded-xl flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-content font-black text-sm leading-tight">{t("landing.installBannerTitle")}</p>
              <p className="text-s400 text-xs leading-snug mt-0.5">{t("landing.installBannerText")}</p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={handleInstall} className={`${GRAD} text-white font-black text-xs px-4 py-2 rounded-full whitespace-nowrap`}>
                {t("landing.installBannerCta")}
              </button>
              <button onClick={() => { setBannerClosed(true); sessionStorage.setItem("ib_installBannerClosed", "1") }}
                className="text-s400 hover:text-content text-xs font-bold transition-colors">
                {t("landing.installBannerLater")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
