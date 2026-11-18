import { formatChf, referenceStake, summarize, ticketDate } from "./ledgerAccounting.js?rev=chf-charts";
import { clearLedgerCharts, renderLedgerCharts } from "./ledgerCharts.js?rev=ticket-review";

const rate = new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 });
const period = new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric", timeZone: "Europe/Zurich" });

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const metrics = [
    ["Bilan net", formatChf(totals.net, true)],
    ["ROI", totals.roi == null ? "—" : rate.format(totals.roi)],
    ["Tickets gagnés", totals.won + " / " + (totals.won + totals.lost)],
    ["Taux de réussite", totals.winRate == null ? "—" : rate.format(totals.winRate)],
    ["Mises réglées", formatChf(referenceStake * (totals.won + totals.lost))],
    ["Tickets en attente", String(totals.pending)],
  ];
  const grid = element(doc, "dl", "tsukuyomi-ledger-metrics");
  for (const [label, value] of metrics) {
    const card = element(doc, "div", "");
    card.append(element(doc, "dt", "", label), element(doc, "dd", "", value));
    grid.append(card);
  }
  contents.push(grid, element(doc, "p", "tsukuyomi-ledger-note",
    `Historique Tsukuyomi et tickets publiés. Mise de référence de ${formatChf(referenceStake)} par ticket. Le ROI et le taux de réussite portent sur les tickets gagnés ou perdus.`));
  section.replaceChildren(...contents);
  if (detail) {
    renderLedgerCharts(section, tickets, totals);
    addBreakdown(section, tickets);
  }
}
