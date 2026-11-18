import { ticketDate } from "./ledgerAccounting.js?rev=chf-charts";

const kinds = new Map([["simple", "Simples"], ["combine", "Combinés"], ["triple", "Triplés"]]);
const outcomes = new Map([["won", "Gagnés"], ["lost", "Perdus"], ["void", "Remboursés"], ["pending", "En attente"]]);
const fields = [
  { name: "sport", label: "Sport", any: "Tous les sports" },
  { name: "kind", label: "Format", any: "Tous les formats" },
  { name: "date", label: "Date du ticket", any: "Toutes les dates" },
  { name: "outcome", label: "Résultat", any: "Tous les résultats" },
];
const sportOf = (ticket) => typeof ticket.sport === "string" ? ticket.sport.trim().toLocaleLowerCase("fr") : "";
const outcomeOf = (ticket) => ticket.settlement?.outcome || "pending";
const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Zurich" });
const dateLabel = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function dayOf(ticket) {
  const timestamp = Date.parse(ticketDate(ticket));
  if (!Number.isFinite(timestamp)) return "";
  const parts = Object.fromEntries(dayFormat.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join("-");
}
const valueFor = {
  sport: sportOf,
  kind: (ticket) => ticket.kind,
  date: dayOf,
  outcome: outcomeOf,
};

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function optionsFor(name, rows) {
  if (name === "kind") return [...kinds].filter(([value]) => rows.some((ticket) => ticket.kind === value));
  if (name === "outcome") return [...outcomes];
  if (name === "date") {
    return [...new Set(rows.map(dayOf).filter(Boolean))].sort().reverse()
      .map((day) => [day, dateLabel.format(Date.parse(day))]);
  }
  const sports = [...new Set(rows.map(sportOf).filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr"));
  return sports.map((value) => [value, value[0].toLocaleUpperCase("fr") + value.slice(1)]);
}

export function createTicketFilters(doc, onChange) {
  const section = element(doc, "section", "tsukuyomi-ticket-filters");
  section.setAttribute("aria-label", "Filtres des pronostics");
  const toggle = element(doc, "button", "tsukuyomi-ticket-filter-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "tsukuyomi-ticket-filter-options");
  const toggleText = element(doc, "span", "", "Filtres");
  const arrow = element(doc, "span", "tsukuyomi-ticket-filter-chevron");
  arrow.setAttribute("aria-hidden", "true");
  toggle.append(toggleText, arrow);
  const panel = element(doc, "div", "tsukuyomi-ticket-filter-panel");
  panel.id = "tsukuyomi-ticket-filter-options";
  panel.hidden = true;
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
  section.append(toggle, panel);
  const row = element(doc, "div", "tsukuyomi-ticket-filter-fields");
  panel.append(row);
  const reset = element(doc, "button", "tsukuyomi-ticket-filter-reset", "Réinitialiser");
  reset.type = "button";
  panel.append(reset);

  let view = "upcoming";
  const preferences = { upcoming: {}, played: {} };
  const controls = fields.map(({ name, label, any }) => {
    const wrap = element(doc, "label", "tsukuyomi-ticket-filter-field");
    const select = doc.createElement("select");
    select.name = name;
    wrap.append(element(doc, "span", "", label), select);
    row.append(wrap);
    select.addEventListener("change", () => {
      if (select.value) {
        preferences[view][name] = { value: select.value, text: select.selectedOptions[0].textContent };
      } else {
        delete preferences[view][name];
      }
      updateToggle();
      onChange();
    });
    return { wrap, select, name, any };
  });

  function updateToggle() {
    const count = Object.keys(preferences[view]).length;
    toggleText.textContent = count ? "Filtres (" + count + ")" : "Filtres";
    reset.disabled = count === 0;
  }

  function refresh(nextView, eligible, status) {
    view = nextView;
    section.hidden = status !== "ready";
    for (const { wrap, select, name, any } of controls) {
      wrap.hidden = name === "outcome" && view !== "played";
      const chosen = preferences[view][name];
      const entries = optionsFor(name, eligible);
      if (chosen && !entries.some(([value]) => value === chosen.value)) entries.push([chosen.value, chosen.text]);
      select.replaceChildren(...[["", any], ...entries].map(([value, label]) => {
        const option = doc.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      select.value = chosen?.value || "";
    }
    updateToggle();
  }

  reset.addEventListener("click", () => {
    preferences[view] = {};
    for (const { select } of controls) select.value = "";
    updateToggle();
    onChange();
  });

  function apply(tickets) {
    const filters = Object.entries(preferences[view]);
    return filters.length
      ? tickets.filter((ticket) => filters.every(([name, option]) => valueFor[name](ticket) === option.value))
      : tickets;
  }
  return { element: section, refresh, apply, isActive: () => Object.keys(preferences[view]).length > 0 };
}
