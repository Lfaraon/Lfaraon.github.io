import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeMatches, footballDates } from './refresh-match-status.mjs';
import { applyEvidence, footballCandidate, identifyMatch, isVerifiedFinal, orientObservation, tennisCandidate } from './status-core.mjs';

const kickoff = '2026-11-23T17:00:00Z';
const checkedAt = '2026-11-23T20:00:00Z';
const providerSource = 'https://v3.football.api-sports.io/fixtures?id=123';

function football(status, fulltime) {
  return footballCandidate({
    fixture: { id: 123, date: kickoff, status: { short: status } },
    goals: { home: 3, away: 2 },
    score: { fulltime },
  });
}

test('le résultat football conserve le statut fournisseur et le score à 90 minutes', () => {
  for (const statusCode of ['AET', 'PEN']) {
    const candidate = football(statusCode, { home: 1, away: 0 });
    const saved = applyEvidence(null, candidate, checkedAt, kickoff);
    assert.equal(saved.status, 'Terminé');
    assert.equal(saved.statusCode, statusCode);
    assert.equal(saved.score, '3-2');
    assert.equal(saved.regulationScore, '1-0');
    assert.equal(saved.sourceUrl, providerSource);
    const reversed = orientObservation(candidate, true);
    assert.equal(reversed.score, '2-3');
    assert.equal(reversed.regulationScore, '0-1');
  }
  const regulationOnly = football('FT');
  assert.equal(regulationOnly.status, 'Terminé');
  assert.equal(regulationOnly.score, '3-2');
  assert.equal(regulationOnly.regulationScore, '3-2');
  assert.equal(football('FT', { home: 1, away: 0 }).status, 'Résultat à confirmer');
  for (const statusCode of ['AET', 'PEN', 'ABD']) {
    const candidate = football(statusCode);
    assert.equal(candidate.status, 'Résultat à confirmer');
    assert.equal(candidate.statusCode, statusCode);
    assert.equal(candidate.score, undefined);
    assert.equal(candidate.sourceUrl, undefined);
  }
});

test('seul le match de tennis joué jusqu’au bout peut produire un score final', () => {
  const make = (outcome, event_status = 'Finished', games = [[4, 5], [6, 7]]) => tennisCandidate({
    id: 42, scheduled_time: kickoff, status: 'completed', outcome, event_status,
    score: { sets: [0, 2], games },
  });
  const saved = applyEvidence(null, make('completed'), checkedAt, kickoff);
  assert.equal(saved.status, 'Terminé');
  assert.equal(saved.outcome, 'completed');
  assert.equal(saved.score, '0-2');
  assert.equal(saved.sets, '4-6, 5-7');
  assert.equal(saved.sourceUrl, 'https://api.livetennisapi.com/api/public/v1/matches/42');
  const reversed = orientObservation(make('completed'), true);
  assert.equal(reversed.score, '2-0');
  assert.equal(reversed.sets, '6-4, 7-5');
  for (const outcome of ['retired', 'walkover', 'default', 'abandoned', 'unresolved', null]) {
    const candidate = make(outcome);
    assert.equal(candidate.status, 'Résultat à confirmer');
    assert.equal(candidate.score, undefined);
    assert.equal(candidate.sourceUrl, undefined);
  }
  assert.equal(make('completed', 'Walk Over').status, 'Résultat à confirmer');
  for (const games of [null, [[4, null], [6, 7]], [[4, 8], [6, 10]], [[4, 1], [6, 0]]]) {
    const candidate = make('completed', 'Finished', games);
    assert.equal(candidate.status, 'Résultat à confirmer');
    assert.equal(candidate.sets, undefined);
  }
});

