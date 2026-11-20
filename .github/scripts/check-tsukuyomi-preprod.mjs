import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const site = new URL("https://lfaraon.github.io/tsukuyomi-preprod/");
const calendar = new URL("https://raw.githubusercontent.com/Lfaraon/Lfaraon.github.io/main/PS-AUTO/");
const supabase = new URL("https://suudtatpapkmrrmlffvk.supabase.co");

export function entryAsset(html) {
  const entries = [...html.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], site))
    .filter((url) => url.origin === site.origin
      && /^\/tsukuyomi-preprod\/assets\/index-[\w-]+\.js$/.test(url.pathname));
  if (entries.length !== 1) throw new Error("Le HTML doit référencer un seul bundle Tsukuyomi.");
  return entries[0].href;
}

async function load(fetcher, url, label, headers) {
  const response = await fetcher(url.toString(), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers,
  });
  if (!response.ok) throw new Error(`${label} répond HTTP ${response.status}.`);
  return response;
}

function lastTimestamp(values) {
  const timestamps = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function bundleDigest(contents) {
  return createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex");
}

async function checkAuth(bundle, fetcher) {
  const keys = new Set(Array.from(bundle.matchAll(/["'](sb_publishable_[\w-]+)["']/g), ([, key]) => key));
  const [key] = keys;
  if (keys.size !== 1 || !bundle.includes(supabase.origin)) {
    throw new Error("Le bundle doit contenir une seule clé publique Supabase pour la préprod.");
  }
  await load(fetcher, new URL("/auth/v1/settings", supabase), "L’API de connexion Supabase", { apikey: key });
}

export async function checkPreproduction({ checkedInHtml, checkedInBundle, fetcher = fetch }) {
  const expectedAsset = entryAsset(checkedInHtml);
  const [landing, matchSource, matchStatus] = await Promise.all([
    load(fetcher, site, "La landing"),
    load(fetcher, new URL("match-source.json", calendar), "La liste des rencontres"),
    load(fetcher, new URL("live-match-status.json", calendar), "Les statuts des rencontres"),
  ]);
  const deployedAsset = entryAsset(await landing.text());
  if (deployedAsset !== expectedAsset) {
    throw new Error(`Le bundle en ligne (${new URL(deployedAsset).pathname}) diffère du build à vérifier (${new URL(expectedAsset).pathname}).`);
  }

  const [bundle, source, status] = await Promise.all([
    load(fetcher, new URL(deployedAsset), "Le bundle en ligne"),
    matchSource.json(),
    matchStatus.json(),
  ]);
  const deployedBundle = await bundle.text();
  if (bundleDigest(deployedBundle) !== bundleDigest(checkedInBundle)) {
    throw new Error("L’empreinte du bundle en ligne diffère de celle du dépôt.");
  }
  await checkAuth(deployedBundle, fetcher);
  if (!Array.isArray(source?.matches)) throw new Error("Le flux des rencontres ne contient pas de liste de matchs.");
  if (!status?.matches || typeof status.matches !== "object" || Array.isArray(status.matches)) {
    throw new Error("Le flux des statuts ne contient pas de dictionnaire de matchs.");
  }

  const statusEntries = Object.values(status.matches);
  return {
    asset: new URL(deployedAsset).pathname.split("/").pop(),
    matches: source.matches.length,
    statusEntries: statusEntries.length,
    calendarSnapshotAt: lastTimestamp([source.snapshotAt]),
    lastMatchCheckAt: lastTimestamp(statusEntries.map((entry) => entry?.checkedAt)),
  };
}

async function main() {
  const checkedInHtml = await readFile(new URL("../../tsukuyomi-preprod/index.html", import.meta.url), "utf8");
  const assetPath = new URL(entryAsset(checkedInHtml)).pathname;
  const checkedInBundle = await readFile(new URL(`../..${assetPath}`, import.meta.url), "utf8");
  const result = await checkPreproduction({ checkedInHtml, checkedInBundle });
  console.log(`Préprod Tsukuyomi · bundle vérifié (${result.asset}) · API de connexion accessible`);
  console.log(`${result.matches} rencontres · ${result.statusEntries} statuts`);
  console.log(`Source du calendrier (UTC) ${result.calendarSnapshotAt ?? "horodatage indisponible"}`);
  console.log(`Dernier contrôle individuel (UTC) ${result.lastMatchCheckAt ?? "horodatage indisponible"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
