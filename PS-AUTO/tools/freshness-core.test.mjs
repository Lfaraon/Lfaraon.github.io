import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFreshness, refreshDecision, watchdogDecision } from './freshness-core.mjs';

const now = Date.parse('2026-11-16T17:00:00Z');
const state = (age, providers = { football: { state: 'ok' }, tennis: { state: 'ok' } }) => ({
  checkedAt: new Date(now - age * 60_000).toISOString(), providers,
});

test('un contrôle récent évite les appels API programmés en double', () => {
  assert.equal(refreshDecision(state(20), now).shouldRun, false);
  assert.equal(refreshDecision(state(49), now).shouldRun, false);
});

test('un contrôle âgé de 50 minutes est relancé', () => {
  assert.equal(refreshDecision(state(50), now).shouldRun, true);
  assert.equal(refreshDecision(state(90), now).shouldRun, true);
});

test('le lancement manuel peut forcer un contrôle même récent', () => {
  assert.equal(refreshDecision(state(10), now, true).shouldRun, true);
});

test('le watchdog tolère les délais modérés et détecte les retards', () => {
  assert.equal(watchdogDecision(state(79), now).needsRefresh, false);
  assert.equal(watchdogDecision(state(80), now).needsRefresh, true);
  assert.equal(watchdogDecision(state(100), now).needsRefresh, true);
});

test('un contrôle absent, illisible ou daté dans le futur exige une relance', () => {
  assert.equal(refreshDecision({}, now).shouldRun, true);
  assert.equal(watchdogDecision({ checkedAt: 'invalide' }, now).needsRefresh, true);
  assert.equal(checkFreshness(state(-10), now).recent, false);
});

test('les fournisseurs en erreur sont signalés sans confondre fraîcheur et couverture', () => {
  const value = state(10, { football: { state: 'erreur' }, tennis: { state: 'ok' } });
  assert.deepEqual(checkFreshness(value, now).troubledProviders, ['football']);
  assert.equal(watchdogDecision(value, now).needsRefresh, false);
});
