import { archivedSelectionForecasts } from "./archivedSelectionForecasts.js?rev=stats-auto";
import { selectionOutcome } from "./ledgerAccounting.js?rev=stats-auto";

export function selectionBrierScores(ticket) {
  const scores = [];
  const legs = ticket?.legs;
  if (!Array.isArray(legs)) return scores;

  const historical = ticket.placed_at ? archivedSelectionForecasts.get(ticket.id) : null;
  for (const leg of legs) {
    if (!leg) continue;
    const outcome = selectionOutcome(ticket, leg);
    if (outcome !== "won" && outcome !== "lost") continue;

    const exact = historical?.find(([fixture, selection]) => fixture === leg.event && selection === leg.selection);
    const probability = leg.probability_pct ?? exact?.[2] ?? (legs.length === 1 ? ticket.probability_pct : null);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) continue;

    scores.push((probability / 100 - (outcome === "won" ? 1 : 0)) ** 2);
  }
  return scores;
}
