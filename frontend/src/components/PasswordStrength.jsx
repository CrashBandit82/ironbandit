import { useTranslation } from 'react-i18next'

export function getPasswordStrength(pw) {
  if (!pw) return null
  const has8       = pw.length >= 8
  const hasUpper   = /[A-Z]/.test(pw)
  const hasLower   = /[a-z]/.test(pw)
  const hasNumber  = /[0-9]/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)

  if (!has8) return { level: 0, labelKey: 'password.tooShort', color: 'bg-rose-500', text: 'text-danger', width: '10%' }

  const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length

  if (score <= 2) return { level: 1, labelKey: 'password.weak',   hintKey: 'password.hintAddChars',    color: 'bg-rose-500',   text: 'text-danger',   width: '25%' }
  if (score === 3) return { level: 2, labelKey: 'password.good',  hintKey: 'password.hintAddSpecial',  color: 'bg-amber-500',  text: 'text-warn',  width: '65%' }
  return              { level: 3, labelKey: 'password.strong',                                          color: 'bg-success', text: 'text-success', width: '100%' }
}

export default function PasswordStrength({ password }) {
  const { t } = useTranslation()
  const strength = getPasswordStrength(password)
  if (!password) return null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
            strength.level >= i ? strength.color : 'bg-s700'
          }`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-black ${strength.text}`}>{t(strength.labelKey)}</span>
        {strength.hintKey && <span className="text-xs text-s500">{t(strength.hintKey)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {[
          { ok: password.length >= 8,           labelKey: 'password.req8Chars' },
          { ok: /[A-Z]/.test(password),          labelKey: 'password.reqUppercase' },
          { ok: /[a-z]/.test(password),          labelKey: 'password.reqLowercase' },
          { ok: /[0-9]/.test(password),          labelKey: 'password.reqNumber' },
          { ok: /[^A-Za-z0-9]/.test(password),   labelKey: 'password.reqSpecial' },
        ].map(({ ok, labelKey }) => (
          <span key={labelKey} className={`text-xs ${ok ? 'text-success' : 'text-s600'}`}>
            {ok ? '✓' : '○'} {t(labelKey)}
          </span>
        ))}
      </div>
    </div>
  )
}
