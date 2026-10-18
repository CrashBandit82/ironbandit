import { useTranslation } from "react-i18next"
import { useAuth } from "../context/AuthContext"

// ── Public (logged-out) pages: legal notice, privacy, terms, install guide ─────
// These render for any pathname, no auth required (nginx serves index.html for all
// routes, the router in App.jsx picks the page from window.location.pathname).
//
// Operator/legal details were provided by the operator (Gerald Perchtaler) and
// adapted from the MacroBandit texts to IronBandit's data (training, sets, weight,
// workouts instead of nutrition). SMTP provider: World4You. The <Review>/<ReviewBanner>
// helpers below are kept for future use but are currently unused (nothing left to verify).

function Review({ children }) {
  return (
    <mark className="bg-brand-orange/20 text-accent font-bold rounded px-1.5 py-0.5 border border-brand-orange/40">
      ⚠ PRÜFEN: {children}
    </mark>
  )
}

function ReviewBanner({ children }) {
  return (
    <div className="panel-warn rounded-2xl px-4 py-3 text-sm font-bold mb-6">
      ⚠️ {children}
    </div>
  )
}

function ThemeSwitch() {
  const { t } = useTranslation()
  const { theme, setTheme } = useAuth()
  return (
    <div className="flex bg-s800 rounded-xl p-1 border border-s700">
      <button onClick={() => setTheme("light")}
        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${theme === "light" ? "bg-brand-gradient text-white" : "text-s400 hover:text-content"}`}>
        ☀️ {t('dashboard.themeLight')}
      </button>
      <button onClick={() => setTheme("dark")}
        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${theme === "dark" ? "bg-brand-gradient text-white" : "text-s400 hover:text-content"}`}>
        🌙 {t('dashboard.themeDark')}
      </button>
    </div>
  )
}

export function PublicFooter() {
  const { t } = useTranslation()
  const links = [
    { href: "/", label: t('public.footerHome') },
    { href: "/app-installieren", label: t('public.footerInstall') },
    { href: "/impressum", label: t('public.footerImprint') },
    { href: "/datenschutz", label: t('public.footerPrivacy') },
    { href: "/agb", label: t('public.footerTerms') },
  ]
  return (
    <footer className="w-full max-w-3xl mx-auto mt-12 pt-6 border-t border-s700">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-xs font-bold text-s400 hover:text-accent transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <ThemeSwitch />
      </div>
      <p className="text-center text-s600 text-xs mt-4 font-bold">© {new Date().getFullYear()} IronBandit · ironbandit.at</p>
    </footer>
  )
}

function LegalLayout({ title, subtitle, children }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-s900 text-content safe-top safe-bottom px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="IronBandit" className="w-9 h-9 object-contain rounded-lg" />
          <span className="text-sm font-black tracking-wide">
            <span className="text-brand-gradient">Iron</span><span className="text-s500">Bandit</span>
          </span>
        </a>

        <a href="/" className="text-xs font-bold text-accent hover:opacity-80 mb-4 inline-block">← {t('public.back')}</a>

        <h1 className="text-3xl font-black tracking-tight mb-1">{title}</h1>
        {subtitle && <p className="text-s400 font-bold mb-6">{subtitle}</p>}

        <div className="space-y-6 text-s300 leading-relaxed text-[15px]">
          {children}
        </div>

        <PublicFooter />
      </div>
    </div>
  )
}

// Small helpers for consistent typographic rhythm
function H2({ children }) {
  return <h2 className="text-xl font-black text-content mt-8 mb-2">{children}</h2>
}
function P({ children }) {
  return <p className="text-s300">{children}</p>
}
function UL({ children }) {
  return <ul className="list-disc pl-5 space-y-1 text-s300 marker:text-brand-orange">{children}</ul>
}

