// Gemeinsame Übungssuche für alle Auswahl-Dialoge (Dashboard-Picker, Plan-Editor).
//
// Warum eigener Rang statt einfachem Substring-Filter: die Übungsliste kommt
// alphabetisch vom Backend und enthält ~880 wger-Importe. Ein reines
// `includes()` + `slice()` liefert bei "Kniebeuge" nur die alphabetisch ersten
// Treffer ("Bulgarische …", "Einbeinige …") — der exakte Treffer und
// selbst angelegte Übungen fielen hinten runter und waren unauffindbar.

export const EXERCISE_RESULT_LIMIT = 25

const WORD_BOUNDARY = /[\s\-/(+.,&]/

// Kleiner ist besser: 0 = exakt, 1 = beginnt mit, 2 = Wortanfang, 3 = irgendwo.
// null = kein Treffer.
function matchRank(name, query) {
  const n = (name || '').toLowerCase()
  if (n === query) return 0
  if (n.startsWith(query)) return 1
  const idx = n.indexOf(query)
  if (idx < 0) return null
  return WORD_BOUNDARY.test(n[idx - 1]) ? 2 : 3
}

/**
 * Filtert und sortiert Übungen nach Relevanz.
 *
 * @param exercises  Liste aus GET /workouts/exercises
 * @param search     Suchbegriff (leer = ganze Liste, alphabetisch)
 * @param options.excludeIds  bereits gewählte IDs, die nicht mehr auftauchen sollen
 * @param options.userId      eigene User-ID: selbst angelegte Übungen gewinnen Gleichstände
 * @param options.limit       max. Anzahl Ergebnisse (Default EXERCISE_RESULT_LIMIT)
 * @returns { results, total } — total = Treffer vor dem Kürzen, für den "… und N weitere"-Hinweis
 */
export function searchExercises(exercises, search, options = {}) {
  const { excludeIds, userId, limit = EXERCISE_RESULT_LIMIT } = options
  const query = (search || '').trim().toLowerCase()
  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])

  const scored = []
  for (const ex of exercises) {
    if (excluded.has(ex.id)) continue
    const rank = query ? matchRank(ex.name, query) : 4
    if (rank === null) continue
    scored.push({ ex, rank })
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    // Bei gleichem Rang: eigene Übungen vor Importen, dann alphabetisch.
    if (userId != null) {
      const aOwn = a.ex.created_by_user_id === userId
      const bOwn = b.ex.created_by_user_id === userId
      if (aOwn !== bOwn) return aOwn ? -1 : 1
    }
    return a.ex.name.localeCompare(b.ex.name, 'de')
  })

  return { results: scored.slice(0, limit).map(s => s.ex), total: scored.length }
}
