import { isFollowableTicketId } from "./following.js";

const kickoffPattern = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const fixtureSeparator = /\s*[–—]\s*|\s+(?:-|v\.?|vs\.?|contre)\s+/;

function label(value) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  return /\p{Cc}/u.test(text) ? "" : text;
}

function folded(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/gu, "'").toLowerCase();
}

function eventKey(event) {
  const comparable = folded(event).replace(/[‐‑‒−]/gu, "-");
  const sides = comparable.split(fixtureSeparator);
  return sides.length === 2 && sides.every(Boolean) ? sides.sort() : comparable;
}

function fromKickoff(value) {
  const day = typeof value === "string" && kickoffPattern.exec(value)?.[1];
  if (!day || day.startsWith("0000")) return null;
  const localDate = new Date(day + "T00:00:00Z");
  const kickoff = new Date(value);
  return Number.isFinite(localDate.getTime()) && localDate.toISOString().slice(0, 10) === day
    && Number.isFinite(kickoff.getTime()) ? kickoff.toISOString() : null;
}

function singleSport(value) {
  const sport = label(value);
  return /^multi(?:[- ]?sports?)$/i.test(sport) ? "" : sport;
}

export function buildFollowedMatches(tickets) {
  if (!Array.isArray(tickets)) return [];
  const matches = new Map();
  for (const ticket of tickets) {
    if (!isFollowableTicketId(ticket?.id) || !Array.isArray(ticket.legs)) continue;
    for (const leg of ticket.legs) {
      const event = label(leg?.event);
      const startsAt = fromKickoff(leg?.starts_at);
      if (!event || !startsAt) continue;

      const sport = singleSport(leg.sport) || singleSport(ticket.sport) || null;
      const id = JSON.stringify([startsAt, folded(sport ?? ""), eventKey(event)]);
      if (!matches.has(id)) matches.set(id, { id, event, startsAt, sport, tickets: new Map() });
      const match = matches.get(id);
      if (!match.tickets.has(ticket.id)) {
        match.tickets.set(ticket.id, { id: ticket.id, kind: label(ticket.kind) || null });
      }
    }
  }

  return [...matches.values()].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)
    || left.event.localeCompare(right.event, "fr-CH"))
    .map((match) => ({ ...match, tickets: [...match.tickets.values()] }));
}
