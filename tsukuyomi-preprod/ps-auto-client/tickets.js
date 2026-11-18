import { formatUnits, netUnits, outcomeLabel, referenceStake, ticketDate } from "./ledger.js?rev=tsukuyomi-portfolio";

const kinds = { simple: "Simple", combine: "Combiné", triple: "Triplé" };
const decimal = new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const percentage = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 });
const publicationDate = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Zurich",
});
const kickoffDate = new Intl.DateTimeFormat("fr-CH", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Zurich",
});

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

function renderLeg(doc, leg) {
  const item = element(doc, "li", "tsukuyomi-ticket-leg");
  const event = element(doc, "p", "tsukuyomi-ticket-meta", leg.event);
  const kickoff = time(doc, leg.starts_at, kickoffDate);
  if (kickoff) event.append(" · ", kickoff);
  item.append(event, element(doc, "p", "tsukuyomi-ticket-selection", leg.selection));

  const measurements = [];
  if (Number.isFinite(leg.odds)) measurements.push("Cote " + decimal.format(leg.odds));
  if (Number.isFinite(leg.probability_pct)) {
    measurements.push("Prob. estimée " + percentage.format(leg.probability_pct) + " %");
  }
  if (measurements.length) {
    item.append(element(doc, "p", "tsukuyomi-ticket-measurement", measurements.join(" · ")));
  }
  const outcome = Object.hasOwn(outcomeLabel, leg.outcome) ? outcomeLabel[leg.outcome] : "";
  const score = typeof leg.score === "string" && leg.score.trim();
  const result = [outcome, score].filter(Boolean).join(" · ");
  if (result) item.append(element(doc, "p", "tsukuyomi-ticket-meta", result));
  return item;
}

function metric(doc, label, value) {
  const item = element(doc, "div", "tsukuyomi-ticket-metric");
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
  const published = time(doc, ticketDate(ticket), publicationDate);
  const selections = legs.length === 1 ? "1 sélection" : legs.length + " sélections";

  if (published) metadata.append(published, " · ");
  metadata.append(selections);
  heading.append(element(doc, "h3", "tsukuyomi-ticket-title", title), metadata);
  const outcome = ticket.settlement?.outcome;
  const label = Object.hasOwn(outcomeLabel, outcome) ? outcomeLabel[outcome] : played ? "En attente" : "Publié";
  const badge = element(doc, "span", "tsukuyomi-ticket-status", label);
  if (Object.hasOwn(outcomeLabel, outcome)) badge.dataset.outcome = outcome;
  header.append(heading, badge);
  card.append(header);

  const legList = element(doc, "ol", "tsukuyomi-ticket-legs");
  for (const leg of legs) legList.append(renderLeg(doc, leg));
  card.append(legList);

  const metrics = element(doc, "dl", "tsukuyomi-ticket-odds");
  metrics.append(metric(doc, "Cote totale", Number.isFinite(ticket.odds) ? decimal.format(ticket.odds) : "—"));
  metrics.append(metric(doc, "Mise de référence", referenceStake + " u"));
  if (Number.isFinite(ticket.probability_pct)) {
    metrics.append(metric(doc, "Probabilité estimée", percentage.format(ticket.probability_pct) + " %"));
  }
  const units = netUnits(ticket);
  if (played && Number.isFinite(units)) metrics.append(metric(doc, "Bilan net", formatUnits(units)));
  if (played && Number.isFinite(ticket.settlement?.payout_odds) && ticket.settlement.payout_odds !== ticket.odds) {
    metrics.append(metric(doc, "Cote réglée", decimal.format(ticket.settlement.payout_odds)));
  }
  card.append(metrics);
  listItem.append(card);
  return listItem;
}

function isPublished(ticket) {
  return typeof ticket?.published_at === "string" && Number.isFinite(Date.parse(ticket.published_at));
}

function upcomingKickoff(ticket, now) {
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
    if (isPublished(ticket)) next = Math.min(next, upcomingKickoff(ticket, now));
  }
  return next;
}

function renderFeed(mount, { tickets = [], status, onRetry, now = Date.now() }, { view, onViewAll }) {
  const doc = mount.ownerDocument;
  const feed = element(doc, "div", onViewAll ? "tsukuyomi-tickets-latest" : "tsukuyomi-tickets-page");
  const played = view === "played";
  const rows = status === "ready" ? tickets.filter((ticket) => {
    if (played && ticket.placed_at) return true;
    if (!isPublished(ticket)) return false;
    if (view === "latest") return true;
    const upcoming = !ticket.settlement && Number.isFinite(upcomingKickoff(ticket, now));
    return played ? !upcoming : upcoming;
  }).sort((a, b) => Date.parse(ticketDate(b)) - Date.parse(ticketDate(a))) : [];
  if (!rows.length) {
    let message = view === "upcoming" ? "Aucun ticket à jouer pour le moment." : "Aucun ticket dans cet historique.";
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
