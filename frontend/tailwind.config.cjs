/** @type {import('tailwindcss').Config} */
module.exports = {
  // Theme is driven by a `data-theme` attribute on <html>. `dark:` variants still
  // work off the same attribute for the rare case we need an explicit override.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand accents (from logo.png) — identical in BOTH themes ──────────
        brand: {
          orange:        '#f4590a',
          'orange-light':'#f47521',
          red:           '#b8231f',
          'red-dark':    '#6b1f1e',
        },

        // ── Surface / text ramp — var-backed, flips per data-theme ────────────
        // Named to mirror the slate scale the app was built on, so dark mode
        // stays visually consistent while light mode gets its own values.
        s950: 'var(--s950)',
        s900: 'var(--s900)',
        s800: 'var(--s800)',
        s700: 'var(--s700)',
        s600: 'var(--s600)',
        s500: 'var(--s500)',
        s400: 'var(--s400)',
        s300: 'var(--s300)',
        s200: 'var(--s200)',
        s100: 'var(--s100)',

        // ── Semantic text ─────────────────────────────────────────────────────
        content: 'var(--content)',            // primary text (near-white / near-black)
        'content-muted': 'var(--content-muted)',
        accent: 'var(--accent)',              // brand-tinted link/highlight text, theme-aware

        // ── Categorical stat/chart hues — theme-aware for legibility ──────────
        chart1: 'var(--chart1)',
        chart2: 'var(--chart2)',
        chart3: 'var(--chart3)',
        chart4: 'var(--chart4)',

        // ── Semantic state colours — theme-aware (text/icon shade) ────────────
        success: 'var(--success)',
        danger:  'var(--danger)',
        warn:    'var(--warn)',
        info:    'var(--info)',
      },
      spacing: {
        'safe': 'max(1rem, env(safe-area-inset-bottom))',
      },

      // Redesign 2026-10 (wie MacroBandit 2.0): moderner, weniger rundlich
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontWeight: {
        black: '800',      // bisher 900: wirkt mit Manrope zu wuchtig
      },
      borderRadius: {
        xl: '10px',        // bisher 12px
        '2xl': '12px',     // bisher 16px
        '3xl': '14px',     // bisher 24px
      },
      boxShadow: {
        md: '0 2px 6px rgba(0, 0, 0, 0.16)',
        lg: '0 4px 12px rgba(0, 0, 0, 0.18)',
        xl: '0 6px 18px rgba(0, 0, 0, 0.22)',
        '2xl': '0 10px 30px rgba(0, 0, 0, 0.28)',
      },
    },
  },
  plugins: [],
}
