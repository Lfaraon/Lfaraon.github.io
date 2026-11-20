import { confirmedOutcome, formatChf, isCanonicalTicket, netAmount, outcomeLabel, ticketDate, ticketStake } from "./ledgerAccounting.js?rev=reference-stake";
import { recalculatedSelectionProbability, recalculatedTicketProbability, selectionProbability, ticketProbability } from "./ticketForecasts.js?rev=canonical-ticket";

const kinds = { simple: "Simple", combine: "Combiné", triple: "Triplé" };
const hiddenPlayedTicketId = "LORO-2026-11-12-T002";
const playedTicketSwap = ["PSF-2026-11-12-T002", "LORO-2026-11-12-T001"];
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

export function formatExactDecimal(value) {
  return String(value).replace(".", ",");
}

export function formatTicketProbability(value) {
  return Number.isFinite(value) ? percentage.format(value) + "\u00a0%" : "";
}

export function formatExactProbability(value) {
  return Number.isFinite(value) ? formatExactDecimal(value) + "\u00a0%" : undefined;
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

function sentenceCase(text) {
  const value = text.trim();
  return value === value.toLocaleUpperCase("fr") ? value.toLocaleLowerCase("fr") : value;
}

function canonicalParticipantLabel(name, sport) {
  if (!/^tennis$/i.test(sport)) return name;
  return name.split(/\s*\/\s*/).map((player) => {
    const parts = /^([^,]+),\s*([^,]+)$/.exec(player);
    return parts ? `${parts[2].trim()} ${parts[1].trim()}` : player;
  }).join(" / ");
}

export function canonicalEventLabel(leg) {
  if (!/^tennis$/i.test(leg.sport) || !Array.isArray(leg.participants)) return leg.event;
  return leg.participants.reduce((event, name) => (
    event.replace(name, canonicalParticipantLabel(name, leg.sport))
  ), leg.event);
}

function lineKey(value) {
  return decimalComma(value).replace(/^\+/, "").replace(/^−/, "-");
}

function canonicalTotalPick(pick, participant, line, unit) {
  const total = /^(?:(.+?)\s+)?(under|over|moins\s+de|plus\s+de)(?:\s*(\d+(?:[.,]\d+)?))?(?:\s*(?:buts?|goals?|jeux|games?))?$/i.exec(pick);
  if (!total || (total[1] && fixtureKey(total[1]) !== fixtureKey(participant))) return "";
  const threshold = total[3] ? decimalComma(total[3]) : line;
  if (!/^\d+(,\d+)?$/.test(threshold)) return "";
  const direction = /^(?:under|moins)/i.test(total[2]) ? "Moins" : "Plus";
  const quantity = unit === "buts" && Number(threshold.replace(",", ".")) <= 1 ? "but" : unit;
  return `${direction} de ${threshold} ${quantity}`;
}

export function canonicalSelectionParts(leg) {
  const sourceMarket = leg.market?.trim() ?? "";
  const sourcePick = leg.selection?.trim() || "Sélection non renseignée";
  const participant = leg.participant ? canonicalParticipantLabel(leg.participant, leg.sport) : "";
  const line = leg.line == null ? "" : decimalComma(String(leg.line));
  let market = sentenceCase(sourceMarket);
  let choice = decimalComma(sourcePick);
  const teamGoals = /^total de buts (?:par équipe|de l[’']équipe (?:à domicile|à l[’']extérieur))$/i.test(sourceMarket);
  const matchGoals = /^total de buts(?: du match)?$/i.test(sourceMarket);
  const matchGames = /^total de jeux(?: du match)?$/i.test(sourceMarket);
  const setHandicap = /^handicap (?:de|en) sets?$/i.test(sourceMarket);
  const period = sentenceCase(leg.period ?? "");
  const perMatch = /^(?:match|temps réglementaire)$/i.test(period);

  if (teamGoals || matchGoals || matchGames) {
    if (teamGoals && participant) market = "Buts de " + participant;
    if (matchGoals) market = "Total de buts";
    if (matchGames) market = "Total de jeux";
    if ((matchGoals || matchGames) && (!period || perMatch)) market += " · match";
    choice = canonicalTotalPick(sourcePick, leg.participant, line, matchGames ? "jeux" : "buts") || choice;
  } else if (setHandicap) {
    market = "Handicap en sets";
    const handicap = /^(.+?)\s+([+−-])\s*(\d+(?:[.,]\d+)?)\s*(?:sets?)?$/i.exec(sourcePick);
    if (handicap) choice = `${canonicalParticipantLabel(handicap[1], leg.sport)} ${handicap[2]}${decimalComma(handicap[3])}`;
  }
  if (participant && leg.participant && participant !== leg.participant) choice = choice.replace(leg.participant, participant);

  const details = [market];
  const labels = [market, choice].join(" ").toLocaleLowerCase("fr");
  if (participant && !labels.includes(participant.toLocaleLowerCase("fr"))) details.push(participant);
  const choiceNumbers = choice.match(/[+−-]?\d+(?:,\d+)?/g) ?? [];
  if (line && !choiceNumbers.some((shown) => lineKey(shown) === lineKey(line))) details.push(`Ligne ${line}`);
  if (period && !(perMatch && (teamGoals || matchGoals || matchGames || setHandicap))
      && !labels.includes(period.toLocaleLowerCase("fr"))) details.push(period);
  return [details.filter(Boolean).join(" · "), choice];
}

