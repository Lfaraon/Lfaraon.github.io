import { formatChf } from "./ledgerAccounting.js?rev=chf-charts";
import { renderBreakdownCharts } from "./ledgerBreakdownCharts.js?rev=chf-charts";
import { buildLedgerSeries } from "./ledgerSeries.js?rev=chf-charts";

const dimensions = { width: 400, height: 174, left: 52, right: 376, top: 10, bottom: 145 };
const dateLabel = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", timeZone: "UTC" });
const axisNumber = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 });
const brierNumber = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 3 });
const daySeries = [
  { key: "dayWon", label: "Gagnés", color: "won" },
  { key: "dayLost", label: "Perdus", color: "lost" },
  { key: "dayVoid", label: "Remboursés", color: "void" },
];

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(parent, tag, attributes, label) {
  const node = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (label !== undefined) node.textContent = label;
  parent.append(node);
  return node;
}

function tickValues(values, integer) {
  const lowest = Math.min(0, ...values);
  const highest = Math.max(integer ? 1 : 0, ...values);
  const range = highest - lowest || 1;
  const base = 10 ** Math.floor(Math.log10(range / 4));
  const step = Math.max(integer ? 1 : 0, Math.ceil(range / (4 * base)) * base);
  const start = Math.floor(lowest / step) * step;
  const count = Math.ceil((highest - start) / step) || 1;
  return Array.from({ length: count + 1 }, (_, index) => start + index * step);
}

function drawLine(chart, points, value, y, zero) {
  const positions = points.map((point) => `${point.x} ${y(value(point))}`);
  if (points.length > 1) {
    const line = "M" + positions.join(" L");
    const area = line + ` L${points.at(-1).x} ${zero} L${points[0].x} ${zero} Z`;
    svgElement(chart, "path", { d: area, class: "tsukuyomi-chart-area" });
    svgElement(chart, "path", { d: line, class: "tsukuyomi-chart-line", "vector-effect": "non-scaling-stroke" });
  }
}

function drawBars(chart, points, y) {
  const box = dimensions;
  const maximumWidth = Math.min(14, (box.right - box.left) / (points.length + 1) * .68);
  for (const point of points) {
    let stacked = 0;
    for (const { key, color } of daySeries) {
      const count = point[key];
      if (!count) continue;
      const top = y(stacked + count);
      svgElement(chart, "rect", {
        x: point.x - maximumWidth / 2, y: top, width: maximumWidth, height: y(stacked) - top, "data-outcome": color,
      });
      stacked += count;
    }
  }
}

