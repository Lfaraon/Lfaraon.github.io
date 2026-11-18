import { formatChf, netAmount, outcomeLabel, referenceStake, ticketDate } from "./ledgerAccounting.js?rev=chf-charts";
import { recalculatedSelectionProbability, recalculatedTicketProbability, selectionProbability, ticketProbability } from "./ticketForecasts.js?rev=probability-replay";

const kinds = { simple: "Simple", combine: "Combiné", triple: "Triplé" };
const selectionOutcomes = { won: "Gagnée", lost: "Perdue", void: "Remboursée" };
const decimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentage = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 });
const publicationDate = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Zurich",
});
const shortDate = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Zurich",
});
const kickoffDate = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Zurich",
});

function formatProbability(value) {
  return value === null ? "—" : percentage.format(value) + "\u00a0%";
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function time(doc, value, formatter) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const node = element(doc, "time", "", formatter.format(timestamp));
  node.dateTime = value;
  return node;
}

function decimalComma(text) {
  return text.replace(/(\d)\.(?=\d)/g, "$1,");
}

function fixtureKey(text) {
  return String(text ?? "").normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function selectionParts(leg, sport) {
  const pick = typeof leg.selection === "string" ? leg.selection.trim() : "";
  const total = /^(.*?)\s*(under|over|moins\s+de|plus\s+de)\s*(\d+(?:[.,]\d+)?)\s*(buts?|goals?)?\s*(?:\((match|équipe)\)|(équipe))?$/i.exec(pick);
  if (total && !/\s(?:ou|et)\s/i.test(total[1]) && (total[4] || /football/i.test(leg.sport || sport))) {
    const target = total[1].replace(/[\s:–-]+$/, "");
    const scope = (total[5] || total[6])?.toLowerCase();
    const teamTotal = scope === "équipe" || (!scope && target && fixtureKey(target) !== fixtureKey(leg.event));
    const market = teamTotal && target ? "Buts de " + target : teamTotal ? "Total de buts · équipe" : "Total de buts · match";
    const direction = /^(?:under|moins)/i.test(total[2]) ? "Moins" : "Plus";
    const line = decimalComma(total[3]);
    return [market, `${direction} de ${line} ${Number(line.replace(",", ".")) <= 1 ? "but" : "buts"}`];
  }

  const refund = /^(.+?)\s*\((?:remboursé si nul|DNB|draw no bet)\)$/i.exec(pick);
  if (refund) return ["Match nul remboursé", refund[1]];
  const doubleChance = /^(.+?)\s*\(double chance\)$/i.exec(pick);
  if (doubleChance) return ["Double chance", doubleChance[1]];
  const winner = /^(.+?)\s+vainqueur(?:e)?$/i.exec(pick);
  if (winner) return ["Vainqueur du match", winner[1]];
  const scorer = /^(.+?)\s+buteur$/i.exec(pick);
  if (scorer) return ["Buteur", scorer[1]];

  const handicap = /^(.+?)\s+([+-])\s*(\d+(?:[.,]\d+)?)(.*)$/i.exec(pick);
  if (handicap) {
    const [, target, sign, line, suffix] = handicap;
    const choice = `${target} ${sign}${decimalComma(line)}`;
    const format = suffix.trim().replace(/^\((.*)\)$/, "$1");
    if (/^sets?$|^handicap sets?$/i.test(format)) return ["Handicap en sets", choice];
    if (/^(?:asian|handicap asiatique)$/i.test(format)) return ["Handicap asiatique", choice];
    const european = /^handicap 1X2(?: européen)?(?:, issue (.+))?$/i.exec(format);
    if (european) {
      const issue = european[1];
      return ["Handicap 1X2", issue && fixtureKey(issue) !== fixtureKey(target) ? `${choice} (issue ${issue})` : choice];
    }
    if (/^handicap buts$/i.test(format)) return ["Handicap en buts", choice];
    if (/^(?:handicap)?$/i.test(format)) return ["Handicap", choice];
  }
  return ["", decimalComma(pick) || "Sélection non renseignée"];
}

function statusChip(doc, className, label, outcome) {
  const badge = element(doc, "span", className, label);
  if (outcome) badge.dataset.outcome = outcome;
  return badge;
}

function renderLeg(doc, leg, index, ticket, played, settled) {
  const item = element(doc, "li", "tsukuyomi-ticket-leg");
  const content = element(doc, "div", "tsukuyomi-ticket-leg-content");
  const number = element(doc, "span", "tsukuyomi-ticket-leg-number", index + 1);
  number.setAttribute("aria-hidden", "true");
  item.append(number, content);
  const fixture = element(doc, "div", "tsukuyomi-ticket-fixture");
  fixture.append(element(doc, "span", "tsukuyomi-ticket-event", leg.event));
  const kickoff = time(doc, leg.starts_at, kickoffDate);
  if (kickoff) fixture.append(" ", kickoff);
  content.append(fixture);

  const [market, choice] = selectionParts(leg, ticket.sport);
  const selection = element(doc, "p", "tsukuyomi-ticket-selection");
  selection.append(element(doc, "span", "tsukuyomi-ticket-choice", choice));
  if (market) selection.append(" ", element(doc, "span", "tsukuyomi-ticket-market", market));
  content.append(selection);

  const facts = element(doc, "div", "tsukuyomi-ticket-leg-facts");
  const measurements = [];
  if (Number.isFinite(leg.odds)) measurements.push(["Cote", decimal.format(leg.odds)]);
  const estimate = selectionProbability(ticket, leg) ?? recalculatedSelectionProbability(ticket, leg);
  measurements.push(["Prob. estimée", formatProbability(estimate)]);
  const metrics = element(doc, "p", "tsukuyomi-ticket-measurement");
  for (const [label, value] of measurements) {
    const pair = element(doc, "span", "", label + " ");
    pair.append(element(doc, "strong", "", value));
    metrics.append(pair, " ");
  }
  facts.append(metrics);
  const outcome = Object.hasOwn(selectionOutcomes, leg.outcome) ? leg.outcome : null;
  const score = typeof leg.score === "string" && leg.score.trim();
  if (outcome || score || played || settled) {
    if (outcome) item.dataset.outcome = outcome;
    const result = element(doc, "p", "tsukuyomi-ticket-leg-result");
    if (outcome || played || settled) {
      const label = outcome ? selectionOutcomes[outcome] : settled ? "Non vérifiée" : "En attente";
      result.append(statusChip(doc, "tsukuyomi-ticket-leg-status", label, outcome));
    }
    if (score) result.append(element(doc, "span", "tsukuyomi-ticket-score", score));
    facts.append(" ", result);
  }
  content.append(facts);
  return item;
}

function metric(doc, label, value, outcome) {
  const item = element(doc, "div", "tsukuyomi-ticket-metric");
  if (outcome) item.dataset.outcome = outcome;
  item.append(element(doc, "dt", "", label), element(doc, "dd", "", value));
  return item;
}

function renderTicket(doc, ticket, played) {
  const listItem = element(doc, "li", "tsukuyomi-ticket-item");
  const card = element(doc, "article", "tsukuyomi-ticket");
  const header = element(doc, "header", "tsukuyomi-ticket-header");
  const heading = element(doc, "div", "tsukuyomi-ticket-heading");
  const sports = typeof ticket.sport === "string" ? ticket.sport.trim() : "";
  const sport = sports ? sports[0].toLocaleUpperCase("fr") + sports.slice(1) : "";
  const title = [kinds[ticket.kind] || "Ticket", sport].filter(Boolean).join(" · ");
  const legs = Array.isArray(ticket.legs) ? ticket.legs.filter(Boolean) : [];
  const metadata = element(doc, "p", "tsukuyomi-ticket-meta");
  const published = time(doc, ticketDate(ticket), shortDate);
  const selections = legs.length === 1 ? "1 sélection" : legs.length + " sélections";

  if (published) {
    published.title = publicationDate.format(Date.parse(published.dateTime));
    metadata.append(published, " · ");
  }
  metadata.append(selections);
  heading.append(element(doc, "h3", "tsukuyomi-ticket-title", title), metadata);
  const outcome = ticket.settlement?.outcome;
  const settled = Object.hasOwn(outcomeLabel, outcome);
  const label = settled ? outcomeLabel[outcome] : played ? "En attente" : "Publié";
  const badge = statusChip(doc, "tsukuyomi-ticket-status", label, settled ? outcome : null);
  header.append(heading, badge);
  card.append(header);

  const legList = element(doc, "ol", "tsukuyomi-ticket-legs");
  legList.setAttribute("role", "list");
  legs.forEach((leg, index) => legList.append(renderLeg(doc, leg, index, ticket, played, settled)));
  if (!legs.length) legList.append(element(doc, "li", "tsukuyomi-ticket-meta", "Sélections non renseignées"));
  card.append(legList);

  const estimate = ticketProbability(ticket) ?? recalculatedTicketProbability(ticket);
  const probability = element(doc, "p", "tsukuyomi-ticket-probability", "Probabilité du ticket · ");
  probability.append(element(doc, "strong", "", formatProbability(estimate)));
  card.append(probability);

  const metrics = element(doc, "dl", "tsukuyomi-ticket-odds");
  const odds = Number.isFinite(ticket.odds) ? decimal.format(ticket.odds) : "—";
  metrics.append(metric(doc, "Cote totale", odds));
  const payoutOdds = ticket.settlement?.payout_odds;
  if (outcome === "won" && Number.isFinite(payoutOdds) && payoutOdds >= 1 && decimal.format(payoutOdds) !== odds) {
    metrics.append(metric(doc, "Cote réglée", decimal.format(payoutOdds)));
  }
  metrics.append(metric(doc, "Mise de référence", formatChf(referenceStake)));
  const net = netAmount(ticket);
  if (Number.isFinite(net)) metrics.append(metric(doc, net < 0 ? "Perte nette" : "Gain net", formatChf(net, true), outcome));
  card.append(metrics);
  listItem.append(card);
  return listItem;
}

function isPublished(ticket) {
  return typeof ticket?.published_at === "string" && Number.isFinite(Date.parse(ticket.published_at));
}

export function upcomingTicketKickoff(ticket, now = Date.now()) {
  if (!Array.isArray(ticket.legs) || !ticket.legs.length) return Infinity;
  let firstKickoff = Infinity;
  for (const leg of ticket.legs) {
    const kickoff = Date.parse(leg?.starts_at);
    if (!Number.isFinite(kickoff) || kickoff <= now) return Infinity;
    firstKickoff = Math.min(firstKickoff, kickoff);
  }
  return firstKickoff;
}

export function nextTicketKickoff(tickets, now = Date.now()) {
  let next = Infinity;
  for (const ticket of tickets) {
    if (isPublished(ticket)) next = Math.min(next, upcomingTicketKickoff(ticket, now));
  }
  return next;
}

export function ticketsForView(tickets, { view = "upcoming", now = Date.now() } = {}) {
  const played = view === "played";
  return tickets.filter((ticket) => {
    if (played && ticket.placed_at) return true;
    if (!isPublished(ticket)) return false;
    if (view === "latest") return true;
    const upcoming = !ticket.settlement && Number.isFinite(upcomingTicketKickoff(ticket, now));
    return played ? !upcoming : upcoming;
  }).sort((a, b) => Date.parse(ticketDate(b)) - Date.parse(ticketDate(a)));
}

function renderFeed(mount, { tickets = [], status, onRetry, filtered, now }, { view, onViewAll }) {
  const doc = mount.ownerDocument;
  const feed = element(doc, "div", onViewAll ? "tsukuyomi-tickets-latest" : "tsukuyomi-tickets-page");
  const played = view === "played";
  const rows = status === "ready" ? ticketsForView(tickets, { view, now }) : [];
  if (!rows.length) {
    let message = view === "upcoming" ? "Aucun ticket à jouer pour le moment." : "Aucun ticket dans cet historique.";
    if (filtered) message = "Aucun ticket ne correspond à ces filtres.";
    if (view === "latest") message = "Aucun pronostic publié pour le moment.";
    if (status === "loading") message = played ? "Chargement de l’historique…" : "Chargement des pronostics…";
    if (status === "error") message = played ? "L’historique est momentanément indisponible." : "Les pronostics sont momentanément indisponibles.";
    const notice = element(doc, "p", "tsukuyomi-ticket-notice", message);
    notice.setAttribute("role", "status");
    feed.append(notice);
    if (status === "error" && onRetry) {
      const retry = element(doc, "button", "tsukuyomi-tickets-button tsukuyomi-tickets-retry", "Réessayer");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      feed.append(retry);
    }
  } else {
    if (!onViewAll) {
      const count = rows.length === 1 ? "1 pronostic" : rows.length + " pronostics";
      feed.append(element(doc, "p", "tsukuyomi-ticket-count", count));
    }
    const list = element(doc, "ul", "tsukuyomi-ticket-list");
    const shown = onViewAll ? rows.slice(0, 4) : rows;
    for (const ticket of shown) list.append(renderTicket(doc, ticket, played));
    feed.append(list);
  }
  if (onViewAll) {
    const button = element(doc, "button", "tsukuyomi-tickets-button tsukuyomi-tickets-view-all", "Voir tous les pronostics");
    button.type = "button";
    button.addEventListener("click", onViewAll);
    feed.append(button);
  }
  mount.replaceChildren(feed);
}

export function renderTickets(mount, data) {
  renderFeed(mount, data, { view: "upcoming" });
}

export function renderPlayedTickets(mount, data) {
  renderFeed(mount, data, { view: "played" });
}

export function renderLatestTickets(mount, { tickets, status, onRetry, onViewAll }) {
  renderFeed(mount, { tickets, status, onRetry }, { view: "latest", onViewAll });
}