function statusChip(doc, className, label, outcome) {
  const badge = element(doc, "span", className, label);
  if (outcome) badge.dataset.outcome = outcome;
  return badge;
}

function renderLeg(doc, leg, index, ticket, played, settled) {
  const canonical = isCanonicalTicket(ticket);
  const item = element(doc, "li", "tsukuyomi-ticket-leg");
  const content = element(doc, "div", "tsukuyomi-ticket-leg-content");
  const number = element(doc, "span", "tsukuyomi-ticket-leg-number", index + 1);
  number.setAttribute("aria-hidden", "true");
  item.append(number, content);
  const fixture = element(doc, "div", "tsukuyomi-ticket-fixture");
  fixture.append(element(doc, "span", "tsukuyomi-ticket-event", canonical ? canonicalEventLabel(leg) : leg.event));
  const kickoff = time(doc, leg.starts_at, kickoffDate);
  if (kickoff) fixture.append(" ", kickoff);
  if (canonical && ticket.sport === "MULTISPORT" && leg.sport) {
    const sport = sentenceCase(leg.sport);
    if (sport) fixture.append(" ", element(doc, "span", "tsukuyomi-ticket-market", sport[0].toLocaleUpperCase("fr") + sport.slice(1)));
  }
  content.append(fixture);

  const [market, choice] = canonical ? canonicalSelectionParts(leg) : selectionParts(leg, ticket.sport);
  const selection = element(doc, "p", "tsukuyomi-ticket-selection");
  selection.append(element(doc, "span", "tsukuyomi-ticket-choice", choice));
  if (market) selection.append(" ", element(doc, "span", "tsukuyomi-ticket-market", market));
  content.append(selection);

  const facts = element(doc, "div", "tsukuyomi-ticket-leg-facts");
  const measurements = [];
  if (Number.isFinite(leg.odds)) measurements.push(["Cote", decimal.format(leg.odds), canonical ? formatExactDecimal(leg.odds) : null]);
  const estimate = selectionProbability(ticket, leg) ?? recalculatedSelectionProbability(ticket, leg);
  if (!canonical || estimate !== null) {
    measurements.push(["Prob. estimée", formatTicketProbability(estimate) || "—", canonical ? formatExactProbability(estimate) : null]);
  }
  const metrics = element(doc, "p", "tsukuyomi-ticket-measurement");
  for (const [label, value, exact] of measurements) {
    const pair = element(doc, "span", "", label + " ");
    const number = element(doc, "strong", "", value);
    if (exact && exact !== value) {
      number.title = exact;
      number.setAttribute("aria-label", exact);
    }
    pair.append(number);
    metrics.append(pair, " ");
  }
  facts.append(metrics);
  const outcome = Object.hasOwn(selectionOutcomes, leg.outcome) ? leg.outcome : null;
  const score = typeof leg.score === "string" && leg.score.trim();
  const showPlaceholder = !canonical && (played || settled);
  if (outcome || score || showPlaceholder) {
    if (outcome) item.dataset.outcome = outcome;
    const result = element(doc, "p", "tsukuyomi-ticket-leg-result");
    if (outcome || showPlaceholder) {
      const label = outcome ? selectionOutcomes[outcome] : settled ? "Non vérifiée" : "En attente";
      result.append(statusChip(doc, "tsukuyomi-ticket-leg-status", label, outcome));
    }
    if (score) result.append(element(doc, "span", "tsukuyomi-ticket-score", score));
    facts.append(" ", result);
  }
  content.append(facts);
  return item;
}

