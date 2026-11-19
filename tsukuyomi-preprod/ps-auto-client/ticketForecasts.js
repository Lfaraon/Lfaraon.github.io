import { archivedForecasts } from "./archivedForecasts.js?rev=brier-runner-history";
import { archivedSelectionForecasts } from "./archivedSelectionForecasts.js?rev=probability-replay";
import { recalculatedSelectionForecasts } from "./recalculatedSelectionForecasts.js?rev=probability-replay";
import { isCanonicalTicket } from "./ledgerAccounting.js?rev=canonical-ticket";

function validProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function fixtureLabel(event) {
  return typeof event === "string" ? event.normalize("NFKD").toLowerCase()
    .split(/[–—]|\s+-\s+/u)
    .map((side) => side.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .sort()
    .join("–") : "";
}

export function archivedTicketForecast(ticket) {
  const forecast = ticket.placed_at ? archivedForecasts.get(ticket.id) : null;
  return forecast && forecast.outcome === ticket.settlement?.outcome ? forecast : null;
}

function historicalSelectionProbability(ticket, leg, source) {
  if (!leg || !ticket.placed_at) return null;
  const historical = source.get(ticket.id);
  const match = historical?.find(([fixture, selection]) => fixture === leg.event && selection === leg.selection);
  return validProbability(match?.[2]);
}

function recordedSelectionProbability(ticket, leg) {
  return validProbability(leg?.probability_pct) ?? historicalSelectionProbability(ticket, leg, archivedSelectionForecasts);
}

export function ticketProbability(ticket) {
  if (isCanonicalTicket(ticket)) return validProbability(ticket.probability_pct);
  return validProbability(ticket.probability_pct)
    ?? validProbability(archivedTicketForecast(ticket)?.probability)
    ?? (ticket.legs?.length === 1 ? recordedSelectionProbability(ticket, ticket.legs[0]) : null);
}

export function selectionProbability(ticket, leg) {
  if (isCanonicalTicket(ticket)) return validProbability(leg?.probability_pct);
  return recordedSelectionProbability(ticket, leg)
    ?? (ticket.legs?.length === 1 ? ticketProbability(ticket) : null);
}

export function recalculatedSelectionProbability(ticket, leg) {
  return isCanonicalTicket(ticket) ? null : historicalSelectionProbability(ticket, leg, recalculatedSelectionForecasts);
}

export function recalculatedTicketProbability(ticket) {
  if (isCanonicalTicket(ticket) || !Array.isArray(ticket.legs) || !ticket.legs.length) return null;
  if (ticket.legs.length === 1) return recalculatedSelectionProbability(ticket, ticket.legs[0]);
  const fixtures = new Set();
  const fixtureIds = new Set();
  let probability = 1;
  for (const leg of ticket.legs) {
    const label = fixtureLabel(leg?.event);
    const id = typeof leg?.event_key === "string" ? leg.event_key.trim() : "";
    if ((!label && !id) || (label && fixtures.has(label)) || (id && fixtureIds.has(id))) return null;
    if (label) fixtures.add(label);
    if (id) fixtureIds.add(id);

    const estimate = selectionProbability(ticket, leg) ?? recalculatedSelectionProbability(ticket, leg);
    if (estimate === null) return null;
    probability *= estimate / 100;
  }
  return probability * 100;
}
