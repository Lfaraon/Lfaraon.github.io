import { selectionProbability } from "./ticketForecasts.js?rev=canonical-ticket";
import { selectionOutcome } from "./ledgerAccounting.js?rev=canonical-ticket";

export function selectionBrierScores(ticket) {
  const scores = [];
  const legs = ticket?.legs;
  if (!Array.isArray(legs)) return scores;

  for (const leg of legs) {
    if (!leg) continue;
    const outcome = selectionOutcome(ticket, leg);
    if (outcome !== "won" && outcome !== "lost") continue;

    const probability = selectionProbability(ticket, leg);
    if (probability === null) continue;

    scores.push((probability / 100 - (outcome === "won" ? 1 : 0)) ** 2);
  }
  return scores;
}
