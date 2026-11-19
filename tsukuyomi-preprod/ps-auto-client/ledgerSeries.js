import { hasRefundedLeg, selectionOutcome, summarize, summarizeFunds, ticketDate } from "./ledgerAccounting.js?rev=block-b";
import { archivedTicketForecast, ticketProbability } from "./ticketForecasts.js?rev=brier-runner-history";
import { selectionBrierScores } from "./selectionBrier.js?rev=canonical-ticket";

const swissCalendar = new Intl.DateTimeFormat("fr-CH", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Zurich",
});
const settled = new Set(["won", "lost", "void"]);
const kinds = ["simple", "combine", "triple"];
const mixedSports = new Set(["multiple", "multi", "multisport", "multisports", "multi-sport",
  "multi-sports", "mixte", "mixed", "all", "tous sports", "tous les sports", "sport non renseigné"]);

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
  if (!normalized || mixedSports.has(normalized) || /[,/|+&·]/.test(normalized)) return null;
  return normalized[0].toLocaleUpperCase("fr-CH") + normalized.slice(1);
}

function addSportResults(sports, ticket) {
  const ticketSport = sportLabel(ticket.sport);
  for (const leg of ticket.legs ?? []) {
    const outcome = selectionOutcome(ticket, leg);
    if (outcome !== "won" && outcome !== "lost") continue;
    const sport = sportLabel(leg?.sport) || ticketSport;
    if (!sport) continue;
    if (!sports.has(sport)) sports.set(sport, { sport, won: 0, lost: 0 });
    sports.get(sport)[outcome] += 1;
  }
}

function ticketBrier(ticket) {
  const { outcome } = ticket.settlement;
  if ((outcome !== "won" && outcome !== "lost") || hasRefundedLeg(ticket)) return null;

  const archived = archivedTicketForecast(ticket);
  if (ticket.probability_pct == null && Number.isFinite(archived?.score)) return archived.score;

  const probability = ticketProbability(ticket);
  if (probability === null) return null;
  return (probability / 100 - (outcome === "won" ? 1 : 0)) ** 2;
}

function brierFor(tickets) {
  let total = 0;
  let count = 0;
  for (const ticket of tickets) {
    const score = ticketBrier(ticket);
    if (score === null) continue;
    total += score;
    count += 1;
  }
  return { count, score: count ? total / count : null };
}

export function buildLedgerSeries(tickets, { includeBrier = true } = {}) {
  const days = new Map();
  const sports = new Map();
  const selectionScores = new Map();
  const byKind = kinds.map((kind) => ({ kind, ...summarize(tickets.filter((ticket) => ticket.kind === kind)) }));
  for (const ticket of tickets) {
    addSportResults(sports, ticket);
    const timestamp = Date.parse(ticketDate(ticket));
    if (!Number.isFinite(timestamp)) continue;
    const day = dayOf(timestamp);
    if (settled.has(ticket.settlement?.outcome)) addTo(days, day, ticket);
    if (includeBrier) {
      for (const score of selectionBrierScores(ticket)) addTo(selectionScores, day, score);
    }
  }

  let net = 0;
  let won = 0;
  let lost = 0;
  let stake = 0;
  const timeline = [];
  const brier = [];
  for (const day of [...days.keys()].sort()) {
    const dailyTickets = days.get(day);
    const funds = summarizeFunds(dailyTickets);
    const daily = summarize(dailyTickets, funds);
    net += daily.net;
    won += daily.won;
    lost += daily.lost;
    stake += funds.wonStake + funds.lostStake;
    timeline.push({
      day, net, won, lost, roi: stake ? net / stake : null,
      dayWon: daily.won, dayLost: daily.lost, dayVoid: daily.void,
    });
    if (includeBrier) {
      const { score, count } = brierFor(dailyTickets);
      if (count) brier.push({ day, score, count });
    }
  }

  const bySport = [...sports.values()].sort((a, b) => a.sport.localeCompare(b.sport, "fr-CH"))
    .map((result) => ({ ...result, winRate: result.won / (result.won + result.lost) }));
  const selectionBrier = [...selectionScores.keys()].sort().map((day) => {
    const scores = selectionScores.get(day);
    return { day, score: scores.reduce((sum, score) => sum + score, 0) / scores.length, count: scores.length };
  });
  return { timeline, byKind, bySport, brier, selectionBrier };
}