function metric(doc, label, value, outcome, exact) {
  const item = element(doc, "div", "tsukuyomi-ticket-metric");
  if (outcome) item.dataset.outcome = outcome;
  const number = element(doc, "dd", "", value);
  if (exact && exact !== value) {
    number.title = exact;
    number.setAttribute("aria-label", exact);
  }
  item.append(element(doc, "dt", "", label), number);
  return item;
}

function createTicketCard(doc, ticket, played, open, {
  now = Date.now(), showImportedStake = false, showReasoning = false, reasoningOpen = false,
} = {}) {
  const canonical = isCanonicalTicket(ticket);
  const collapsible = played || (canonical && isPublished(ticket));
  const card = element(doc, "article", "tsukuyomi-ticket");
  const reasoningText = showReasoning && typeof ticket.reasoning === "string" ? ticket.reasoning.trim() : "";
  const reasoning = reasoningText ? element(doc, "details", "tsukuyomi-ticket-reasoning") : null;
  const header = element(doc, collapsible ? "summary" : "header", "tsukuyomi-ticket-header");
  const heading = element(doc, collapsible ? "span" : "div", "tsukuyomi-ticket-heading");
  const sports = typeof ticket.sport === "string" ? ticket.sport.trim() : "";
  const sport = sports ? sports[0].toLocaleUpperCase("fr") + (canonical ? sports.slice(1).toLocaleLowerCase("fr") : sports.slice(1)) : "";
  const title = [kinds[ticket.kind] || "Ticket", sport].filter(Boolean).join(" · ");
  const legs = Array.isArray(ticket.legs) ? ticket.legs.filter(Boolean) : [];
  const metadata = element(doc, collapsible ? "span" : "p", "tsukuyomi-ticket-meta");
  const published = time(doc, ticketDate(ticket), shortDate);
  const selections = legs.length === 1 ? "1 sélection" : legs.length + " sélections";

  if (published) {
    published.title = publicationDate.format(Date.parse(published.dateTime));
    metadata.append(published, " · ");
  }
  metadata.append(selections);
  heading.append(element(doc, collapsible ? "span" : "h3", "tsukuyomi-ticket-title", title), metadata);
  const outcome = confirmedOutcome(ticket);
  const settled = Boolean(outcome);
  const waiting = played || isAwaitingResult(ticket, now);
  const unpublished = ticket.duplicate_of ? "Écarté" : ticket.withdrawn_at ? "Retiré" : "Brouillon";
  const label = settled ? outcomeLabel[outcome]
    : canonical && !isPublished(ticket) ? unpublished : waiting ? "En attente" : "Publié";
  const badge = statusChip(doc, "tsukuyomi-ticket-status", label, settled ? outcome : null);
  header.append(heading);
  let content = card;
  if (collapsible) {
    const details = element(doc, "details", "tsukuyomi-ticket-disclosure");
    if (ticket.id) details.dataset.ticketId = ticket.id;
    details.open = open;
    const controls = element(doc, "span", "tsukuyomi-ticket-summary-end");
    const chevron = element(doc, "span", "tsukuyomi-ticket-chevron");
    chevron.setAttribute("aria-hidden", "true");
    controls.append(badge, chevron);
    header.append(controls);
    card.classList.add("tsukuyomi-ticket--played");
    card.append(details);
    content = details;
    card.addEventListener("click", ({ target }) => {
      // Both native disclosures handle their own clicks and keyboard events.
      if (details.contains(target) || reasoning?.contains(target)) return;
      const selection = doc.getSelection();
      if (selection?.toString() && card.contains(selection.anchorNode)) return;
      details.open = !details.open;
    });
  } else {
    header.append(badge);
  }

  const legList = element(doc, "ol", "tsukuyomi-ticket-legs");
  legList.setAttribute("role", "list");
  legs.forEach((leg, index) => legList.append(renderLeg(doc, leg, index, ticket, played, settled)));
  if (!legs.length) legList.append(element(doc, "li", "tsukuyomi-ticket-meta", "Sélections non renseignées"));

  const estimate = ticketProbability(ticket) ?? recalculatedTicketProbability(ticket);
  content.append(header, legList);
  if (!canonical || estimate !== null) {
    const probability = element(doc, "p", "tsukuyomi-ticket-probability", "Probabilité du ticket · ");
    const amount = element(doc, "strong", "", formatTicketProbability(estimate) || "—");
    const exact = canonical && formatExactProbability(estimate);
    if (exact && exact !== amount.textContent) {
      amount.title = exact;
      amount.setAttribute("aria-label", exact);
    }
    probability.append(amount);
    content.append(probability);
  }

  const metrics = element(doc, "dl", "tsukuyomi-ticket-odds");
  const odds = Number.isFinite(ticket.odds) ? decimal.format(ticket.odds) : "—";
  const exactOdds = canonical && Number.isFinite(ticket.odds) ? formatExactDecimal(ticket.odds) : null;
  metrics.append(metric(doc, "Cote totale", odds, null, exactOdds));
  const payoutOdds = ticket.settlement?.payout_odds;
  if (outcome === "won" && Number.isFinite(payoutOdds) && payoutOdds >= 1 && decimal.format(payoutOdds) !== odds) {
    metrics.append(metric(doc, "Cote réglée", decimal.format(payoutOdds)));
  }
  const stake = ticketStake(ticket);
  metrics.append(metric(doc, "Mise de référence", formatChf(stake)));
  if (showImportedStake && canonical && !isPublished(ticket) && !ticket.withdrawn_at && !settled
      && Number.isFinite(ticket.stake_chf) && ticket.stake_chf > 0 && ticket.stake_chf !== stake) {
    metrics.append(metric(doc, "Mise transmise", formatChf(ticket.stake_chf)));
  }
  const net = netAmount(ticket);
  if (Number.isFinite(net)) metrics.append(metric(doc, net < 0 ? "Perte nette" : "Gain net", formatChf(net, true), outcome));
  card.append(metrics);
  if (reasoning) {
    if (ticket.id) reasoning.dataset.ticketId = ticket.id;
    reasoning.open = reasoningOpen;
    reasoning.append(element(doc, "summary", "tsukuyomi-ticket-reasoning-toggle", "Raisonnement"),
      element(doc, "p", "tsukuyomi-ticket-reasoning-text", reasoningText));
    card.append(reasoning);
  }
  return card;
}

