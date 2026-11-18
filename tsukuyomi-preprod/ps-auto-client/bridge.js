import { nextTicketKickoff, renderLatestTickets, renderPlayedTickets, renderTickets } from "./tickets.js?rev=tsukuyomi-portfolio";
import { deduplicateTickets } from "./ticketIdentity.js?rev=tsukuyomi-portfolio";
import { renderLedger } from "./ledger.js?rev=tsukuyomi-portfolio";

const tabsSelector = '[role="tablist"][aria-label="Navigation principale"] [role="tab"]';
const latestSelector = 'section[aria-label="Derniers tickets"], section[data-tsukuyomi-latest]';
const calendarSelector = 'section[aria-label="Calendrier des matchs"]';
const nativeMetrics = 'section[aria-label="Indicateurs clés"]';
const historyUrl = new URL("./history.json?rev=tsukuyomi-portfolio", import.meta.url);
const initialTabs = new Map([
  ["calendrier", "Accueil"],
  ["statistiques", "Statistiques"],
  ["pronostics", "Pronostics"],
  ["tickets", "Pronostics"],
]);
const states = new Set(["loading", "ready", "error"]);
const maxTimeout = 2 ** 31 - 1;

function removePlatforms(section) {
  const document = section.ownerDocument;
  const filter = section.querySelector('[aria-label="Plateforme et sport"]');
  if (filter) {
    filter.firstElementChild?.setAttribute("hidden", "");
    filter.setAttribute("aria-label", "Sport");
  }
  const brands = /(?:\s*·\s*)?\b(?:PSF(?:\s*\+\s*LoRo)?|LoRo|PS[-‑]AUTO)\b/gi;
  const walker = document.createTreeWalker(section, document.defaultView.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data.replace(brands, "");
    if (text === node.data) continue;
    if (!text.trim() && /^\s*·\s*$/.test(node.parentElement.previousSibling?.textContent ?? "")) {
      node.parentElement.previousSibling.textContent = "";
    }
    node.data = text;
  }
  for (const item of section.querySelectorAll("[aria-label], [title]")) {
    for (const attribute of ["aria-label", "title"]) {
      const value = item.getAttribute(attribute);
      const cleaned = value?.replace(brands, "");
      if (value && cleaned !== value) item.setAttribute(attribute, cleaned.trim());
    }
  }
}

function ticketFeed() {
  const feed = document.createElement("section");
  feed.className = "tsukuyomi-ticket-feed";
  return feed;
}

