import { archivedForecasts } from "./archivedForecasts.js?rev=probability-display";
import { archivedSelectionForecasts } from "./archivedSelectionForecasts.js?rev=probability-display";

function validProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function archivedTicketForecast(ticket) {
  const forecast = ticket.placed_at ? archivedForecasts.get(ticket.id) : null;
  return forecast && forecast.outcome === ticket.settlement?.outcome ? forecast : null;
}

function recordedSelectionProbability(ticket, leg) {
  if (!leg) return null;
  const recorded = validProbability(leg.probability_pct);
  if (recorded !== null || !ticket.placed_at) return recorded;
  const historical = archivedSelectionForecasts.get(ticket.id);
  const match = historical?.find(([fixture, selection]) => fixture === leg.event && selection === leg.selection);
  return validProbability(match?.[2]);
}

export function ticketProbability(ticket) {
  return validProbability(ticket.probability_pct)
    ?? validProbability(archivedTicketForecast(ticket)?.probability)
    ?? (ticket.legs?.length === 1 ? recordedSelectionProbability(ticket, ticket.legs[0]) : null);
}

export function selectionProbability(ticket, leg) {
  return recordedSelectionProbability(ticket, leg)
    ?? (ticket.legs?.length === 1 ? ticketProbability(ticket) : null);
}
