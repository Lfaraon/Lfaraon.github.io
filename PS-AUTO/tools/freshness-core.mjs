/** Pure freshness decisions for the hourly match-status workflows. No API calls. */
export const REFRESH_INTERVAL_MINUTES = 50;
export const WATCHDOG_MAX_AGE_MINUTES = 80;

export function checkFreshness(state, nowMs = Date.now(), maxAgeMinutes = REFRESH_INTERVAL_MINUTES) {
  const checkedAt = typeof state?.checkedAt === 'string' ? state.checkedAt : null;
  const timestamp = checkedAt ? Date.parse(checkedAt) : NaN;
  const ageMinutes = Number.isFinite(timestamp) ? (nowMs - timestamp) / 60_000 : null;
  const recent = ageMinutes !== null && ageMinutes >= 0 && ageMinutes < maxAgeMinutes;
  const providers = ['football', 'tennis'];
  const troubledProviders = providers.filter((name) => ['erreur', 'non configuré'].includes(state?.providers?.[name]?.state));
  return { checkedAt, ageMinutes, recent, troubledProviders };
}

export function refreshDecision(state, nowMs = Date.now(), force = false) {
  const freshness = checkFreshness(state, nowMs, REFRESH_INTERVAL_MINUTES);
  return { ...freshness, shouldRun: Boolean(force) || !freshness.recent };
}

export function watchdogDecision(state, nowMs = Date.now()) {
  const freshness = checkFreshness(state, nowMs, WATCHDOG_MAX_AGE_MINUTES);
  return { ...freshness, needsRefresh: !freshness.recent };
}
