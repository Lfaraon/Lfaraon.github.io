const percentage = new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 });
const kindNames = { simple: "Simples", combine: "Combinés", triple: "Triplés" };

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chart(container, title, rows, empty) {
  const document = container.ownerDocument;
  const panel = element(document, "section", "tsukuyomi-chart");
  panel.setAttribute("aria-label", title);
  panel.append(element(document, "h3", "tsukuyomi-chart-title", title));

  if (!rows.length) {
    panel.append(element(document, "p", "tsukuyomi-chart-note", empty));
    container.append(panel);
    return;
  }

  const bars = element(document, "ul", "tsukuyomi-chart-bars");
  for (const { label, value, rate, detail, outcome } of rows) {
    const row = element(document, "li", "tsukuyomi-chart-bar");
    const heading = element(document, "div", "tsukuyomi-chart-bar-label");
    heading.append(element(document, "span", "", label), element(document, "strong", "", value));
    row.append(heading);
    if (Number.isFinite(rate)) {
      const track = element(document, "div", "tsukuyomi-chart-bar-track");
      track.setAttribute("aria-hidden", "true");
      const fill = element(document, "span", "tsukuyomi-chart-bar-fill");
      fill.style.setProperty("--bar", `${rate * 100}%`);
      if (outcome) fill.dataset.outcome = outcome;
      track.append(fill);
      row.append(track);
    }
    if (detail) row.append(element(document, "p", "tsukuyomi-chart-bar-detail", detail));
    bars.append(row);
  }
  panel.append(bars);
  container.append(panel);
}

function successRow(label, { won, lost, winRate }) {
  const evaluated = won + lost;
  return {
    label,
    value: evaluated ? percentage.format(winRate) : "—",
    rate: evaluated ? winRate : null,
    detail: evaluated ? `${won} sur ${evaluated} gagnés` : "Résultats en attente",
  };
}

export function renderBreakdownCharts(container, { byKind, bySport }, totals) {
  const empty = "Les taux s’afficheront après le règlement des tickets.";
  chart(container, "Réussite par format", byKind.map((row) => successRow(kindNames[row.kind] || "Autres", row)), empty);
  chart(container, "Réussite des tickets par sport", bySport.map((row) => successRow(row.sport || "Non renseigné", row)), empty);

  const outcomes = [["Gagnés", "won"], ["Perdus", "lost"], ["Remboursés", "void"], ["En attente", "pending"]];
  const total = outcomes.reduce((sum, [, outcome]) => sum + totals[outcome], 0);
  const results = total ? outcomes.map(([label, outcome]) => ({
    label,
    value: String(totals[outcome]),
    rate: totals[outcome] / total,
    outcome,
  })) : [];
  chart(container, "Résultats des tickets", results, "Le bilan s’affichera après la publication de tickets.");
}
