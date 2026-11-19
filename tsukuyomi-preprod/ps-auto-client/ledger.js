import { confirmedOutcome, formatChf, isCanonicalTicket, outcomeLabel, referenceStake, summarize, summarizeFunds, ticketStake } from "./ledgerAccounting.js?rev=reference-stake";
import { clearLedgerCharts, renderLedgerCharts } from "./ledgerCharts.js?rev=reference-stake";

const rate = new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 });
const formatLabels = new Map([["simple", "Simples"], ["combine", "Combinés"], ["triple", "Triplés"]]);

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ledgerMetrics(tickets, totals, funds) {
  const { won, lost, pending, net, roi, winRate } = totals;
  const counted = won + lost;
  const { wonStake, lostStake, pendingStake, hasNet } = funds;
  const historical = tickets.every((ticket) => !isCanonicalTicket(ticket));
  const standardStakeOnly = tickets.every((ticket) => ticketStake(ticket) === referenceStake);
  const stakeRow = ["Mises réglées", formatChf(historical || wonStake + lostStake ? wonStake + lostStake : null)];
  const netLabel = formatChf(historical || hasNet ? net : null, true);
  const byFormat = new Map();
  let noResults = 0;
  let partialResults = 0;
  let allResults = 0;
  for (const ticket of tickets) {
    const outcome = confirmedOutcome(ticket);
    if (!outcome) {
      const legs = ticket.legs ?? [];
      const verified = legs.filter((leg) => Object.hasOwn(outcomeLabel, leg?.outcome)).length;
      if (!verified) noResults += 1;
      else if (verified < legs.length) partialResults += 1;
      else allResults += 1;
      continue;
    }
    if (outcome !== "won" && outcome !== "lost") continue;
    const label = formatLabels.get(ticket.kind) ?? "Autres formats";
    if (!byFormat.has(label)) byFormat.set(label, { won: 0, counted: 0 });
    const format = byFormat.get(label);
    format.counted += 1;
    if (outcome === "won") format.won += 1;
  }
  const winRows = [...formatLabels.values(), "Autres formats"].flatMap((label) => {
    const format = byFormat.get(label);
    return format ? [[label, format.won + " / " + format.counted]] : [];
  });
  const pendingRows = [
    ["Aucun résultat confirmé", noResults],
    ["Résultats partiels", partialResults],
    ["Toutes les sélections réglées", allResults],
  ].filter(([, count]) => count > 0);
  if (historical || pendingStake) pendingRows.push(["Mises en attente", formatChf(pendingStake)]);

  const roiRows = [["Bilan net", netLabel], stakeRow];
  if (standardStakeOnly && roi != null) roiRows.push([`Pour ${referenceStake} CHF misés`, formatChf(roi * referenceStake, true)]);

  return [
    ["net", "Bilan net", netLabel, historical || hasNet ? [
      ["Gains nets des tickets gagnés", formatChf(net + lostStake, true)],
      ["Mises perdues", formatChf(-lostStake, true)],
    ] : []],
    ["roi", "ROI", roi == null ? "—" : rate.format(roi), roiRows],
    ["won", "Tickets gagnés", won + " / " + counted, winRows],
    ["win-rate", "Taux de réussite", winRate == null ? "—" : rate.format(winRate), [
      ["Tickets gagnés", won], ["Tickets gagnés ou perdus", counted],
    ]],
    ["stake", "Mises réglées", stakeRow[1], [
      ...(standardStakeOnly ? [["Mise par ticket", formatChf(referenceStake)]] : []),
      ...(historical || wonStake ? [["Sur les tickets gagnés", formatChf(wonStake)]] : []),
      ...(historical || lostStake ? [["Sur les tickets perdus", formatChf(lostStake)]] : []),
    ]],
    ["pending", "Tickets en attente", pending, pendingRows],
  ];
}

function addMetrics(section, tickets, totals, funds) {
  const doc = section.ownerDocument;
  const openMetrics = new Set(Array.from(section.querySelectorAll(".tsukuyomi-ledger-details[open]"),
    (details) => details.dataset.metric));
  const active = doc.activeElement;
  const focusedMetric = section.contains(active) && active.matches(".tsukuyomi-ledger-detail-toggle")
    ? active.parentElement.dataset.metric : null;
  let nextFocus;
  const grid = element(doc, "dl", "tsukuyomi-ledger-metrics");
  for (const [id, label, value, rows] of ledgerMetrics(tickets, totals, funds)) {
    const card = element(doc, "div", "");
    const detailValue = element(doc, "dd", "tsukuyomi-ledger-detail-value");
    const details = element(doc, "details", "tsukuyomi-ledger-details");
    details.dataset.metric = id;
    details.open = openMetrics.has(id);
    const toggle = element(doc, "summary", "tsukuyomi-ledger-detail-toggle", "Détails");
    toggle.setAttribute("aria-label", `Détails (${label})`);
    if (focusedMetric === id) nextFocus = toggle;
    const breakdown = element(doc, "dl", "tsukuyomi-ledger-detail-rows");
    for (const [name, amount] of rows) {
      const row = element(doc, "div", "");
      row.append(element(doc, "dt", "", name), element(doc, "dd", "", amount));
      breakdown.append(row);
    }
    details.append(toggle, rows.length ? breakdown : element(doc, "p", "tsukuyomi-ticket-notice", "Aucun ticket réglé."));
    detailValue.append(details);
    card.append(element(doc, "dt", "tsukuyomi-ledger-label", label),
      element(doc, "dd", "tsukuyomi-ledger-value", value), detailValue);
    grid.append(card);
  }
  return { grid, nextFocus };
}

function replaceLedgerContent(heading, ...contents) {
  while (heading.nextSibling) heading.nextSibling.remove();
  heading.after(...contents);
}

export function renderLedger(section, { status, tickets, onRetry }, detail = false) {
  clearLedgerCharts(section);
  const doc = section.ownerDocument;
  const label = detail ? "Statistiques Tsukuyomi" : "Bilan Tsukuyomi";
  let heading = section.firstElementChild;
  if (!heading?.matches("h2.tsukuyomi-ledger-heading")) {
    heading = element(doc, "h2", "tsukuyomi-ledger-heading", label);
    section.replaceChildren(heading);
  } else if (heading.textContent !== label) {
    heading.textContent = label;
  }
  if (status !== "ready") {
    const message = status === "error" ? "Le bilan est momentanément indisponible." : "Chargement du bilan…";
    const notice = element(doc, "p", "tsukuyomi-ticket-notice", message);
    notice.setAttribute("role", "status");
    const contents = [notice];
    if (status === "error") {
      const retry = element(doc, "button", "tsukuyomi-tickets-button tsukuyomi-tickets-retry", "Réessayer");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      contents.push(retry);
    }
    replaceLedgerContent(heading, ...contents);
    return;
  }

  const funds = summarizeFunds(tickets);
  const totals = summarize(tickets, funds);
  const { grid, nextFocus } = addMetrics(section, tickets, totals, funds);
  replaceLedgerContent(heading, grid);
  nextFocus?.focus({ preventScroll: true });
  if (detail) renderLedgerCharts(section, tickets, totals);
}