function isPublished(ticket) {
  return typeof ticket?.published_at === "string" && Number.isFinite(Date.parse(ticket.published_at));
}

function isAwaitingResult(ticket, now) {
  return isCanonicalTicket(ticket) && isPublished(ticket) && !confirmedOutcome(ticket)
    && Array.isArray(ticket.legs) && ticket.legs.some((leg) => Date.parse(leg?.starts_at) <= now);
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

export function ticketsForView(tickets, { view = "upcoming", now = Date.now(), includePending = false } = {}) {
  const played = view === "played";
  const ordered = tickets.filter((ticket) => {
    if (isCanonicalTicket(ticket)) {
      if (played) {
        return (Boolean(confirmedOutcome(ticket)) && (Boolean(ticket.placed_at) || isPublished(ticket)))
          || (includePending && isAwaitingResult(ticket, now));
      }
      if (!isPublished(ticket)) return false;
      return view === "latest" || (!confirmedOutcome(ticket) && Number.isFinite(upcomingTicketKickoff(ticket, now)));
    }
    if (played && ticket.placed_at) return ticket.id !== hiddenPlayedTicketId;
    if (!isPublished(ticket)) return false;
    if (view === "latest") return true;
    const upcoming = !ticket.settlement && Number.isFinite(upcomingTicketKickoff(ticket, now));
    return played ? !upcoming : upcoming;
  }).sort((a, b) => Date.parse(ticketDate(b)) - Date.parse(ticketDate(a)));
  if (played) {
    const [first, second] = playedTicketSwap.map((id) => ordered.findIndex((ticket) => ticket.id === id));
    if (first !== -1 && second !== -1) [ordered[first], ordered[second]] = [ordered[second], ordered[first]];
  }
  return ordered;
}

export function recentPlayedTicketIds(tickets, options) {
  return new Set(ticketsForView(tickets, { ...options, view: "played" }).slice(0, 2).map((ticket) => ticket.id));
}

function renderFeed(mount, {
  tickets = [], status, onRetry, filtered, now = Date.now(), includePending = false, showReasoning = false,
}, { view, onViewAll }) {
  const doc = mount.ownerDocument;
  const feed = element(doc, "div", onViewAll ? "tsukuyomi-tickets-latest" : "tsukuyomi-tickets-page");
  const played = view === "played";
  feed.dataset.ticketView = view;
  const sameView = mount.firstElementChild?.dataset.ticketView === view;
  const disclosureStates = (className) => new Map(sameView ? Array.from(
    mount.querySelectorAll(`.${className}[data-ticket-id]`),
    (details) => [details.dataset.ticketId, details.open],
  ) : []);
  const openTickets = disclosureStates("tsukuyomi-ticket-disclosure");
  const openReasoning = disclosureStates("tsukuyomi-ticket-reasoning");
  const active = doc.activeElement;
  const focusSelector = active?.matches(".tsukuyomi-ticket-reasoning-toggle")
    ? ".tsukuyomi-ticket-reasoning-toggle" : ".tsukuyomi-ticket-disclosure > summary";
  const focusedTicket = sameView && mount.contains(active) && active.matches(focusSelector)
    ? active.parentElement.dataset.ticketId
    : null;
  let nextFocus;
  const rows = status === "ready" ? ticketsForView(tickets, { view, now, includePending }) : [];
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
    const shown = onViewAll ? rows.slice(0, 4) : rows;
    const pending = played && includePending ? shown.filter((ticket) => isAwaitingResult(ticket, now)) : [];
    const groups = pending.length ? [
      ["En attente de résultat", pending],
      ["Historique", shown.filter((ticket) => !isAwaitingResult(ticket, now))],
    ] : [[null, shown]];
    for (const [title, group] of groups) {
      if (!group.length) continue;
      if (title) feed.append(element(doc, "h3", "tsukuyomi-tickets-group-title", title));
      const list = element(doc, "ul", "tsukuyomi-ticket-list");
      for (const ticket of group) {
        const item = element(doc, "li", "tsukuyomi-ticket-item");
        item.append(createTicketCard(doc, ticket, played, openTickets.get(ticket.id) ?? !played, {
          now,
          showReasoning: typeof showReasoning === "function" ? showReasoning(ticket) : showReasoning,
          reasoningOpen: openReasoning.get(ticket.id),
        }));
        if (focusedTicket && focusedTicket === ticket.id) nextFocus = item.querySelector(focusSelector);
        list.append(item);
      }
      feed.append(list);
    }
  }
  if (onViewAll) {
    const button = element(doc, "button", "tsukuyomi-tickets-button tsukuyomi-tickets-view-all", "Voir tous les pronostics");
    button.type = "button";
    button.addEventListener("click", onViewAll);
    feed.append(button);
  }
  mount.replaceChildren(feed);
  nextFocus?.focus({ preventScroll: true });
}

export function renderTickets(mount, data) {
  renderFeed(mount, data, { view: "upcoming" });
}

export function renderPlayedTickets(mount, data) {
  renderFeed(mount, data, { view: "played" });
}

export function renderFeaturedTicket(mount, ticket) {
  mount.replaceChildren(createTicketCard(mount.ownerDocument, ticket, true, true));
}

export function renderPublicationTicket(mount, ticket, { showReasoning = false } = {}) {
  mount.replaceChildren(createTicketCard(mount.ownerDocument, ticket, false, true, { showImportedStake: true, showReasoning }));
}

export function renderLatestTickets(mount, { tickets, status, onRetry, onViewAll, showReasoning }) {
  renderFeed(mount, { tickets, status, onRetry, showReasoning }, { view: "latest", onViewAll });
}
