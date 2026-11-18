// Replayed from the pre-match data matrices of the listed Runner runs.
// These values are for ticket display. Brier uses the forecasts recorded at the time.
export const recalculatedSelectionForecasts = new Map([
  // PSF-2026-11-07-172005-19AE, event 72531014: away goals + 3 > home goals.
  ["LORO-2026-11-07-T002", [
    ["Sporting CP – Moreirense", "Moreirense +3.0 handicap", 86.32773],
  ]],
  // PSF-2026-11-09-102747-F880, events 76425310, 72477578 and 76509750.
  // Sabalenka wins at least one set. The football selections use
  // away goals + 1.5 > home goals and home goals + 2 > away goals, respectively.
  ["PSF-2026-11-09-T002", [
    ["Sabalenka, Aryna – Muchova, Karolina", "Sabalenka, Aryna +1.5 (handicap sets)", 82],
    ["CE Sabadell FC – Real Sociedad San Sebastian B", "Real Sociedad San Sebastian B +1.5 (handicap buts)", 74.9],
  ]],
  ["LORO-2026-11-09-T001", [
    ["Kristiansund BK – Vålerenga", "Kristiansund BK +2.0 handicap", 82.89811],
  ]],
  // PSAUTO-2026-11-12-095308-187D, event 89491:
  // sum the score cells where Senegal does not lose AND the total is four goals or fewer.
  ["LORO-2026-11-12-T002", [
    ["Sénégal – Soudan", "Sénégal ou nul et Under4.5 buts (match)", 78.8584],
  ]],
  // PSF-2026-11-13-184941-1B30, event 68931586: home goals + 3 > away goals.
  ["LORO-2026-11-13-T001", [
    ["Serbie – Allemagne", "Serbie +3.0 handicap", 88.25473],
  ]],
]);
