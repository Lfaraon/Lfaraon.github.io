import { ticketDate } from "./ledgerAccounting.js?rev=chf-charts";

const kinds = new Map([["simple", "Simples"], ["combine", "Combinés"], ["triple", "Triplés"]]);
const outcomes = new Map([["won", "Gagnés"], ["lost", "Perdus"], ["void", "Remboursés"], ["pending", "En attente"]]);
const dates = [["", "Toutes les dates"], ["yesterday", "Hier"], ["today", "Aujourd’hui"], ["tomorrow", "Demain"]];
const dateOffsets = { yesterday: -1, today: 0, tomorrow: 1 };
const sportOf = (ticket) => typeof ticket.sport === "string" ? ticket.sport.trim().toLocaleLowerCase("fr") : "";
const outcomeOf = (ticket) => ticket.settlement?.outcome || "pending";
const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Zurich" });
const dateLabel = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const focusClasses = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const pressedClasses = "border-primary bg-primary text-primaryForeground";
const unpressedClasses = "border-border bg-background text-foreground hover:bg-surfaceAlt";
export const filterGlyph = "M3 5h14M6 10h8M8 15h4";
export const filterChevron = "M3 6l5 5 5-5";

function swissDay(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const parts = Object.fromEntries(dayFormat.formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join("-");
}

function selectedDay(date) {
  const offset = dateOffsets[date];
  if (offset === undefined) return date;
  const today = Date.parse(swissDay(Date.now()));
  return new Date(today + offset * 86_400_000).toISOString().slice(0, 10);
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc, classes, text) {
  const node = element(doc, "button", classes, text);
  node.type = "button";
  return node;
}

function icon(doc, className, viewBox, line, strokeWidth) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(namespace, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(namespace, "path");
  path.setAttribute("d", line);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", strokeWidth);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function createMenu(doc, { name, label, all, onChange, openMenu }) {
  const wrap = element(doc, "div", "tsukuyomi-ticket-filter-menu relative w-full md:w-fit");
  const trigger = button(doc, "inline-flex min-h-[58px] w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-surfaceAlt md:min-h-0 md:w-auto md:rounded-none md:bg-surface md:py-1.5 " + focusClasses);
  trigger.dataset.ticketFilter = name;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const mobile = element(doc, "span", "tsukuyomi-ticket-filter-value min-w-0 flex-1 text-left md:hidden");
  const mobileValue = element(doc, "span", "mt-0.5 block truncate text-sm font-semibold text-foreground");
  mobile.append(element(doc, "span", "block truncate text-[11px] font-medium uppercase tracking-wide text-foregroundMuted", label), mobileValue);
  const desktop = element(doc, "span", "tsukuyomi-ticket-filter-desktop-value hidden min-w-0 break-words text-left md:block md:whitespace-nowrap");
  trigger.append(mobile, desktop, icon(doc, "h-4 w-4 shrink-0 text-foregroundMuted", "0 0 16 16", "M4 6l4 4 4-4", "1.5"));
  const list = element(doc, "ul", "absolute z-50 mt-1 max-h-64 min-w-full overflow-auto border border-border bg-surfaceAlt py-1");
  list.id = "tsukuyomi-ticket-filter-" + name;
  list.hidden = true;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  trigger.setAttribute("aria-controls", list.id);
  wrap.append(trigger, list);

  let entries = [];
  let selection = "";
  let active = -1;
  const optionClass = "flex min-h-[44px] cursor-pointer items-center justify-between gap-2 whitespace-normal px-3 py-1.5 text-sm md:min-h-0 md:whitespace-nowrap ";

  function activate(index, scroll = false) {
    if (active >= 0 && list.children[active]) list.children[active].className = optionClass + "text-foreground";
    active = Math.max(0, Math.min(index, entries.length - 1));
    const option = list.children[active];
    if (!option) return;
    option.className = optionClass + "bg-primary text-primaryForeground";
    if (!list.hidden) trigger.setAttribute("aria-activedescendant", option.id);
    if (scroll) option.scrollIntoView?.({ block: "nearest" });
  }

  function close() {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
  }

  function open() {
    openMenu(menu);
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    activate(entries.findIndex(([value]) => value === selection));
  }

  function choose(index) {
    if (!entries[index]) return;
    close();
    onChange(entries[index][0]);
  }

  trigger.addEventListener("click", () => list.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key === "Tab" || key === "Escape") {
      if (key === "Escape" && !list.hidden) event.preventDefault();
      close();
      return;
    }
    const select = key === "Enter" || key === " ";
    if (!select && !["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return;
    event.preventDefault();
    if (list.hidden) open();
    else if (select) choose(active);
    else {
      const index = key === "Home" ? 0 : key === "End" ? entries.length - 1 : active + (key === "ArrowDown" ? 1 : -1);
      activate(index, true);
    }
  });

  function update(options, value) {
    const activeValue = entries[active]?.[0];
    entries = [["", all], ...options];
    selection = value;
    const labelText = entries.find(([option]) => option === value)?.[1] || all;
    mobileValue.textContent = labelText;
    desktop.textContent = labelText;
    trigger.setAttribute("aria-label", label + " : " + labelText);
    list.replaceChildren(...entries.map(([entry, text], index) => {
      const option = element(doc, "li", optionClass + "text-foreground", text);
      option.id = list.id + "-" + index;
      option.dataset.value = entry;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(entry === selection));
      if (entry === selection) option.append(icon(doc, "h-4 w-4 shrink-0", "0 0 16 16", "M3.5 8.5l3 3 6-6.5", "1.5"));
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("pointermove", () => activate(index));
      option.addEventListener("click", () => choose(index));
      return option;
    }));
    active = -1;
    if (!list.hidden) activate(entries.findIndex(([entry]) => entry === activeValue));
  }

  const menu = { wrap, close, update };
  return menu;
}