function connectDashboard(window, nonce, destination) {
  const { document, MutationObserver } = window;
  const root = document.getElementById("root");
  const parentOrigin = new URL(window.location.href).origin;
  const page = document.createElement("main");
  page.dataset.tsukuyomiPronostics = "";
  const tickets = ticketFeed();
  const latest = ticketFeed();
  const summary = document.createElement("section");
  summary.className = "tsukuyomi-ledger";
  const statistics = document.createElement("main");
  statistics.className = "tsukuyomi-ledger";
  statistics.dataset.tsukuyomiStatistics = "";
  page.append(tickets);

  const views = document.createElement("div");
  views.className = "tsukuyomi-pronostic-views";
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", "Vue des pronostics");
  const upcomingButton = document.createElement("button");
  upcomingButton.type = "button";
  upcomingButton.textContent = "À jouer";
  const playedButton = document.createElement("button");
  playedButton.type = "button";
  playedButton.textContent = "Tickets joués";
  views.append(upcomingButton, playedButton);

  let port;
  let data = { status: "loading", tickets: [] };
  let publications = [];
  let history = { status: "loading", tickets: [] };
  let ledger = history;
  let lastTicketsRender;
  let lastLatestRender;
  let lastSummaryRender;
  let lastStatisticsRender;
  let kickoffTimer;
  let showPlayed = false;
  let pendingTab = initialTabs.get(destination);
  let scrollToCalendar = destination === "calendrier";

  function tabByName(name) {
    return Array.from(root.querySelectorAll(tabsSelector))
      .find((tab) => !tab.hasAttribute("data-tsukuyomi-played-tab") && tab.textContent.trim() === name);
  }

  function playedTab() {
    return root.querySelector("[data-tsukuyomi-played-tab]") || tabByName("Tickets");
  }

  const onViewAll = () => playedTab()?.click();
  function reindex() {
    const status = history.status === "error" || data.status === "error" ? "error"
      : history.status === "ready" && data.status === "ready" ? "ready" : "loading";
    ledger = { status, tickets: status === "ready" ? deduplicateTickets([...history.tickets, ...publications]) : [] };
  }
  async function loadHistory() {
    history = { status: "loading", tickets: [] };
    reindex();
    syncDashboard();
    try {
      const response = await window.fetch(historyUrl, { credentials: "omit", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Historique indisponible");
      const { tickets: archive } = await response.json();
      if (!Array.isArray(archive)) throw new Error("Historique incompatible");
      history = { status: "ready", tickets: archive };
    } catch {
      history = { status: "error", tickets: [] };
    }
    reindex();
    syncDashboard();
  }
  const onRetry = () => port?.postMessage({ type: "tsukuyomi:retry" });
  function retryLedger() {
    if (history.status === "error") loadHistory();
    if (data.status === "error") onRetry();
  }
  upcomingButton.addEventListener("click", () => {
    showPlayed = false;
    syncDashboard();
  });
  playedButton.addEventListener("click", () => {
    showPlayed = true;
    syncDashboard();
  });

  function syncDashboard() {
    if (!root.isConnected) return;
    const originalMain = root.querySelector("main:not([data-tsukuyomi-pronostics],[data-tsukuyomi-statistics])");
    const sourcePronostics = tabByName("Pronostics");
    const publicationTab = playedTab();
    const homeTab = tabByName("Accueil");
    const statsTab = tabByName("Statistiques");
    const navigation = homeTab?.closest("nav");
    const originalLatest = originalMain?.querySelector(latestSelector);
    if (!originalMain || !sourcePronostics || !publicationTab || !navigation
        || (homeTab.getAttribute("aria-selected") === "true" && !originalLatest)) return;

    // Reuse the source's ticket tab so selection and native history controls remain in sync.
    sourcePronostics.hidden = true;
    publicationTab.setAttribute("data-tsukuyomi-played-tab", "");
    if (publicationTab.textContent.trim() !== "Pronostics") publicationTab.textContent = "Pronostics";

    const requestedTab = pendingTab === "Pronostics" ? publicationTab : pendingTab && tabByName(pendingTab);
    if (requestedTab) {
      pendingTab = undefined;
      if (requestedTab.getAttribute("aria-selected") !== "true") requestedTab.click();
    } else if (sourcePronostics.getAttribute("aria-selected") === "true") {
      showPlayed = false;
      publicationTab.click();
    }

    const inPronostics = publicationTab.getAttribute("aria-selected") === "true";
    const inStatistics = statsTab?.getAttribute("aria-selected") === "true";
    const inHome = homeTab.getAttribute("aria-selected") === "true";
    const showUpcoming = inPronostics && !showPlayed;
    const hideNative = inPronostics || inStatistics || sourcePronostics.getAttribute("aria-selected") === "true";
    root.toggleAttribute("data-tsukuyomi-editorial", hideNative);
    originalMain.toggleAttribute("data-tsukuyomi-native-feed", hideNative);
    if (inPronostics) {
      if (navigation.nextElementSibling !== views) navigation.after(views);
      upcomingButton.setAttribute("aria-pressed", String(!showPlayed));
      playedButton.setAttribute("aria-pressed", String(showPlayed));
    } else {
      views.remove();
      showPlayed = false;
    }
    if (inPronostics) {
      if (originalMain.nextElementSibling !== page) originalMain.after(page);
      const current = showUpcoming ? data : ledger;
      if (lastTicketsRender?.current !== current || lastTicketsRender.showPlayed !== showPlayed) {
        if (showUpcoming) renderTickets(tickets, { ...data, onRetry });
        else renderPlayedTickets(tickets, { ...ledger, onRetry: retryLedger });
        lastTicketsRender = { current, showPlayed };
      }
    } else {
      page.remove();
    }

    const metrics = inHome && root.querySelector(nativeMetrics);
    if (inHome) {
      const anchor = metrics || originalMain.firstElementChild;
      if (anchor && anchor.previousElementSibling !== summary) anchor.before(summary);
      if (lastSummaryRender !== ledger) {
        renderLedger(summary, { ...ledger, onRetry: retryLedger });
        lastSummaryRender = ledger;
      }
    } else summary.remove();
    if (inStatistics) {
      if (originalMain.nextElementSibling !== statistics) originalMain.after(statistics);
      if (lastStatisticsRender !== ledger) {
        renderLedger(statistics, { ...ledger, onRetry: retryLedger }, true);
        lastStatisticsRender = ledger;
      }
    } else statistics.remove();

    if (inHome && originalLatest) {
      if (latest.parentElement !== originalLatest) originalLatest.append(latest);
      if (!originalLatest.hasAttribute("data-tsukuyomi-latest")) {
        originalLatest.setAttribute("data-tsukuyomi-latest", "");
      }
      const title = originalLatest.querySelector("h2");
      if (title && title.textContent !== "Derniers pronostics") title.textContent = "Derniers pronostics";
      if (originalLatest.getAttribute("aria-label") !== "Derniers pronostics") {
        originalLatest.setAttribute("aria-label", "Derniers pronostics");
      }
      if (lastLatestRender !== data) {
        renderLatestTickets(latest, { ...data, onViewAll, onRetry });
        lastLatestRender = data;
      }
    }

    const title = root.querySelector(".psa-app-header-title");
    if (title && title.textContent !== "Centre de commande Tsukuyomi") title.textContent = "Centre de commande Tsukuyomi";
    const calendar = inHome && originalMain.querySelector(calendarSelector);
    if (calendar) removePlatforms(calendar);
    for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) removePlatforms(dialog);
    if (root.hidden) root.hidden = false;

    if (scrollToCalendar && inHome) {
      if (calendar) {
        scrollToCalendar = false;
        window.requestAnimationFrame(() => {
          if (!calendar.isConnected) return;
          const navHeight = navigation.getBoundingClientRect().height;
          calendar.style.scrollMarginTop = `${navHeight + 12}px`;
          calendar.tabIndex = -1;
          calendar.focus({ preventScroll: true });
          calendar.scrollIntoView({ block: "start" });
        });
      }
    }
  }

  function scheduleUpcomingRefresh() {
    window.clearTimeout(kickoffTimer);
    if (data.status !== "ready") return;
    const now = Date.now();
    const kickoff = nextTicketKickoff(data.tickets, now);
    if (!Number.isFinite(kickoff)) return;
    kickoffTimer = window.setTimeout(() => {
      lastTicketsRender = undefined;
      syncDashboard();
      scheduleUpcomingRefresh();
    }, Math.min(maxTimeout, kickoff - now));
  }

  function acceptChannel(event) {
    if (event.source !== window.parent || event.origin !== parentOrigin ||
        event.data?.type !== "tsukuyomi:connect" || event.data.nonce !== nonce || !event.ports?.[0]) return;

    window.removeEventListener("message", acceptChannel);
    port = event.ports[0];
    port.onmessage = ({ data: message }) => {
      if (message?.type !== "tsukuyomi:tickets" || !states.has(message.status) || !Array.isArray(message.tickets)) return;
      publications = message.tickets.filter((ticket) => Number.isFinite(Date.parse(ticket.published_at)));
      data = { status: message.status, tickets: deduplicateTickets(publications) };
      reindex();
      syncDashboard();
      scheduleUpcomingRefresh();
    };
  }

  new MutationObserver(syncDashboard).observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-selected"],
  });
  loadHistory();
  window.addEventListener("message", acceptChannel);
  window.parent.postMessage({ type: "tsukuyomi:ready", nonce }, parentOrigin);
}

const params = new URLSearchParams(window.location.hash.slice(1));
const nonce = params.get("nonce");
if (window.parent !== window && nonce) {
  connectDashboard(window, nonce, params.get("tab"));
}
