import { nextTicketKickoff, renderLatestTickets, renderTickets } from "./tickets.js?rev=played-tickets";

const tabsSelector = '[role="tablist"][aria-label="Navigation principale"] [role="tab"]';
const latestSelector = 'section[aria-label="Derniers tickets"], section[data-tsukuyomi-latest]';
const calendarSelector = 'section[aria-label="Calendrier des matchs"]';
const initialTabs = new Map([
  ["calendrier", "Accueil"],
  ["statistiques", "Statistiques"],
  ["pronostics", "Pronostics"],
  ["tickets", "Pronostics"],
]);
const states = new Set(["loading", "ready", "error"]);
const maxTimeout = 2 ** 31 - 1;

function ticketFeed() {
  const feed = document.createElement("section");
  feed.className = "tsukuyomi-ticket-feed";
  return feed;
}

function connectDashboard(nonce, destination) {
  const root = document.getElementById("root");
  const parentOrigin = new URL(window.location.href).origin;
  const page = document.createElement("main");
  page.dataset.tsukuyomiPronostics = "";
  const tickets = ticketFeed();
  const latest = ticketFeed();
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
  let lastTicketsRender;
  let lastLatestRender;
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
  const onRetry = () => port?.postMessage({ type: "tsukuyomi:retry" });
  upcomingButton.addEventListener("click", () => {
    showPlayed = false;
    syncDashboard();
  });
  playedButton.addEventListener("click", () => {
    showPlayed = true;
    syncDashboard();
  });

  function syncDashboard() {
    const originalMain = root.querySelector("main:not([data-tsukuyomi-pronostics])");
    const sourcePronostics = tabByName("Pronostics");
    const publicationTab = playedTab();
    const homeTab = tabByName("Accueil");
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
    const showUpcoming = inPronostics && !showPlayed;
    const hideNative = showUpcoming || sourcePronostics.getAttribute("aria-selected") === "true";
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
    if (showUpcoming) {
      if (originalMain.nextElementSibling !== page) originalMain.after(page);
      if (lastTicketsRender !== data) {
        renderTickets(tickets, { ...data, onRetry });
        lastTicketsRender = data;
      }
    } else {
      page.remove();
    }

    if (originalLatest) {
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
    if (root.hidden) root.hidden = false;

    if (scrollToCalendar && homeTab.getAttribute("aria-selected") === "true") {
      const calendar = originalMain.querySelector(calendarSelector);
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
      data = { status: message.status, tickets: message.tickets };
      syncDashboard();
      scheduleUpcomingRefresh();
    };
  }

  new MutationObserver(syncDashboard).observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-selected"],
  });
  syncDashboard();
  window.addEventListener("message", acceptChannel);
  window.parent.postMessage({ type: "tsukuyomi:ready", nonce }, parentOrigin);
}

const params = new URLSearchParams(window.location.hash.slice(1));
const nonce = params.get("nonce");
if (window.parent !== window && nonce) {
  connectDashboard(nonce, params.get("tab"));
}
