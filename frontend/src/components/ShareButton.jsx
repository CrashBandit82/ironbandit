import { useState } from "react"
import { useTranslation } from "react-i18next"
import Icon from "./Icon"

// One-tap "recommend this app" button. Uses the native Web Share API where
// available (mobile → WhatsApp, Signal, Mail, … system sheet), and falls back
// to copying the link to the clipboard on desktop browsers without navigator.share.
export default function ShareButton({ className = "", compact = false }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const shareData = {
    title: "IronBandit",
    text: t("share.text"),
    url: "https://ironbandit.at/",
  }

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // user cancelled the share sheet — do nothing
      return
    }
    // Fallback: copy the link
    try {
      await navigator.clipboard.writeText(shareData.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t("share.copyPrompt"), shareData.url)
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className={
        className ||
        "inline-flex items-center gap-2 bg-brand-gradient text-white font-bold rounded-xl px-5 h-12 hover:opacity-90 transition-opacity"
      }
    >
      {compact
        ? <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-s800"><Icon name="share" /></span>
        : <Icon name="share" />}
      <span>{copied ? t("share.copied") : compact ? t("share.short") : t("share.button")}</span>
    </button>
  )
}
