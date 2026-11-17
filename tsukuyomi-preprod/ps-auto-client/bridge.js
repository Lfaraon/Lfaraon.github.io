import { renderLatestTickets, renderTickets } from "./tickets.js?rev=pronostics";

const tabsSelector = '[role="tablist"][aria-label="Navigation principale"] [role="tab"]';
const latestSelector = 'section[aria-label="Derniers tickets"], section[data-tsukuyomi-latest]';
const states = new Set(["loading", "ready", "error"]);

function ticketFeed() {
  const feed = document.createElement("section");
  feed.className = "tsukuyomi-ticket-feed";
  return feed;
}

function connectDashboard(nonce, openPronosticsInitially) {
  const root = document.getElementById("root");
  const parentOrigin = new URL(window.location.href).origin;
  const page = document.createElement("main");
  page.dataset.tsukuyomiPronostics = "";
  const tickets = ticketFeed();
  const latest = ticketFeed();
  page.append(tickets);

  let port;
  let data = { status: "loading", tickets: [] };
  let lastTicketsRender;
  let lastLatestRender;
  let shouldOpenPronostics = openPronosticsInitially;

  function tabByName(name) {
    return Array.from(root.querySelectorAll(tabsSelector)).find((tab) => tab.textContent.trim() === name);
  }

  const onViewAll = () => tabByName("Pronostics")?.click();
  const onRetry = () => port?.postMessage({ type: "tsukuyomi:retry" });

  function syncDashboard() {
    const originalMain = root.querySelector("main:not([data-tsukuyomi-pronostics])");
    const tab = tabByName("Pronostics");
    const homeTab = tabByName("Accueil");
    const originalLatest = originalMain?.querySelector(latestSelector);
    if (!originalMain || !tab || !homeTab || (homeTab.getAttribute("aria-selected") === "true" && !originalLatest)) return;

    const legacyTab = tabByName("Tickets");
    if (legacyTab) legacyTab.hidden = true;
    const legacySelected = legacyTab?.getAttribute("aria-selected") === "true";
    if (shouldOpenPronostics || legacySelected) {
      shouldOpenPronostics = false;
      tab.click();
    }

    const showPronostics = legacySelected || tab.getAttribute("aria-selected") === "true";
    root.toggleAttribute("data-tsukuyomi-editorial", showPronostics);
    originalMain.toggleAttribute("data-tsukuyomi-native-feed", showPronostics);
    if (showPronostics) {
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
  connectDashboard(nonce, ["pronostics", "tickets"].includes(params.get("tab")));
}
