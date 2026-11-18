import { formatChf, netAmount, outcomeLabel, referenceStake, summarize, ticketDate } from "./ledgerAccounting.js?rev=chf-charts";
import { clearLedgerCharts, renderLedgerCharts } from "./ledgerCharts.js?rev=stats-auto";

const rate = new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 });
const period = new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric", timeZone: "Europe/Zurich" });
const formatLabels = new Map([["simple", "Simples"], ["combine", "Combinés"], ["triple", "Triplés"]]);

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ledgerMetrics(tickets, totals) {
  const { won, lost, pending, net, roi, winRate } = totals;
  const counted = won + lost;
  const losingStakes = lost * referenceStake;
  const stakeRow = ["Mises réglées", formatChf(counted * referenceStake)];
  const byFormat = new Map();
  let noResults = 0;
  let partialResults = 0;
  let allResults = 0;
  for (const ticket of tickets) {
    if (!Number.isFinite(netAmount(ticket))) {
      const legs = ticket.legs ?? [];
      const verified = legs.filter((leg) => Object.hasOwn(outcomeLabel, leg?.outcome)).length;
      if (!verified) noResults += 1;
      else if (verified < legs.length) partialResults += 1;
      else allResults += 1;
      continue;
    }
    const outcome = ticket.settlement.outcome;
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
  pendingRows.push(["Mises en attente", formatChf(pending * referenceStake)]);

  const roiRows = [["Bilan net", formatChf(net, true)], stakeRow];
  if (roi != null) roiRows.push([`Pour ${referenceStake} CHF misés`, formatChf(roi * referenceStake, true)]);

  return [
    ["net", "Bilan net", formatChf(net, true), [
      ["Gains nets des tickets gagnés", formatChf(net + losingStakes, true)],
      ["Mises perdues", formatChf(-losingStakes, true)],
    ]],
    ["roi", "ROI", roi == null ? "—" : rate.format(roi), roiRows],
    ["won", "Tickets gagnés", won + " / " + counted, winRows],
    ["win-rate", "Taux de réussite", winRate == null ? "—" : rate.format(winRate), [
      ["Tickets gagnés", won], ["Tickets gagnés ou perdus", counted],
    ]],
    ["stake", "Mises réglées", stakeRow[1], [
      ["Mise par ticket", formatChf(referenceStake)],
      ["Sur les tickets gagnés", formatChf(won * referenceStake)],
      ["Sur les tickets perdus", formatChf(losingStakes)],
    ]],
    ["pending", "Tickets en attente", pending, pendingRows],
  ];
}

function addMetrics(section, tickets, totals) {
  const doc = section.ownerDocument;
  const openMetrics = new Set(Array.from(section.querySelectorAll(".tsukuyomi-ledger-details[open]"),
    (details) => details.dataset.metric));
  const active = doc.activeElement;
  const focusedMetric = section.contains(active) && active.matches(".tsukuyomi-ledger-detail-toggle")
    ? active.parentElement.dataset.metric : null;
  let nextFocus;
  const grid = element(doc, "dl", "tsukuyomi-ledger-metrics");
  for (const [id, label, value, rows] of ledgerMetrics(tickets, totals)) {
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

function addBreakdown(section, tickets) {
  const doc = section.ownerDocument;
  const months = new Map();
  for (const ticket of [...tickets].sort((a, b) => Date.parse(ticketDate(b)) - Date.parse(ticketDate(a)))) {
    const date = Date.parse(ticketDate(ticket));
    const month = Number.isFinite(date) ? period.format(date) : "Date inconnue";
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(ticket);
  }
  if (!months.size) return;

  const wrapper = element(doc, "div", "tsukuyomi-ledger-table-wrap");
  wrapper.tabIndex = 0;
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "Bilan par mois");
  const table = element(doc, "table", "tsukuyomi-ledger-table");
  table.append(element(doc, "caption", "", "Bilan par mois"));
  const heading = table.createTHead().insertRow();
  for (const label of ["Mois", "Gagnés", "Perdus", "Remboursés", "En attente", "Net", "ROI"]) {
    const th = element(doc, "th", "", label);
    th.scope = "col";
    heading.append(th);
  }
  const body = table.createTBody();
  for (const [month, rows] of months) {
    const row = body.insertRow();
    const label = element(doc, "th", "", month);
    label.scope = "row";
    row.append(label);
    const { won, lost, void: refunded, pending, net, roi } = summarize(rows);
    for (const value of [won, lost, refunded, pending, formatChf(net, true), roi == null ? "—" : rate.format(roi)]) {
      row.insertCell().textContent = value;
    }
  }
  wrapper.append(table);
  section.append(wrapper);
}

export function renderLedger(section, { status, tickets, onRetry }, detail = false) {
  clearLedgerCharts(section);
  const doc = section.ownerDocument;
  const contents = [element(doc, "h2", "tsukuyomi-ledger-heading", detail ? "Statistiques Tsukuyomi" : "Bilan Tsukuyomi")];
  if (status !== "ready") {
    const message = status === "error" ? "Le bilan est momentanément indisponible." : "Chargement du bilan…";
    const notice = element(doc, "p", "tsukuyomi-ticket-notice", message);
    notice.setAttribute("role", "status");
    contents.push(notice);
    if (status === "error") {
      const retry = element(doc, "button", "tsukuyomi-tickets-button tsukuyomi-tickets-retry", "Réessayer");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      contents.push(retry);
    }
    section.replaceChildren(...contents);
    return;
  }

  const totals = summarize(tickets);
  const { grid, nextFocus } = addMetrics(section, tickets, totals);
  contents.push(grid);
  section.replaceChildren(...contents);
  nextFocus?.focus({ preventScroll: true });
  if (detail) {
    renderLedgerCharts(section, tickets, totals);
    addBreakdown(section, tickets);
  }
}