// ── Impressum (Österreich: ECG §5, Mediengesetz §25) ───────────────────────────
// Betreiberdaten stammen unverändert vom Betreiber (Gerald Perchtaler). Nur der
// Produktname/Zweck wurde von MacroBandit (Ernährung) auf IronBandit (Training)
// umgestellt. Die Kontakt-E-Mail bleibt die reale Adresse des Betreibers.
export function Impressum() {
  return (
    <LegalLayout title="Impressum" subtitle="Informationspflicht laut §5 ECG, §25 Mediengesetz">
      <H2>Diensteanbieter &amp; Medieninhaber</H2>
      <P>Gerald Perchtaler</P>
      <P>Sankt Thomaser Straße 24<br />9400 Wolfsberg<br />Österreich</P>
      <P>Kontakt: <a href="mailto:trainer@macrobandit.at" className="text-accent font-bold hover:opacity-80">trainer@macrobandit.at</a></P>

      <H2>Blattlinie / Zweck des Mediums</H2>
      <P>
        IronBandit ist ein rein privates, nicht-kommerzielles und kostenloses Online-Werkzeug zur
        persönlichen Dokumentation von Trainingsplänen, Übungen, Sätzen, Gewichten, Wiederholungen und
        Körpergewicht für Sport- und Fitnessbegeisterte. Es werden keinerlei kommerzielle Interessen verfolgt.
      </P>
    </LegalLayout>
  )
}

// ── Datenschutzerklärung (DSGVO) ───────────────────────────────────────────────
// Übernimmt Struktur/Text der MacroBandit-Datenschutzerklärung, inhaltlich an
// IronBandit angepasst: Trainings-/Gewichts-/Workout-Daten statt Lebensmittel/Makros;
// die MacroBandit-spezifischen Punkte „Kamerazugriff (Barcode-Scanner)" und
// „Open Food Facts" entfallen, da IronBandit diese Funktionen nicht hat.
export function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung" subtitle="Information gemäß DSGVO und TKG">
      <P>
        Der Schutz deiner persönlichen Daten ist mir ein besonderes Anliegen. Ich verarbeite deine Daten
        ausschließlich auf Grundlage der gesetzlichen Bestimmungen (DSGVO, TKG). Verantwortlicher ist der
        im <a href="/impressum" className="text-accent font-bold">Impressum</a> genannte Betreiber (Gerald Perchtaler).
      </P>

      <H2>1. Welche Daten werden verarbeitet?</H2>
      <P>
        Für die Nutzung der Kernfunktionen werden folgende Daten in der Datenbank gespeichert: Benutzername
        (Pseudonym), E-Mail-Adresse, Passwort (verschlüsselt gespeichert), deine eingetragenen Trainingsdaten
        (Übungen, Trainingspläne, Workouts sowie die einzelnen Sätze mit Gewicht und Wiederholungen bzw.
        Cardio-Dauer/-Distanz samt Datum und Notizen) sowie optionale Körperdaten (z.&nbsp;B. Körpergewicht,
        Wochenziel).
      </P>

      <H2>2. Zweck der Datenverarbeitung</H2>
      <P>Die Datenverarbeitung erfolgt ausschließlich, um dir die Tracker-Funktionen (Trainingstagebuch, Verlauf, Fortschritt/PRs) zur Verfügung zu stellen. Es findet kein Profiling statt.</P>

      <H2>3. Keine Werbung, kein Datenverkauf</H2>
      <P>Dieses Projekt ist zu 100&nbsp;% kostenlos und werbefrei. Deine Daten werden niemals an Dritte verkauft, vermietet oder zu Werbezwecken weitergegeben.</P>

      <H2>4. Lokale Datenspeicherung (localStorage)</H2>
      <P>Für die Anmeldung werden Authentifizierungstoken (JWT) im localStorage deines Browsers gespeichert. Diese dienen ausschließlich dazu, dich angemeldet zu halten, und werden bei der Abmeldung automatisch gelöscht. Zusätzlich wird deine Design-Einstellung (Hell/Dunkel) lokal gespeichert. Es werden keine Tracking- oder Werbecookies verwendet.</P>

      <H2>5. Externe Dienste</H2>
      <P>
        Zum Versand von System-E-Mails (Registrierungs­bestätigung, Passwort-Zurücksetzen, optionale
        Erinnerungen) wird der E-Mail-/SMTP-Dienst von <strong className="text-content">World4You</strong>
        {" "}(World4You Internet Services GmbH, Österreich) eingesetzt; dabei wird deine E-Mail-Adresse
        übertragen. Ein Teil der Übungsdatenbank kann aus der öffentlichen Datenbank von wger.de
        (CC&nbsp;BY-SA) stammen — dabei werden <strong className="text-content">keine</strong> personenbezogenen
        Daten an wger.de übertragen.
      </P>

      <H2>6. Deine Rechte</H2>
      <P>Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung und Einschränkung zu. Deine Daten kannst du in der App jederzeit selbst als CSV exportieren. Wenn du dein Konto löschst, werden alle deine personenbezogenen Daten unwiderruflich entfernt. Beschwerden kannst du an die Österreichische Datenschutzbehörde (<a href="https://www.dsb.gv.at" className="text-accent font-bold" target="_blank" rel="noreferrer">dsb.gv.at</a>) richten.</P>
    </LegalLayout>
  )
}

