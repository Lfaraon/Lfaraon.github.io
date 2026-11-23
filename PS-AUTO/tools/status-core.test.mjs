import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeMatches, footballDates } from './refresh-match-status.mjs';
import { applyEvidence, footballCandidate, isVerifiedFinal, orientObservation, tennisCandidate } from './status-core.mjs';

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
