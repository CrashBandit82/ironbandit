/* eslint-disable no-undef */
// App-Version nach Semantic Versioning (MAJOR.MINOR.PATCH).
//
// EINZIGE Pflegestelle ist das Feld "version" in frontend/package.json —
// von dort injiziert Vite den Wert als __APP_VERSION__ (siehe vite.config.js).
// Hier nichts hart eintragen, sonst driften die beiden Stellen auseinander.
//
// Bump-Regeln bei Änderungen:
//   PATCH  Bugfix, Textänderung, kleine UI-Korrektur
//   MINOR  neues kleineres Feature, spürbarer Umbau eines Bereichs
//   MAJOR  Strukturumbau, Architektur-/Datenmodell-Änderung, großer neuer Bereich
//
// Angezeigt wird die Version dezent im Footer des Dashboards (eingeloggter Bereich).
export const APP_VERSION = __APP_VERSION__