test('une clôture présumée reste à vérifier et perd son ancien caractère présumé au prochain résultat prouvé', () => {
  const synthetic = {
    status: 'Terminé', checkedAt, provider: 'Règle horaire PS-AUTO (statut présumé)',
    statusBasis: 'Fin estimée', score: '0-0',
    sourceUrl: 'https://example.test/match/123',
  };
  const unlinked = { status: 'Terminé', checkedAt, provider: 'API-Football', score: '2-1' };
  const verified = {
    ...unlinked, provider: 'Fédération officielle', sourceUrl: 'https://example.test/match/real',
    statusBasis: 'Score vérifié, clôture non présumée',
  };
  const manifest = { matches: [
    { id: 'synthetic', kickoff, snapshotStatus: 'À venir' },
    { id: 'unlinked', kickoff, snapshotStatus: 'Terminé' },
    { id: 'snapshot-only', kickoff, snapshotStatus: 'Terminé' },
    { id: 'verified', kickoff, snapshotStatus: 'Terminé' },
    { id: 'outside-window', kickoff: '2026-11-17T17:00:00Z', snapshotStatus: 'Terminé' },
  ] };
  const state = { matches: { synthetic, unlinked, verified } };
  const now = Date.parse(checkedAt);
  assert.deepEqual(activeMatches(manifest, state, now).map(({ id }) => id), ['synthetic', 'unlinked', 'snapshot-only']);
  assert.equal(isVerifiedFinal({ ...verified, sourceUrl: 'https://example.test/live-match-status.json' }, kickoff, now), false);

  const observation = football('FT');
  const saved = applyEvidence(synthetic, observation, checkedAt, kickoff);
  assert.equal(saved.score, '3-2');
  assert.equal(saved.statusBasis, undefined);
  assert.equal(saved.provider, 'API-Football');
  assert.equal(saved.sourceUrl, providerSource);
  assert.equal(isVerifiedFinal(saved, kickoff, now), true);
  assert.equal(applyEvidence(verified, observation, checkedAt, kickoff), verified);
});

test('trois dates football maximum en priorité autour du jour de vérification', () => {
  const dates = ['19', '20', '21', '23', '24', '22', '24'].map((day) => ({
    kickoff: `2026-11-${day}T17:00:00Z`,
  }));
  assert.deepEqual(footballDates(dates, Date.parse(checkedAt)), ['2026-11-23', '2026-11-22', '2026-11-24']);
});

test('une preuve finale est complétée uniquement par un résultat football structuré et concordant', () => {
  const previous = {
    status: 'Terminé', score: '2 – 3', checkedAt: '2026-11-23T19:45:00Z',
    provider: 'Fédération officielle', sourceUrl: 'https://example.test/match/original',
    statusBasis: 'Score final vérifié', observedLive: true,
  };
  const final = orientObservation(football('AET', { home: 1, away: 0 }), true);
  assert.deepEqual(applyEvidence(previous, final, checkedAt, kickoff), {
    ...previous, statusCode: 'AET', regulationScore: '0-1',
    regulationScoreSourceUrl: providerSource, regulationScoreCheckedAt: checkedAt,
  });
  for (const mismatch of [
    { ...final, score: '3-2' },
    { ...final, kickoff: '2026-11-23T18:00:00Z' },
    { ...final, regulationScore: null },
    { ...final, status: 'En cours' },
    { ...final, sourceUrl: 'https://example.test/live-match-status.json' },
  ]) {
    assert.equal(applyEvidence(previous, mismatch, checkedAt, kickoff), previous);
  }
  const alreadyStructured = { ...previous, regulationScore: '0-0' };
  const conflictingStatus = { ...previous, statusCode: 'FT' };
  const otherProviderFixture = { ...previous, provider: 'API-Football', providerId: '124' };
  for (const preserved of [alreadyStructured, conflictingStatus, otherProviderFixture]) {
    assert.equal(applyEvidence(preserved, final, checkedAt, kickoff), preserved);
  }
});

test('le rattrapage football reste récent et utilise les dates restantes après les matchs ouverts', () => {
  const now = Date.parse(checkedAt);
  const final = { status: 'Terminé', score: '3-2', checkedAt, provider: 'Fédération officielle', sourceUrl: providerSource };
  const match = (id, at = kickoff, sport = 'Football') => ({ id, kickoff: at, sport });
  const recent = match('recent');
  const tennis = match('tennis', kickoff, 'Tennis');
  const old = match('old', '2026-11-17T17:00:00Z');
  const complete = match('complete');
  const state = { matches: { recent: final, tennis: final, old: final, complete: { ...final, regulationScore: '3-2' } } };
  const open = ['22', '24', '25'].map((day) => match(day, `2026-11-${day}T17:00:00Z`));
  const active = activeMatches({ matches: [recent, tennis, old, complete, ...open] }, state, now);
  assert.deepEqual(active.map(({ id }) => id), ['recent', '22', '24', '25']);
  assert.deepEqual(footballDates(active, now, state), ['2026-11-22', '2026-11-24', '2026-11-25']);
  assert.deepEqual(footballDates(active.slice(0, 3), now, state), ['2026-11-22', '2026-11-24', '2026-11-23']);
});