function renderTimeChart(grid, { title, points, describe, value, label = axisNumber.format, note, ticks, bars = false }) {
  const doc = grid.ownerDocument;
  const panel = element(doc, "section", "tsukuyomi-chart");
  panel.append(element(doc, "h3", "tsukuyomi-chart-title", title));
  grid.append(panel);
  if (note) panel.append(element(doc, "p", "tsukuyomi-chart-note", note));
  if (!points.length) {
    panel.append(element(doc, "p", "tsukuyomi-chart-empty", "Aucune donnée disponible pour ce graphique."));
    return;
  }

  const box = dimensions;
  const days = points.map(({ day }) => Date.parse(day));
  const calendarSpan = days.at(-1) - days[0];
  const plotStart = box.left + (bars ? 9 : 0);
  const plotEnd = box.right - (bars ? 9 : 0);
  const projected = points.map((point, index) => ({
    ...point,
    x: calendarSpan ? plotStart + (days[index] - days[0]) / calendarSpan * (plotEnd - plotStart)
      : (plotStart + plotEnd) / 2,
  }));
  const axis = ticks || tickValues(points.map(value), bars);
  const low = axis[0];
  const high = axis.at(-1);
  const y = (amount) => box.bottom - (amount - low) / (high - low) * (box.bottom - box.top);
  const chart = svgElement(panel, "svg", {
    class: "tsukuyomi-chart-plot", viewBox: `0 0 ${box.width} ${box.height}`, role: "img", "aria-label": title,
  });
  for (const tick of axis) {
    const row = y(tick);
    svgElement(chart, "line", { x1: box.left, x2: box.right, y1: row, y2: row, class: "tsukuyomi-chart-gridline" });
    svgElement(chart, "text", { x: box.left - 7, y: row + 4, "text-anchor": "end" }, label(tick));
  }
  const lastIndex = points.length - 1;
  const xTicks = new Set([0, ...(lastIndex > 2 ? [Math.floor(lastIndex / 2)] : []), lastIndex]);
  for (const index of xTicks) {
    svgElement(chart, "text", {
      x: projected[index].x, y: box.bottom + 18, "text-anchor": "middle",
    }, dateLabel.format(days[index]));
  }
  if (bars) drawBars(chart, projected, y);
  else drawLine(chart, projected, value, y, y(0));
  const marker = svgElement(chart, "line", { y1: box.top, y2: box.bottom, class: "tsukuyomi-chart-marker" });
  const dot = bars ? null : svgElement(chart, "circle", { r: 4, class: "tsukuyomi-chart-dot" });
  const readout = element(doc, "p", "tsukuyomi-chart-readout");
  readout.setAttribute("aria-live", "polite");

  const scrubber = element(doc, "input", "tsukuyomi-chart-scrubber");
  scrubber.type = "range";
  scrubber.min = 0;
  scrubber.max = lastIndex;
  scrubber.setAttribute("aria-label", "Date affichée · " + title);
  function select(index) {
    if (readout.dataset.index === String(index)) return;
    const point = projected[index];
    const text = dateLabel.format(days[index]) + " · " + describe(point);
    readout.dataset.index = String(index);
    readout.textContent = text;
    scrubber.value = index;
    scrubber.setAttribute("aria-valuetext", text);
    marker.setAttribute("x1", point.x);
    marker.setAttribute("x2", point.x);
    if (dot) {
      dot.setAttribute("cx", point.x);
      dot.setAttribute("cy", y(value(point)));
    }
  }
  select(lastIndex);

  if (bars) {
    const legend = element(doc, "ul", "tsukuyomi-chart-legend");
    for (const { label: name, color } of daySeries) {
      const item = element(doc, "li", "", name);
      item.dataset.outcome = color;
      legend.append(item);
    }
    panel.append(legend);
  }
  if (lastIndex) {
    scrubber.addEventListener("input", () => select(Number(scrubber.value)));
    chart.addEventListener("pointermove", (event) => {
      const rect = chart.getBoundingClientRect();
      if (!rect.width) return;
      const x = (event.clientX - rect.left) / rect.width * box.width;
      const closest = projected.reduce((nearest, point, index) =>
        Math.abs(point.x - x) < Math.abs(projected[nearest].x - x) ? index : nearest, 0);
      select(closest);
    });
    panel.append(scrubber);
  }
  panel.append(readout);
}

export function renderLedgerCharts(section, tickets, totals) {
  const { timeline, byKind, bySport, brier } = buildLedgerSeries(tickets);
  const grid = element(section.ownerDocument, "section", "tsukuyomi-charts");
  grid.setAttribute("aria-label", "Graphiques");
  const hasBrier = brier.reduce((count, day) => count + day.count, 0);
  grid.append(element(section.ownerDocument, "p", "tsukuyomi-chart-note tsukuyomi-charts-period",
    "Les courbes suivent les dates de publication et les dates de jeu de l’historique."));
  renderTimeChart(grid, {
    title: "Gain net cumulé (CHF)", points: timeline.filter((point) => point.roi != null),
    value: (point) => point.net, describe: (point) => formatChf(point.net, true),
  });
  renderTimeChart(grid, {
    title: "ROI cumulé", points: timeline.filter((point) => point.roi != null),
    value: (point) => point.roi * 100, label: (tick) => percentage.format(tick / 100),
    describe: (point) => percentage.format(point.roi),
  });
  renderTimeChart(grid, {
    title: "Résultats des tickets par jour", points: timeline, bars: true,
    value: (point) => point.dayWon + point.dayLost + point.dayVoid,
    describe: (point) => daySeries.map(({ key, label: name }) =>
      point[key] + " " + (point[key] === 1 ? name.slice(0, -1) : name).toLowerCase()).join(" · "),
  });
  renderTimeChart(grid, {
    title: "Score de Brier par jour", points: brier, ticks: [0, .25, .5, .75, 1],
    value: (point) => point.score, label: brierNumber.format,
    describe: (point) => `${brierNumber.format(point.score)} · ${point.count} ${point.count === 1 ? "ticket" : "tickets"}`,
    note: `Prévisions enregistrées sur ${hasBrier} des ${totals.won + totals.lost} tickets gagnés ou perdus. Un score proche de zéro indique une meilleure précision.`,
  });
  renderBreakdownCharts(grid, { byKind, bySport }, totals);
  section.append(grid);
}
