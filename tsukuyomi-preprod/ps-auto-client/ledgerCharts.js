import { buildLedgerSeries } from "./ledgerSeries.js?rev=canonical-ticket";

const views = new WeakMap();
let moduleRequest;
let loadAttempts = 0;

function loadNativeCharts() {
  if (!moduleRequest) {
    const url = new URL("./nativeChartsRuntime.js?rev=admin-brier", import.meta.url);
    if (loadAttempts) url.searchParams.set("retry", String(loadAttempts));
    moduleRequest = import(url.href).catch((error) => {
      moduleRequest = undefined;
      loadAttempts += 1;
      throw error;
    });
  }
  return moduleRequest;
}

export function clearLedgerCharts(section) {
  const view = views.get(section);
  views.delete(section);
  view?.dispose?.();
}

export function renderLedgerCharts(section, tickets, totals) {
  const doc = section.ownerDocument;
  const host = doc.createElement("div");
  host.dataset.tsukuyomiNativeCharts = "";
  const view = {};
  const model = buildLedgerSeries(tickets, { includeBrier: false });
  views.set(section, view);
  section.append(host);

  async function mount() {
    const notice = doc.createElement("p");
    notice.className = "tsukuyomi-ticket-notice";
    notice.setAttribute("role", "status");
    notice.textContent = "Chargement des graphiques…";
    host.replaceChildren(notice);
    try {
      const { mountNativeCharts } = await loadNativeCharts();
      if (views.get(section) !== view) return;
      host.replaceChildren();
      view.dispose = mountNativeCharts(host, model, totals);
    } catch {
      if (views.get(section) !== view) return;
      notice.textContent = "Les graphiques sont momentanément indisponibles.";
      const retry = doc.createElement("button");
      retry.type = "button";
      retry.className = "tsukuyomi-tickets-button tsukuyomi-tickets-retry";
      retry.textContent = "Réessayer";
      retry.addEventListener("click", mount);
      host.append(retry);
    }
  }

  mount();
}