function createPills(doc, label, gridClasses) {
  const fieldset = doc.createElement("fieldset");
  fieldset.append(element(doc, "legend", "mb-2 text-xs font-semibold uppercase tracking-wide text-foregroundMuted", label));
  const grid = element(doc, "div", "tsukuyomi-ticket-filter-choices " + gridClasses);
  fieldset.append(grid);
  return { fieldset, grid };
}

export function createTicketFilters(doc, onChange, { includePending = true } = {}) {
  const section = element(doc, "section", "tsukuyomi-ticket-filters");
  section.setAttribute("aria-label", "Filtres des pronostics");
  const toggle = button(doc, "flex min-h-[48px] w-full items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium md:min-h-[44px] " + focusClasses);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "tsukuyomi-ticket-filter-options");
  const toggleContent = element(doc, "span", "tsukuyomi-ticket-filter-label flex items-center gap-2");
  const badge = element(doc, "span", "tsukuyomi-ticket-filter-count rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primaryForeground");
  toggleContent.append(icon(doc, "h-4 w-4 text-primary", "0 0 20 20", filterGlyph, "1.7"), doc.createTextNode("Filtres"), badge);
  const toggleArrow = icon(doc, "h-4 w-4 shrink-0 text-foregroundMuted transition-transform", "0 0 16 16", filterChevron, "1.5");
  toggle.append(toggleContent, toggleArrow);
  const panel = element(doc, "div", "mt-3 space-y-3 rounded-xl border border-border bg-surface p-3");
  panel.id = "tsukuyomi-ticket-filter-options";
  panel.hidden = true;
  section.append(toggle, panel);

  const initial = () => ({ sport: "", kind: "", date: "", outcomes: new Set() });
  const preferences = { upcoming: initial(), played: initial() };
  let view = "upcoming";
  let eligible = [];
  let activeMenu;
  function closeMenu() {
    activeMenu?.close();
    activeMenu = undefined;
  }
  function openMenu(menu) {
    closeMenu();
    activeMenu = menu;
  }
  function closeOutsideMenu(event) {
    if (activeMenu && !activeMenu.wrap.contains(event.target)) closeMenu();
  }
  doc.addEventListener("pointerdown", closeOutsideMenu);
  doc.addEventListener("focusin", closeOutsideMenu);

  function setFilter(name, value) {
    preferences[view][name] = value;
    updatePanel();
    onChange();
  }

  const fields = element(doc, "div", "tsukuyomi-ticket-filter-fields grid grid-cols-2 gap-2");
  const sportMenu = createMenu(doc, { name: "sport", label: "Sport", all: "Tous les sports", openMenu, onChange: (value) => setFilter("sport", value) });
  const kindMenu = createMenu(doc, { name: "kind", label: "Format", all: "Tous les formats", openMenu, onChange: (value) => setFilter("kind", value) });
  fields.append(sportMenu.wrap, kindMenu.wrap);

  const dateField = createPills(doc, "Date du ticket", "grid grid-cols-2 gap-2 sm:grid-cols-4");
  const dateButtons = dates.map(([key, label]) => {
    const node = button(doc, "", label);
    node.dataset.ticketDate = key;
    node.addEventListener("click", () => setFilter("date", key));
    dateField.grid.append(node);
    return [key, node];
  });
  const dateMenu = createMenu(doc, { name: "date", label: "Date précise", all: "Choisir une date", openMenu, onChange: (value) => setFilter("date", value) });
  dateMenu.wrap.classList.add("mt-2");
  dateField.fieldset.append(dateMenu.wrap);

  const resultField = createPills(doc, "Résultat du ticket", "grid grid-cols-2 gap-2 sm:grid-cols-3");
  const resultButtons = [...outcomes].filter(([key]) => includePending || key !== "pending").map(([key, label]) => {
    const counter = element(doc, "span", "shrink-0 tabular-nums opacity-80");
    const node = button(doc, "");
    node.dataset.ticketOutcome = key;
    node.setAttribute("aria-label", label);
    node.append(element(doc, "span", "min-w-0 break-words", label), counter);
    node.addEventListener("click", () => {
      const selected = preferences[view].outcomes;
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      updatePanel();
      onChange();
    });
    resultField.grid.append(node);
    return [key, node, counter];
  });
  const reset = button(doc, "min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary " + focusClasses, "Réinitialiser les filtres");
  reset.dataset.ticketFilterReset = "";
  reset.addEventListener("click", () => {
    preferences[view] = initial();
    updatePanel();
    onChange();
  });
  panel.append(fields, dateField.fieldset, resultField.fieldset, reset);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggleArrow.classList.toggle("rotate-180", !panel.hidden);
    if (panel.hidden) closeMenu();
  });

  function matches(ticket, state, day) {
    return (!state.sport || sportOf(ticket) === state.sport)
      && (!state.kind || ticket.kind === state.kind)
      && (!day || swissDay(Date.parse(ticketDate(ticket))) === day);
  }

  function updatePanel() {
    const state = preferences[view];
    const active = Number(Boolean(state.sport)) + Number(Boolean(state.kind)) + Number(Boolean(state.date)) + Number(state.outcomes.size > 0);
    badge.textContent = String(active);
    badge.hidden = !active;
    reset.hidden = !active;
    resultField.fieldset.hidden = view !== "played";

    const sports = [...new Set(eligible.map(sportOf).filter(Boolean))];
    if (state.sport && !sports.includes(state.sport)) sports.push(state.sport);
    sports.sort((left, right) => left.localeCompare(right, "fr"));
    sportMenu.update(sports.map((key) => [key, key[0].toLocaleUpperCase("fr") + key.slice(1)]), state.sport);
    kindMenu.update([...kinds].filter(([key]) => key === state.kind || eligible.some((ticket) => ticket.kind === key)), state.kind);

    const exact = state.date && !Object.hasOwn(dateOffsets, state.date) ? state.date : "";
    const calendarDays = new Set(eligible.map((ticket) => swissDay(Date.parse(ticketDate(ticket)))).filter(Boolean));
    if (exact) calendarDays.add(exact);
    dateMenu.update([...calendarDays].sort().reverse().map((key) => [key, dateLabel.format(Date.parse(key))]), exact);
    for (const [key, node] of dateButtons) {
      const pressed = state.date === key;
      node.setAttribute("aria-pressed", String(pressed));
      node.className = "min-h-[44px] min-w-0 rounded-lg border px-2 py-2 text-center text-xs font-medium leading-tight transition-colors " + focusClasses + " " + (pressed ? pressedClasses : unpressedClasses);
    }

    const day = selectedDay(state.date);
    const matching = eligible.filter((ticket) => matches(ticket, state, day));
    for (const [key, node, counter] of resultButtons) {
      const pressed = state.outcomes.has(key);
      node.setAttribute("aria-pressed", String(pressed));
      node.className = "flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium leading-tight transition-colors " + focusClasses + " " + (pressed ? pressedClasses : unpressedClasses);
      counter.textContent = String(matching.filter((ticket) => outcomeOf(ticket) === key).length);
    }
  }

  function isActive() {
    const state = preferences[view];
    return Boolean(state.sport || state.kind || state.date || state.outcomes.size);
  }

  function refresh(nextView, tickets, status) {
    if (view !== nextView || status !== "ready") closeMenu();
    view = nextView;
    eligible = tickets;
    section.hidden = status !== "ready";
    updatePanel();
  }

  function apply(tickets) {
    if (!isActive()) return tickets;
    const state = preferences[view];
    const day = selectedDay(state.date);
    return tickets.filter((ticket) => matches(ticket, state, day)
      && (!state.outcomes.size || state.outcomes.has(outcomeOf(ticket))));
  }

  function destroy() {
    doc.removeEventListener("pointerdown", closeOutsideMenu);
    doc.removeEventListener("focusin", closeOutsideMenu);
    section.remove();
  }

  return { element: section, refresh, apply, isActive, destroy };
}