// ── Nutzungsbedingungen ────────────────────────────────────────────────────────
// Übernimmt Struktur/Text der MacroBandit-Nutzungsbedingungen, inhaltlich auf
// IronBandit umgestellt (Trainingsdaten statt Nährwertdaten).
export function AGB() {
  return (
    <LegalLayout title="Nutzungsbedingungen" subtitle="Bedingungen für die Nutzung von IronBandit">
      <H2>1. Kostenlose Nutzung „wie gesehen"</H2>
      <P>
        IronBandit ist ein rein privates Hobby-Projekt. Die Bereitstellung erfolgt ohne jegliche
        Gewährleistung für Verfügbarkeit, Richtigkeit der Trainings- und Übungsdaten oder dauerhafte
        Datenspeicherung.
      </P>

      <H2>2. Haftungsausschluss</H2>
      <UL>
        <li><strong className="text-content">Keine medizinische Beratung:</strong> Die erfassten und berechneten Werte (z.&nbsp;B. Volumen, Fortschritt, persönliche Bestleistungen) ersetzen keine medizinische oder trainingswissenschaftliche Beratung. Trainings erfolgen auf eigene Gefahr.</li>
        <li><strong className="text-content">Haftung für Datenverlust:</strong> Es wird keine Haftung für eventuelle Datenverluste oder Serverausfälle übernommen.</li>
      </UL>

      <H2>3. Missbrauchsverbot</H2>
      <P>
        Die Nutzung von automatisierten Skripten (Bots) oder Versuche, die Infrastruktur zu manipulieren,
        sind untersagt und führen zum sofortigen Ausschluss.
      </P>
    </LegalLayout>
  )
}

// ── PWA-Installationsanleitung ─────────────────────────────────────────────────
export function InstallGuide() {
  const { t } = useTranslation()
  const Step = ({ n, children }) => (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-gradient text-white font-black flex items-center justify-center text-sm">{n}</span>
      <span className="text-s300 pt-0.5">{children}</span>
    </li>
  )
  return (
    <LegalLayout title={t('public.installTitle')} subtitle={t('public.installSubtitle')}>
      <P>{t('public.installIntro')}</P>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="bg-s800 border border-s700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl"></span>
            <h2 className="text-lg font-black text-content">iPhone &amp; iPad (Safari)</h2>
          </div>
          <ol className="space-y-3">
            <Step n="1">Öffne <strong className="text-content">ironbandit.at</strong> in <strong className="text-content">Safari</strong> (nicht Chrome — auf iOS kann nur Safari installieren).</Step>
            <Step n="2">Tippe unten in der Leiste auf das <strong className="text-content">Teilen-Symbol</strong> (Quadrat mit Pfeil nach oben).</Step>
            <Step n="3">Wähle <strong className="text-content">„Zum Home-Bildschirm"</strong>.</Step>
            <Step n="4">Tippe rechts oben auf <strong className="text-content">„Hinzufügen"</strong>. Fertig — IronBandit erscheint als App-Icon.</Step>
          </ol>
        </div>

        <div className="bg-s800 border border-s700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg font-black text-content">Android (Chrome)</h2>
          </div>
          <ol className="space-y-3">
            <Step n="1">Öffne <strong className="text-content">ironbandit.at</strong> in <strong className="text-content">Chrome</strong>.</Step>
            <Step n="2">Tippe rechts oben auf das <strong className="text-content">Menü (⋮)</strong>.</Step>
            <Step n="3">Wähle <strong className="text-content">„App installieren"</strong> bzw. <strong className="text-content">„Zum Startbildschirm hinzufügen"</strong>.</Step>
            <Step n="4">Bestätige mit <strong className="text-content">„Installieren"</strong>. IronBandit liegt danach im App-Drawer.</Step>
          </ol>
        </div>
      </div>

      <div className="panel-info rounded-2xl px-4 py-3 text-sm font-bold mt-6">
        ℹ️ {t('public.installHint')}
      </div>
    </LegalLayout>
  )
}