test('une date en erreur préserve les résultats des autres dates et masque la réponse du fournisseur', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ps-auto-football-test-'));
  const input = join(directory, 'match-source.json');
  const output = join(directory, 'live-match-status.json');
  t.after(async () => {
    await Promise.all([rm(input, { force: true }), rm(output, { force: true })]);
    await rmdir(directory);
  });
  const environment = { ...process.env };
  for (const [name, value] of Object.entries({
    PS_AUTO_DATA_DIR: directory, API_FOOTBALL_KEY: 'mocked-key', LIVE_TENNIS_API_KEY: '',
  })) {
    process.env[name] = value;
    t.after(() => {
      if (environment[name] === undefined) delete process.env[name];
      else process.env[name] = environment[name];
    });
  }
  const started = new Date(Date.now() - 4 * 3600_000).toISOString();
  const previousDay = new Date(Date.parse(started) - 86_400_000).toISOString();
  const match = (id, at) => ({ id, kickoff: at, sport: 'Football', name: 'Alpha – Bravo', snapshotStatus: 'À venir' });
  await writeFile(input, JSON.stringify({ schema: 1, matches: [match('confirmed', started), match('unavailable', previousDay)] }));
  let denyAccess = false;
  const requests = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.deepEqual(Object.keys(options.headers), ['x-apisports-key']);
    const endpoint = new URL(url);
    if (denyAccess) {
      if (endpoint.pathname === '/status') {
        return Response.json({ response: { subscription: { active: true }, account: { email: 'sensitive@example.invalid' } } });
      }
      return Response.json({ errors: { access: 'private payload text' } });
    }
    const date = endpoint.searchParams.get('date');
    if (date === previousDay.slice(0, 10)) return Response.json({ errors: { requests: 'private payload text' } });
    assert.equal(date, started.slice(0, 10));
    return Response.json({ response: [{
      fixture: { id: 123, date: started, status: { short: 'FT' } },
      teams: { home: { name: 'Alpha' }, away: { name: 'Bravo' } },
      goals: { home: 2, away: 0 },
    }] });
  });
  const warnings = t.mock.method(console, 'warn', () => {});
  const { run } = await import('./refresh-match-status.mjs?partial-football-test');
  assert.equal(await run(), true);
  const state = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(requests.mock.callCount(), 2);
  assert.equal(state.matches.confirmed.regulationScore, '2-0');
  assert.equal(state.matches.unavailable, undefined);
  assert.equal(state.providers.football.detail, '1 jour(s) vérifié(s), 1 indisponible(s)');
  assert.equal(warnings.mock.callCount(), 1);
  assert.match(warnings.mock.calls[0].arguments[0], /Erreur fournisseur \(v3\.football\.api-sports\.io\) — quota$/);
  assert.doesNotMatch(warnings.mock.calls[0].arguments[0], /private payload text|mocked-key/);
  denyAccess = true;
  assert.equal(await run(), false);
  assert.ok(requests.mock.calls.some(({ arguments: [url] }) => new URL(url).pathname === '/status'));
  const lastWarning = warnings.mock.calls.at(-1).arguments[0];
  assert.match(lastWarning, /abonnement actif, accès aux rencontres refusé/);
  assert.doesNotMatch(lastWarning, /private payload text|sensitive@example\.invalid|mocked-key/);
});

test('les alias des clubs exigent le même coup d’envoi et le même ordre des équipes', () => {
  for (const [name, sides] of [
    ['Stade Brest 29 – Paris FC', ['Brest', 'Paris FC']],
    ['Hansa Rostock – TSV Havelse', ['Rostock', 'Havelse']],
    ['Venezia FC – Bologna FC', ['Venezia', 'Bologne']],
  ]) {
    const match = { sport: 'Football', kickoff, name };
    const candidate = { sport: 'Football', kickoff: '2026-11-23T18:00:00+01:00', sides, providerId: '123' };
    assert.deepEqual(identifyMatch(match, [candidate]), { ...candidate, reversed: false });
    assert.equal(identifyMatch(match, [{ ...candidate, kickoff: checkedAt }]), null);
    assert.equal(identifyMatch(match, [{ ...candidate, sides: sides.toReversed() }]), null);
    assert.equal(identifyMatch(match, [{ ...candidate, sides: [sides[0] + ' II', sides[1]] }]), null);
    assert.equal(identifyMatch(match, [candidate, { ...candidate, providerId: '456' }]), null);
  }

  const match = { sport: 'Football', kickoff, name: 'Venezia FC – Bologna FC' };
  const candidate = { sport: 'Football', kickoff: checkedAt, sides: ['Venezia FC', 'Bologna FC'], providerId: '123' };
  assert.equal(identifyMatch(match, [candidate]).providerId, candidate.providerId);
});
