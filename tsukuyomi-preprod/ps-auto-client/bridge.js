import { renderLatestTickets, renderTickets } from "./tickets.js";

const tabsSelector = '[role="tablist"][aria-label="Navigation principale"] [role="tab"]';
const latestSelector = 'section[aria-label="Derniers tickets"]';
const states = new Set(["loading", "ready", "error"]);

function ticketFeed() {
  const feed = document.createElement("section");
  feed.className = "tsukuyomi-ticket-feed";
  return feed;
}

function connectDashboard(nonce, openTicketsInitially) {
  const root = document.getElementById("root");
  const parentOrigin = new URL(window.location.href).origin;
  const page = document.createElement("main");
  page.dataset.tsukuyomiTickets = "";
  const tickets = ticketFeed();
  const latest = ticketFeed();
  page.append(tickets);

  let port;
  let data = { status: "loading", tickets: [] };
  let lastTicketsRender;
  let lastLatestRender;
  let shouldOpenTickets = openTicketsInitially;

  function ticketTab() {
    return Array.from(root.querySelectorAll(tabsSelector)).find((tab) => tab.textContent.trim() === "Tickets");
  }

  const onViewAll = () => ticketTab()?.click();
  const onRetry = () => port?.postMessage({ type: "tsukuyomi:retry" });

  function syncDashboard() {
    const originalMain = root.querySelector("main:not([data-tsukuyomi-tickets])");
    const tab = ticketTab();
    if (!originalMain || !tab) return;

    if (shouldOpenTickets) {
      shouldOpenTickets = false;
      tab.click();
    }

    const showTickets = tab.getAttribute("aria-selected") === "true";
    originalMain.toggleAttribute("data-tsukuyomi-native-tickets", showTickets);
    if (showTickets) {
      if (originalMain.nextElementSibling !== page) originalMain.after(page);
      if (lastTicketsRender !== data) {
        renderTickets(tickets, { ...data, onRetry });
        lastTicketsRender = data;
      }
    } else {
      page.remove();
    }

    const originalLatest = originalMain.querySelector(latestSelector);
    if (originalLatest) {
      if (latest.parentElement !== originalLatest) originalLatest.append(latest);
      if (!originalLatest.hasAttribute("data-tsukuyomi-latest")) {
        originalLatest.setAttribute("data-tsukuyomi-latest", "");
      }
      if (lastLatestRender !== data) {
        renderLatestTickets(latest, { ...data, onViewAll, onRetry });
        lastLatestRender = data;
      }
    }
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
  connectDashboard(nonce, params.get("tab") === "tickets");
}
