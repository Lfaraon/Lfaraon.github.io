/**
 * GitHub Actions, 1 fois/heure. Exécution depuis la racine du dépôt Pages.
 * Les secrets API ne sont JAMAIS publiés ; seul le résultat vérifié est écrit.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyEvidence, footballCandidate, hasFootballRegulationScore, identifyMatch, isVerifiedFinal, missingAfterLive,
  orientObservation, tennisCandidate,
} from './status-core.mjs';

const ROOT = process.env.PS_AUTO_DATA_DIR || join(process.cwd(), 'PS-AUTO');
const INPUT = join(ROOT, 'match-source.json');
const OUTPUT = join(ROOT, 'live-match-status.json');
const checkedAt = new Date().toISOString();
const DAY = 86_400_000;
const footballErrorKinds = new Map([
  ['requests', 'quota'], ['quota', 'quota'], ['rate', 'quota'], ['rate_limit', 'quota'],
  ['token', 'authentification'], ['key', 'authentification'], ['apikey', 'authentification'], ['api_key', 'authentification'],
  ['authorization', 'authentification'], ['credentials', 'authentification'],
  ['plan', 'abonnement'], ['subscription', 'abonnement'], ['access', 'accès'],
]);

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function getJson(url, key, header) {
  const host = new URL(url).host;
  const headers = { [header]: key };
  // API-Football rejects application-supplied headers other than its API key.
  if (host !== 'v3.football.api-sports.io') headers.accept = 'application/json';
  const response = await fetch(url, {
    headers, signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new Error(`Connexion indisponible (${host})`); });
  if (!response.ok) throw new Error(`HTTP ${response.status} (${host})`);
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new Error(`Réponse invalide (${host})`);
  if (body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length)) {
    const kinds = host === 'v3.football.api-sports.io'
      ? [...new Set(Object.keys(body.errors).map((name) => footballErrorKinds.get(name.toLowerCase())).filter(Boolean))]
      : [];
    if (kinds.includes('accès') && typeof body.errors.access === 'string') {
      if (/headers?/i.test(body.errors.access)) kinds.push('en-têtes refusés');
      else if (/\bip\b|whitelist|allowlist/i.test(body.errors.access)) kinds.push('adresse du serveur refusée');
    }
    throw new Error(`Erreur fournisseur (${host})${kinds.length ? ` — ${kinds.join(', ')}` : ''}`);
  }
  return body;
}

export function activeMatches(manifest, state, now = Date.parse(checkedAt)) {
  return manifest.matches.filter((m) => {
    const t = Date.parse(m.kickoff);
    if (!Number.isFinite(t) || t < now - 4 * DAY || t > now + 3 * DAY) return false;
    const previous = state.matches[m.id];
    return !isVerifiedFinal(previous, m.kickoff, now)
      || (m.sport === 'Football' && !hasFootballRegulationScore(previous));
  });
}

function observe(state, match, candidate) {
  const old = state.matches[match.id] || { status: match.snapshotStatus };
  const reversed = candidate.reversed ?? old.reversed ?? false;
  state.matches[match.id] = applyEvidence(old, orientObservation(candidate, reversed), checkedAt, match.kickoff);
}

export function footballDates(matches, now = Date.parse(checkedAt), state) {
  const today = Math.floor(now / DAY) * DAY;
  const dateHasOpenMatch = new Map();
  for (const { id, kickoff } of matches) {
    const date = new Date(kickoff).toISOString().slice(0, 10);
    const open = !state || !isVerifiedFinal(state.matches[id], kickoff, now);
    dateHasOpenMatch.set(date, dateHasOpenMatch.get(date) || open);
  }
  return [...dateHasOpenMatch.keys()].sort((a, b) => Number(dateHasOpenMatch.get(b)) - Number(dateHasOpenMatch.get(a))
    || Math.abs(Date.parse(a) - today) - Math.abs(Date.parse(b) - today)
    || a.localeCompare(b)).slice(0, 3);
}

async function football(active, state, key) {
  if (!key) return 'clé manquante';
  const items = active.filter((m) => m.sport === 'Football');
  if (!items.length) return 'aucun match à suivre';
  const days = footballDates(items, Date.parse(checkedAt), state);
  const results = await Promise.allSettled(days.map(async (date) => {
    const body = await getJson(`https://v3.football.api-sports.io/fixtures?date=${date}`, key, 'x-apisports-key');
    if (!Array.isArray(body.response)) throw new Error('Réponse football incomplète');
    return body.response;
  }));
  const verified = results.filter(({ status }) => status === 'fulfilled');
  if (!verified.length) throw results[0].reason;
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') console.warn(`Vérification football du ${days[index]} échouée : ${result.reason.message}`);
  }
  const fixtures = verified.flatMap(({ value }) => value).map(footballCandidate);
  for (const match of items) {
    const found = identifyMatch(match, fixtures);
    if (found) observe(state, match, found);
    else if (state.matches[match.id]?.provider === 'API-Football') {
      // L'absence d'un match dans un lot de fixtures n'est PAS une preuve de fin.
      // On ne le règle jamais sur cette seule base.
    }
  }
  const unavailable = days.length - verified.length;
  return `${verified.length} jour(s) vérifié(s)${unavailable ? `, ${unavailable} indisponible(s)` : ''}`;
}

async function tennis(active, state, key) {
  if (!key) return 'clé manquante';
  const items = active.filter((m) => m.sport === 'Tennis');
  if (!items.length) return 'aucun match à suivre';
  // Réduire la liste des futurs matchs à la période réellement suivie.
  // Sans filtre, les 200 premiers matchs mondiaux masquent parfois nos affiches.
  const dates = items.map((m) => m.kickoff.slice(0, 10)).sort();
  const period = `&from=${dates[0]}&to=${dates[dates.length - 1]}`;
  const [live, upcoming] = await Promise.all(['live', 'upcoming'].map((status) => getJson(
    `https://api.livetennisapi.com/api/public/v1/matches?status=${status}&limit=200${status === 'upcoming' ? period : ''}`,
    key, 'X-API-Key',
  )));
  if (!Array.isArray(live.data) || !Array.isArray(upcoming.data)) throw new Error('Réponse tennis incomplète');
  const candidates = [...live.data, ...upcoming.data].map(tennisCandidate);
  const seenIds = new Set(candidates.map((c) => c.providerId));
  for (const match of items) {
    const previous = state.matches[match.id];
    const exactById = previous?.provider === 'Live Tennis API'
      ? candidates.filter((c) => c.providerId === previous.providerId) : [];
    const found = exactById.length === 1 ? { ...exactById[0], reversed: previous.reversed } : identifyMatch(match, candidates);
    if (found) observe(state, match, found);
  }

  // L'absence n'est interprétable que lorsque les deux listes sont complètes.
  const complete = live.meta?.has_more === false && upcoming.meta?.has_more === false;
  const missing = items.filter((match) => {
    const previous = state.matches[match.id];
    return previous?.provider === 'Live Tennis API' && previous.observedLive &&
      !seenIds.has(previous.providerId);
  });
  for (const match of missing) {
    const old = state.matches[match.id];
    state.matches[match.id] = missingAfterLive(old, checkedAt, complete);
  }

  // L'ID d'une fiche connue permet de lire son état final, même si elle n'a
  // jamais été observée en direct ou si les listes sont paginées.
  // 2 détails max/heure : 48 appels de listes + 48 détails = 96/jour.
  const toCheck = items.filter((match) => {
    const previous = state.matches[match.id];
    return previous?.provider === 'Live Tennis API' && previous.providerId &&
      Date.parse(match.kickoff) <= Date.parse(checkedAt) &&
      !seenIds.has(previous.providerId);
  }).sort((a, b) =>
    Number(Boolean(state.matches[b.id].observedLive)) - Number(Boolean(state.matches[a.id].observedLive)) ||
    (state.matches[a.id].lastDetailedAt || '').localeCompare(state.matches[b.id].lastDetailedAt || '')
  ).slice(0, 2);
  for (const match of toCheck) {
    const previous = state.matches[match.id];
    try {
      const body = await getJson(
        `https://api.livetennisapi.com/api/public/v1/matches/${encodeURIComponent(previous.providerId)}`,
        key, 'X-API-Key',
      );
      const detail = tennisCandidate(body.match || body.data || body);
      // Le stable ID doit rester celui déjà identifié : pas de résultat d'une autre affiche.
      if (detail.providerId === previous.providerId && detail.status !== 'À venir') {
        observe(state, match, { ...detail, reversed: previous.reversed });
      }
    } catch (err) {
      console.warn(`Détail tennis indisponible pour ${match.id}: ${err.message}`);
    }
    state.matches[match.id].lastDetailedAt = checkedAt;
  }
  return `${live.data.length} directs, ${upcoming.data.length} à venir ; ${toCheck.length} fiche(s) revérifiée(s)`;
}

export async function run() {
  const manifest = await readJson(INPUT, null);
  if (manifest?.schema !== 1 || !Array.isArray(manifest.matches)) throw new Error('Liste des matchs absente ou invalide');
  const previous = await readJson(OUTPUT, { schema: 1, checkedAt: null, providers: {}, matches: {} });
  const state = {
    schema: 1, checkedAt: previous.checkedAt || null,
    providers: { ...previous.providers }, matches: { ...previous.matches },
  };
  const active = activeMatches(manifest, state);
  const providers = [
    ['football', () => football(active, state, process.env.API_FOOTBALL_KEY)],
    ['tennis', () => tennis(active, state, process.env.LIVE_TENNIS_API_KEY)],
  ];
  let success = false;
  for (const [name, check] of providers) {
    try {
      const detail = await check();
      state.providers[name] = { state: detail === 'clé manquante' ? 'non configuré' : 'ok', detail, checkedAt };
      if (detail !== 'clé manquante') success = true;
    } catch (error) {
      console.warn(`Vérification ${name} échouée : ${error.message}`);
      state.providers[name] = { state: 'erreur', detail: 'Source momentanément indisponible', checkedAt };
    }
  }
  // Aucun secret : ne pas donner l'illusion d'une synchronisation en cours.
  if (!success) { console.log('Aucune synchronisation : clés absentes ou flux indisponibles.'); return false; }
  state.checkedAt = checkedAt;
  await writeFile(OUTPUT, JSON.stringify(state, null, 2) + '\n', 'utf8');
  console.log(`Statuts vérifiés à ${checkedAt}. ${Object.keys(state.matches).length} fiches avec suivi.`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
