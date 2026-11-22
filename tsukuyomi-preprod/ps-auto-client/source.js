const referencePage = new URL("https://lfaraon.github.io/PS-AUTO/index.html");
const scriptPath = /^\/PS-AUTO\/assets\/index-[A-Za-z0-9_.-]+\.js$/;
const stylePath = /^\/PS-AUTO\/assets\/[A-Za-z0-9_.-]+\.css$/;
const revisionName = /^[A-Za-z0-9_.-]{1,120}$/;
const fallbackParam = "ps-auto-source";
const fetchTimeout = 4000;
const assetTimeout = 12000;

const fallback = {
  revision: "20261117-tickets-platformfix-v4",
  script: new URL("assets/index-Settlement-tickets-20261117-platformfix-v4.js", referencePage).href,
  styles: [
    "mobile-dashboard-20261116.css",
    "home-cleanup-20261116.css",
    "charts-legends-20261116.css?rev=legend-v2",
    "index-BvM4UU9J.css",
    "desktop-dashboard-20261116.css",
    "runner-version-mobile-20261116.css",
    "desktop-mobile-parity-20261117.css?layout=sidebyside2",
    "stats-kpi-alignment-20261117.css?v=2-centered",
    "header-parity-20261117.css?v=1",
  ].map((file) => new URL("assets/" + file, referencePage).href),
};

function assetUrl(value, path) {
  try {
    const url = new URL(value, referencePage);
    if (url.origin === referencePage.origin && !url.username && !url.password && !url.hash && path.test(url.pathname)) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function readPsAutoRelease(html, document) {
  const template = document.createElement("template");
  // Parse an inert fragment, so unrelated elements never contact their sources.
  template.innerHTML = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)?.[1] ?? html;
  const content = template.content;
  const entries = content.querySelectorAll('script[type="module"][src]');
  if (entries.length !== 1) return null;

  const script = assetUrl(entries[0].getAttribute("src"), scriptPath);
  const styles = Array.from(content.querySelectorAll('link[rel~="stylesheet"][href]'),
    (link) => assetUrl(link.getAttribute("href"), stylePath));
  if (!script || styles.length === 0 || styles.some((url) => !url)) return null;

  const declared = content.querySelector('meta[name="psauto-data-revision"]')?.content ?? "";
  const revision = revisionName.test(declared) ? declared : new URL(script).pathname.split("/").pop().slice(0, -3);
  return { revision, script, styles };
}

async function currentRelease(document) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeout);
  try {
    const response = await fetch(referencePage, {
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      cache: "no-cache",
      signal: controller.signal,
    });
    return response.ok ? readPsAutoRelease(await response.text(), document) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function versionedUrl(value, revision) {
  const url = new URL(value);
  url.searchParams.set("psauto-data-revision", revision);
  return url.href;
}

function loadAsset(element, anchor) {
  return new Promise((resolve, reject) => {
    function fail(message) {
      clearTimeout(timer);
      element.remove();
      reject(new Error(message));
    }
    const timer = setTimeout(() => fail("Délai de chargement PS-AUTO dépassé."), assetTimeout);
    element.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    element.addEventListener("error", () => fail("Ressource PS-AUTO indisponible."), { once: true });
    anchor.before(element);
  });
}

function waitForDashboard(root) {
  if (!root.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (root.hidden) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("Structure PS-AUTO indisponible."));
    }, assetTimeout);
    observer.observe(root, { attributes: true, attributeFilter: ["hidden"] });
  });
}

function showRetry(status, message, page) {
  status.textContent = message;
  status.hidden = false;

  const retry = status.ownerDocument.createElement("button");
  retry.type = "button";
  retry.textContent = "Réessayer";
  retry.addEventListener("click", () => {
    const { location } = status.ownerDocument.defaultView;
    if (page.searchParams.has(fallbackParam)) {
      page.searchParams.delete(fallbackParam);
      location.replace(page.href);
    } else {
      location.reload();
    }
  });
  status.append(retry);
}

export async function startPsAutoDashboard(document = globalThis.document) {
  const root = document.getElementById("root");
  const status = document.getElementById("ps-auto-status");
  const theme = document.getElementById("tsukuyomi-theme");
  if (!root || !status || !theme) return;

  const page = new URL(document.defaultView.location.href);
  const latest = page.searchParams.get(fallbackParam) === "fallback" ? null : await currentRelease(document);
  const release = latest ?? fallback;
  root.dataset.psAutoRelease = release.revision;
  root.dataset.psAutoSource = latest ? "latest" : "fallback";

  let reportRendered;
  try {
    const bridge = await import("./bridge.js?rev=following-statistics");
    reportRendered = bridge.markDashboardRendered;
    await Promise.all(release.styles.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = versionedUrl(href, release.revision);
      link.crossOrigin = "anonymous";
      return loadAsset(link, theme);
    }));

    const script = document.createElement("script");
    script.type = "module";
    script.src = versionedUrl(release.script, release.revision);
    script.crossOrigin = "anonymous";
    await loadAsset(script, theme);
    await waitForDashboard(root);
    if (latest) status.hidden = true;
    else showRetry(status, "Les dernières données du calendrier sont indisponibles. Une version de secours est affichée.", page);
  } catch {
    if (latest) {
      // A fresh iframe guarantees the previous bundle and styles cannot conflict with the fallback.
      page.searchParams.set(fallbackParam, "fallback");
      document.defaultView.location.replace(page.href);
      return;
    }
    root.hidden = true;
    root.style.setProperty("display", "none", "important");
    showRetry(status, "L’espace Tsukuyomi est temporairement indisponible.", page);
  }
  reportRendered?.();
}
