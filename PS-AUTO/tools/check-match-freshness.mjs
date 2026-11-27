/**
 * Mode refresh: skip duplicate scheduled API calls within 50 minutes.
 * Mode watchdog: request a safe retry when no successful check exists for 80 minutes.
 */
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refreshDecision, watchdogDecision } from './freshness-core.mjs';

const mode = process.argv[2] || 'refresh';
if (!['refresh', 'watchdog'].includes(mode)) throw new Error('Mode de vérification inconnu : ' + mode);

const source = process.env.PS_AUTO_STATUS_PATH || join(process.cwd(), 'PS-AUTO/live-match-status.json');
let state;
try {
  state = JSON.parse(await readFile(source, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { checkedAt: null, providers: {} };
}

const repair = process.env.GITHUB_EVENT_NAME === 'push' && state.providers?.football?.state === 'erreur';
const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.FORCE_REFRESH !== 'false';
const forced = mode === 'refresh' && (repair || manual);
const decision = mode === 'refresh' ? refreshDecision(state, Date.now(), forced) : watchdogDecision(state);
const minutes = decision.ageMinutes === null ? 'indéterminé' : Math.max(0, Math.floor(decision.ageMinutes)) + ' min';
const label = mode === 'refresh' ? 'run_refresh' : 'needs_refresh';
const enabled = mode === 'refresh' ? decision.shouldRun : decision.needsRefresh;

console.log('Dernière vérification : ' + (decision.checkedAt || 'absente') + ' ; âge : ' + minutes);
console.log(mode === 'refresh'
  ? (enabled ? 'Vérification API nécessaire.' : 'Vérification récente : appels API évités.')
  : (enabled ? 'Actualisation en retard : déclenchement de secours nécessaire.' : 'Actualisation récente : aucun secours nécessaire.'));

if (decision.troubledProviders.length) {
  console.log('::warning::Fournisseurs à contrôler : ' + decision.troubledProviders.join(', '));
}
if (mode === 'watchdog' && enabled) {
  console.log('::warning::PS-AUTO : dernier contrôle trop ancien (' + minutes + '). Demande de relance.');
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, label + '=' + String(enabled) + '\n');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    '### Contrôle PS-AUTO\n\n' +
    '- Dernière vérification : ' + (decision.checkedAt || 'absente') + '\n' +
    '- Âge : ' + minutes + '\n' +
    '- Action : ' + (enabled ? 'nécessaire' : 'aucune') + '\n' +
    '- Sources en difficulté : ' + (decision.troubledProviders.join(', ') || 'aucune') + '\n');
}
