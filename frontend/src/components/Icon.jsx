// Redesign 2026-10: schlichte Strich-Symbole statt Emojis (wie MacroBandit 2.0).
// Alle Symbole auf 24er-Raster, Farbe kommt über currentColor vom Elternelement.
const PATHS = {
  close:    "M6 6l12 12M18 6L6 18",
  check:    "M5 12l5 5 9-10",
  plus:     "M12 5v14M5 12h14",
  minus:    "M5 12h14",
  edit:     "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  trash:    "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  back:     "M15 6l-6 6 6 6",
  next:     "M9 6l6 6-6 6",
  up:       "M6 15l6-6 6 6",
  down:     "M6 9l6 6 6-6",
  arrowUp:  "M12 19V5M6 11l6-6 6 6",
  arrowDown:"M12 5v14M6 13l6 6 6-6",
  timer:    "M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 2M9 2h6",
  user:     "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  key:      "M8 20a4 4 0 100-8 4 4 0 000 8zM11 13l9-9M17 7l3 3",
  bell:     "M6 16v-5a6 6 0 0112 0v5l2 2H4l2-2zM10 21h4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload:   "M12 20V9M7 14l5-5 5 5M5 4h14",
  share:    "M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6",
  logout:   "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11",
  sun:      "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon:     "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  shield:   "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  camera:   "M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  mail:     "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 7l9 6 9-6",
  lock:     "M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 018 0v4",
  unlock:   "M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 017.5-2",
  search:   "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  note:     "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5",
  trend:    "M3 17l6-6 4 4 8-8M15 7h6v6",
  watch:    "M8 3h8l1 4H7zM7 17h10l-1 4H8zM12 17a5 5 0 100-10 5 5 0 000 10zM12 10v2l1.5 1",
  alert:    "M12 4l9 16H3zM12 10v4M12 17.5v.5",
  rocket:   "M12 15l-3-3c1.5-4.5 4.5-8 10-9-1 5.5-4.5 8.5-9 10zM9 12l-4 1-2 3 4 1M12 15l-1 4 3 2 1-4",
  link:     "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  help:     "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17v.5",
  undo:     "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
}

export default function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`flex-shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  )
}
