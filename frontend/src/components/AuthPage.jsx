import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"
import PasswordStrength from "./PasswordStrength"
import { PublicFooter } from "./PublicPages"
import ShareButton from "./ShareButton"
import Icon from "./Icon"

const API = import.meta.env.VITE_API_URL || "/api"

export default function AuthPage({ resetToken, initialMode = "login", onBack }) {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [mode, setMode] = useState(resetToken ? "reset" : initialMode)
  const [form, setForm] = useState({ email: "", username: "", password: "" })
  const [forgotEmail, setForgotEmail] = useState("")
  const [resetPw, setResetPw] = useState("")
  const [resetPwConfirm, setResetPwConfirm] = useState("")
  const [registeredEmail, setRegisteredEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    setLoading(true)
    try {
      if (mode === "login") {
        try {
          await login(form.email, form.password)
        } catch (err) {
          const msg = Array.isArray(err.message) ? err.message.join(", ") : err.message
          throw new Error(msg)
        }

      } else if (mode === "register") {
        const res = await fetch(`${API}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, username: form.username, password: form.password })
        })
        if (!res.ok) {
          const err = await res.json()
          const msg = Array.isArray(err.detail)
            ? err.detail.map(e => e.msg).join(", ")
            : err.detail || t('auth.registerFailed')
          throw new Error(msg)
        }
        setRegisteredEmail(form.email)
        setMode("registered")

      } else if (mode === "forgot") {
        const res = await fetch(`${API}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: forgotEmail })
        })
        const data = await res.json()
        setSuccess(data.message || t('auth.emailSent'))

      } else if (mode === "reset") {
        if (resetPw !== resetPwConfirm) { setError(t('auth.passwordMismatch')); setLoading(false); return }
        const res = await fetch(`${API}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, new_password: resetPw })
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.detail || t('app.error'))
        }
        setSuccess(t('auth.passwordChanged'))
        setTimeout(() => {
          window.history.replaceState({}, "", "/")
          setMode("login")
        }, 2000)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: "🗂️", title: t('landing.feat1Title'), text: t('landing.feat1Text') },
    { icon: "🏋️", title: t('landing.feat2Title'), text: t('landing.feat2Text') },
    { icon: "➕", title: t('landing.feat5Title'), text: t('landing.feat5Text') },
    { icon: "📈", title: t('landing.feat3Title'), text: t('landing.feat3Text') },
    { icon: "📅", title: t('landing.feat4Title'), text: t('landing.feat4Text') },
  ]

  const steps = [
    { icon: "🗂️", title: t('landing.how1Title'), text: t('landing.how1Text') },
    { icon: "➕", title: t('landing.how2Title'), text: t('landing.how2Text') },
    { icon: "🏋️", title: t('landing.how3Title'), text: t('landing.how3Text') },
    { icon: "📈", title: t('landing.how4Title'), text: t('landing.how4Text') },
  ]

  const benefits = [
    { icon: "📓", title: t('landing.b1Title'), text: t('landing.b1Text') },
    { icon: "🏆", title: t('landing.b2Title'), text: t('landing.b2Text') },
    { icon: "📊", title: t('landing.b3Title'), text: t('landing.b3Text') },
    { icon: "🖼️", title: t('landing.b4Title'), text: t('landing.b4Text') },
    { icon: "📲", title: t('landing.b5Title'), text: t('landing.b5Text') },
    { icon: "⚖️", title: t('landing.b6Title'), text: t('landing.b6Text') },
  ]

  return (
    <div className="min-h-screen bg-s900 text-content px-4 py-8 safe-top safe-bottom">
      <div className="max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">

          {/* ── Produktbeschreibung / Hero ── */}
          <section className="order-2 lg:order-1 min-w-0">
            <div className="flex items-center gap-3 mb-5">
              <img src="/logo.png" alt="IronBandit" className="w-12 h-12 object-contain rounded-xl" />
              <span className="text-xl font-black tracking-wide">
                <span className="text-brand-gradient">Iron</span><span className="text-s500">Bandit</span>
              </span>
            </div>
            <p className="text-accent font-semibold text-xs mb-2">{t('landing.heroKicker')}</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-3">{t('landing.heroTitle')}</h1>
            <p className="text-s400 font-medium mb-6 max-w-md">{t('landing.heroText')}</p>

            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {features.map(f => (
                <div key={f.title} className="bg-s800 border border-s700 rounded-2xl p-4">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <h3 className="font-black text-content text-sm mb-1">{f.title}</h3>
                  <p className="text-s400 text-xs leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>

            <a href="/app-installieren"
              className="inline-flex items-center gap-2 bg-s800 hover:bg-s700 border border-s700 text-content font-black text-sm px-4 py-2.5 rounded-xl transition-colors">
              📲 {t('landing.installCta')}
            </a>

            {/* ── Cross-Promotion: andere App MacroBandit ── */}
            <a href="https://macrobandit.at" target="_blank" rel="noopener noreferrer"
              className="mt-6 flex items-center gap-3 bg-s800 border border-brand-orange/40 rounded-2xl p-3.5 hover:border-brand-orange transition-colors group w-full max-w-md">
              <img src="/macro_logo.png" alt="MacroBandit" className="w-11 h-11 rounded-xl object-contain flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-content font-black text-sm truncate">{t('landing.crossTitle')}</p>
                  <span className="text-[11px] font-semibold text-accent bg-brand-orange/15 px-1.5 py-0.5 rounded flex-shrink-0">{t('landing.crossBadge')}</span>
                </div>
                <p className="text-s400 text-xs mt-0.5">{t('landing.crossText')}</p>
              </div>
              <span className="text-accent text-base font-black flex-shrink-0 group-hover:translate-x-0.5 transition-transform">↗</span>
            </a>
          </section>

          {/* ── Login / Registrierung ── */}
          <section className="order-1 lg:order-2 flex flex-col items-center min-w-0">
            <div className="mb-6 text-center lg:hidden">
              <img src="/logo.png" alt={t('auth.appName')} className="w-20 h-20 object-contain mx-auto mb-2" />
              <h2 className="text-2xl font-black tracking-tight text-brand-gradient">{t('auth.appName')}</h2>
              <p className="text-s400 font-bold text-sm">{t('auth.subtitle')}</p>
            </div>

      <div className="bg-s800 rounded-2xl shadow-xl w-full max-w-sm p-6 border border-s700">

        {mode === "registered" && (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-brand-gradient text-white flex items-center justify-center"><Icon name="mail" size={26} /></div>
            <h3 className="text-content font-extrabold text-xl tracking-tight">{t('auth.registeredTitle')}</h3>
            <p className="text-s400 text-sm leading-relaxed">
              {t('auth.registeredText1')}<br />
              <strong className="text-success">{registeredEmail}</strong><br />
              {t('auth.registeredText2')}
            </p>
            <div className="bg-s900 rounded-2xl p-4 text-left space-y-2">
              <p className="text-s300 text-sm font-bold">{t('auth.registeredStepsTitle')}</p>
              <p className="text-s400 text-xs">{t('auth.registeredStep1')}</p>
              <p className="text-s400 text-xs">{t('auth.registeredStep2')}</p>
              <p className="text-s400 text-xs">{t('auth.registeredStep3')}</p>
            </div>
            <button
              onClick={() => { setMode("login"); setForm({ email: registeredEmail, username: "", password: "" }) }}
              className="w-full bg-brand-gradient text-white font-black py-3 rounded-xl"
            >
              {t('auth.toLogin')}
            </button>
            <p className="text-s600 text-xs">{t('auth.noEmail')}</p>
          </div>
        )}

        {(mode === "login" || mode === "register") && (
          <div className="flex bg-s900 border border-s700 p-1 rounded-xl mb-6">
            <button onClick={() => { setMode("login"); setError(""); setSuccess("") }}
              className={`flex-1 py-2.5 rounded-lg text-sm transition-colors ${mode === "login" ? "bg-s800 text-content font-semibold shadow-md" : "text-s400 font-medium hover:text-content"}`}>
              {t('auth.loginTab')}
            </button>
            <button onClick={() => { setMode("register"); setError(""); setSuccess("") }}
              className={`flex-1 py-2.5 rounded-lg text-sm transition-colors ${mode === "register" ? "bg-s800 text-content font-semibold shadow-md" : "text-s400 font-medium hover:text-content"}`}>
              {t('auth.registerTab')}
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="mb-4">
            <h2 className="text-content font-black text-lg">{t('auth.forgotHeader')}</h2>
            <p className="text-s400 text-sm mt-1">{t('auth.forgotSubtitle')}</p>
          </div>
        )}
        {mode === "reset" && (
          <div className="mb-4">
            <h2 className="text-content font-black text-lg">{t('auth.resetHeader')}</h2>
          </div>
        )}

        {error && (
          <div className="panel-danger rounded-xl px-4 py-3 mb-4 text-sm font-semibold">
            {error}
          </div>
        )}
        {success && (
          <div className="panel-success rounded-xl px-4 py-3 mb-4 text-sm font-semibold">
            {success}
          </div>
        )}

        {mode !== "registered" && (
          <form onSubmit={submit} className="space-y-4">

            {mode === "login" && (
              <>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.emailLabel')}</label>
                  <input type="email" value={form.email} onChange={set("email")} required placeholder={t('auth.emailPlaceholder')}
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                </div>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.passwordLabel')}</label>
                  <input type="password" value={form.password} onChange={set("password")} required placeholder={t('auth.passwordPlaceholder')}
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => { setMode("forgot"); setError(""); setSuccess("") }}
                    className="text-xs text-s500 hover:text-s300 transition-colors font-bold">
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              </>
            )}

            {mode === "register" && (
              <>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.emailLabel')}</label>
                  <input type="email" value={form.email} onChange={set("email")} required placeholder={t('auth.emailPlaceholder')}
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                </div>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.usernameLabel')}</label>
                  <input type="text" value={form.username} onChange={set("username")} required placeholder={t('auth.usernamePlaceholder')}
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                </div>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.passwordLabel')}</label>
                  <input type="password" value={form.password} onChange={set("password")} required placeholder={t('auth.passwordMinHint')}
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                  <PasswordStrength password={form.password} />
                </div>
              </>
            )}

            {mode === "forgot" && (
              <div>
                <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.yourEmailLabel')}</label>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                  placeholder={t('auth.emailPlaceholder')}
                  className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
              </div>
            )}

            {mode === "reset" && (
              <>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.newPasswordLabel')}</label>
                  <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} required
                    placeholder={t('auth.passwordMinHint')} autoFocus
                    className="w-full bg-s900 border border-s700 text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500" />
                  <PasswordStrength password={resetPw} />
                </div>
                <div>
                  <label className="block text-s400 text-xs font-semibold mb-1.5">{t('auth.repeatLabel')}</label>
                  <input type="password" value={resetPwConfirm} onChange={e => setResetPwConfirm(e.target.value)} required
                    placeholder={t('auth.passwordPlaceholder')}
                    className={`w-full bg-s900 border text-content rounded-xl px-3.5 h-12 font-semibold outline-none focus:border-brand-orange transition-colors placeholder-s500 ${
                      resetPwConfirm && resetPw !== resetPwConfirm ? "border-rose-500" : "border-s700"
                    }`} />
                  {resetPwConfirm && resetPw !== resetPwConfirm && (
                    <p className="text-danger text-xs mt-1 font-bold">{t('auth.passwordMismatch')}</p>
                  )}
                </div>
              </>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-brand-gradient hover:opacity-90 disabled:opacity-50 text-white font-bold h-12 rounded-xl transition-all mt-2">
              {loading ? t('auth.loading')
                : mode === "login" ? t('auth.loginButton')
                : mode === "register" ? t('auth.registerButton')
                : mode === "forgot" ? t('auth.sendResetLink')
                : t('auth.setPassword')}
            </button>

            {(mode === "forgot" || mode === "reset") && (
              <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess("") }}
                className="w-full text-center text-xs text-s500 hover:text-s300 transition-colors font-bold mt-2">
                {t('auth.backToLogin')}
              </button>
            )}

          </form>
        )}

      </div>

            {onBack && (
              <button onClick={onBack} className="text-s600 hover:text-s400 text-xs mt-4 transition-colors">
                {t('auth.backToHome')}
              </button>
            )}
          </section>

        </div>

        {/* ── Anleitung: So funktioniert IronBandit ── */}
        <section className="mt-14">
          <h2 className="text-2xl sm:text-3xl font-black text-center tracking-tight mb-1">{t('landing.howTitle')}</h2>
          <p className="text-s400 text-center text-sm mb-8 max-w-md mx-auto">{t('landing.howSubtitle')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={i} className="bg-s800 border border-s700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-full bg-brand-gradient text-white font-black flex items-center justify-center text-sm flex-shrink-0">{i + 1}</span>
                  <span className="text-2xl">{s.icon}</span>
                </div>
                <h3 className="font-black text-content text-sm mb-1">{s.title}</h3>
                <p className="text-s400 text-xs leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Benefits / Vorteile ── */}
        <section className="mt-14">
          <h2 className="text-2xl sm:text-3xl font-black text-center tracking-tight mb-8">{t('landing.benefitsTitle')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benefits.map((b, i) => (
              <div key={i} className="bg-s800 border border-s700 rounded-2xl p-5 flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{b.icon}</span>
                <div className="min-w-0">
                  <h3 className="font-black text-content text-sm mb-0.5">{b.title}</h3>
                  <p className="text-s400 text-xs leading-relaxed">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Weiterempfehlen ── */}
        <section className="mt-14">
          <div className="bg-s800 border border-s700 rounded-2xl p-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">{t('share.landingTitle')}</h2>
            <p className="text-s400 text-sm mb-6 max-w-md mx-auto">{t('share.landingText')}</p>
            <div className="flex justify-center">
              <ShareButton />
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </div>
  )
}
