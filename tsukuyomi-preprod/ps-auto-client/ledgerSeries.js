import { referenceStake, summarize, ticketDate } from "./ledgerAccounting.js?rev=chf-charts";

const swissCalendar = new Intl.DateTimeFormat("fr-CH", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Zurich",
});
const settled = new Set(["won", "lost", "void"]);
const kinds = ["simple", "combine", "triple"];

function dayOf(timestamp) {
  const parts = Object.fromEntries(swissCalendar.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function addTo(groups, key, ticket) {
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(ticket);
}

function sportLabel(sport) {
  const normalized = typeof sport === "string" ? sport.trim().toLocaleLowerCase("fr-CH") : "";
  return normalized ? normalized[0].toLocaleUpperCase("fr-CH") + normalized.slice(1) : "Sport non renseigné";
}

function brierFor(tickets) {
  let total = 0;
  let count = 0;
  for (const { probability_pct: probability, settlement } of tickets) {
    if (settlement.outcome === "void" || !Number.isFinite(probability) || probability < 0 || probability > 100) continue;
    const observed = settlement.outcome === "won" ? 1 : 0;
    total += (probability / 100 - observed) ** 2;
    count += 1;
  }
  return { count, score: count ? total / count : null };
}

export function buildLedgerSeries(tickets) {
  const days = new Map();
  const sports = new Map();
  const byKind = kinds.map((kind) => ({ kind, ...summarize(tickets.filter((ticket) => ticket.kind === kind)) }));
  for (const ticket of tickets) {
    addTo(sports, sportLabel(ticket.sport), ticket);
    const timestamp = Date.parse(ticketDate(ticket));
    if (Number.isFinite(timestamp) && settled.has(ticket.settlement?.outcome)) {
      addTo(days, dayOf(timestamp), ticket);
    }
  }

  let net = 0;
  let won = 0;
  let lost = 0;
  const timeline = [];
  const brier = [];
  for (const day of [...days.keys()].sort()) {
    const dailyTickets = days.get(day);
    const daily = summarize(dailyTickets);
    net += daily.net;
    won += daily.won;
    lost += daily.lost;
    const stake = referenceStake * (won + lost);
    timeline.push({
      day, net, won, lost, roi: stake ? net / stake : null,
      dayWon: daily.won, dayLost: daily.lost, dayVoid: daily.void,
    });
    const { score, count } = brierFor(dailyTickets);
    if (count) brier.push({ day, score, count });
  }

  const bySport = [...sports].sort(([a], [b]) => a.localeCompare(b, "fr-CH"))
    .map(([sport, rows]) => ({ sport, ...summarize(rows) }));
  return { timeline, byKind, bySport, brier };
}
