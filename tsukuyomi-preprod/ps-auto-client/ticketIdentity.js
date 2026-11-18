const ticketSources = new Set(["PSF", "LORO"]);

function normalizedLabel(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‐‑‒–—−]/gu, "-")
    .replace(/[‘’]/gu, "'")
    .replace(/(\d),(?=\d)/gu, "$1.")
    .replace(/\s*([-:+])\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function legIdentity(leg) {
  const canonicalEvent = typeof leg?.event_key === "string" && leg.event_key.trim();
  const canonicalMarket = typeof leg?.market_key === "string" && leg.market_key.trim();
  const event = normalizedLabel(leg?.event);
  const kickoff = Date.parse(leg?.starts_at);
  const selection = normalizedLabel(leg?.selection);
  const eventKey = canonicalEvent
    ? ["canonical", canonicalEvent]
    : event && Number.isFinite(kickoff) && ["scheduled", event, kickoff];
  const marketKey = canonicalMarket ? ["canonical", canonicalMarket] : selection && ["label", selection];
  return eventKey && marketKey ? JSON.stringify([eventKey, marketKey]) : null;
}

function ticketIdentity(ticket) {
  if (!Array.isArray(ticket?.legs) || !ticket.legs.length) return null;
  const legs = ticket.legs.map(legIdentity);
  if (legs.some((key) => key === null)) return null;
  return JSON.stringify(legs.sort());
}

function totalOdds(ticket) {
  return Number.isFinite(ticket.odds) && ticket.odds > 1 ? ticket.odds : -Infinity;
}

function compareCandidates(left, right) {
  return right.odds - left.odds || left.index - right.index;
}

export function deduplicateTickets(tickets) {
  const groups = new Map();
  tickets.forEach((ticket, index) => {
    const source = typeof ticket?.source_platform === "string" && ticket.source_platform.trim().toUpperCase();
    if (!ticketSources.has(source)) return;
    const key = ticketIdentity(ticket);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { PSF: [], LORO: [] });
    groups.get(key)[source].push({ index, odds: totalOdds(ticket) });
  });

  const duplicates = new Set();
  for (const { PSF, LORO } of groups.values()) {
    if (!PSF.length || !LORO.length) continue;
    PSF.sort(compareCandidates);
    LORO.sort(compareCandidates);
    const pairs = Math.min(PSF.length, LORO.length);
    // Repeated tickets on one source retain their unmatched occurrences.
    for (let i = 0; i < pairs; i += 1) {
      const keepPsf = compareCandidates(PSF[i], LORO[i]) <= 0;
      duplicates.add((keepPsf ? LORO[i] : PSF[i]).index);
    }
  }
  return tickets.filter((_, index) => !duplicates.has(index));
}
