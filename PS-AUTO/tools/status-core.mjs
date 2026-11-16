/** État des matchs : on ne transforme jamais un horaire écoulé en résultat. */
export const STATUSES = new Set([
  'À venir', 'En cours', 'Résultat à confirmer', 'Terminé', 'Suspendu', 'Reporté', 'Annulé',
]);

const COUNTRY_ALIASES = {
  'iles feroe': 'faroe islands',
  'moldavie': 'moldova',
  'kazakhstan': 'kazakhstan',
  'slovaquie': 'slovakia',
  'estonie': 'estonia',
  'bulgarie': 'bulgaria',
  'islande': 'iceland',
  'lituanie': 'lithuania',
  'liechtenstein': 'liechtenstein',
  'andorre': 'andorra',
  'azerbaidjan': 'azerbaijan',
  'allemagne': 'germany',
  'pays bas': 'netherlands',
  'grece': 'greece',
  'serbie': 'serbia',
  'macedoine du nord': 'north macedonia',
  'slovenie': 'slovenia',
  'suisse': 'switzerland',
  'ecosse': 'scotland',
  'malte': 'malta',
  'namibie': 'namibia',
  'cameroun': 'cameroon',
  'soudan': 'sudan',
  'senegal': 'senegal',
  'guinee equatoriale': 'equatorial guinea',
  'somalie': 'somalia',
  'centrafrique': 'central african republic',
  'benin': 'benin',
  'erythree': 'eritrea',
  'guinee': 'guinea',
};

export function normalized(value) {
  const text = String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return COUNTRY_ALIASES[text] || text;
}

export function splitMatch(name) {
  return String(name).split(/\s+(?:vs?\.?|–|—|-)\s+/i).map((s) => s.trim()).filter(Boolean);
}

function sideMatches(a, b, sport) {
  const expected = normalized(a);
  const actual = normalized(b);
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  if (sport !== 'Tennis') return false;
  // En tennis, le flux affiche souvent « prénom nom » et le calendrier « nom ».
  const expectedNames = String(a).split('/').map((part) => normalized(part)).filter(Boolean);
  const actualNames = String(b).split('/').map((part) => normalized(part)).filter(Boolean);
  if (expectedNames.length !== actualNames.length) return false;
  return expectedNames.every((part, i) => actualNames[i] === part || actualNames[i].endsWith(` ${part}`));
}

export function identifyMatch(match, candidates) {
  const names = splitMatch(match.name);
  if (names.length !== 2) return null;
  const kickoff = Date.parse(match.kickoff);
  if (!Number.isFinite(kickoff)) return null;
  const matching = candidates.filter((candidate) => {
    if (candidate.sport !== match.sport || !Array.isArray(candidate.sides) || candidate.sides.length !== 2) return false;
    const when = Date.parse(candidate.kickoff);
    // Une même affiche peut se rejouer ; on exige également la proximité horaire.
    if (!Number.isFinite(when) || Math.abs(when - kickoff) > 12 * 3600_000) return false;
    return (sideMatches(names[0], candidate.sides[0], match.sport) && sideMatches(names[1], candidate.sides[1], match.sport)) ||
      (match.sport === 'Tennis' && sideMatches(names[0], candidate.sides[1], match.sport) && sideMatches(names[1], candidate.sides[0], match.sport));
  });
  if (matching.length !== 1 || !matching[0].providerId) return null; // Ambiguïté : aucun rapprochement automatique.
  const candidate = matching[0];
  const reversed = !sideMatches(names[0], candidate.sides[0], match.sport);
  return { ...candidate, reversed };
}

export function footballCandidate(f) {
  const status = String(f?.fixture?.status?.short || '');
  const goals = f?.goals || {};
  const final = ['FT', 'AET', 'PEN'].includes(status) &&
    Number.isInteger(goals.home) && Number.isInteger(goals.away) && goals.home >= 0 && goals.away >= 0;
  const state = final ? 'Terminé' :
    ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status) ? 'En cours' :
    ['SUSP', 'INT'].includes(status) ? 'Suspendu' :
    status === 'PST' ? 'Reporté' : status === 'CANC' ? 'Annulé' :
    ['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO'].includes(status) ? 'Résultat à confirmer' : 'À venir';
  return {
    provider: 'API-Football', providerId: String(f?.fixture?.id || ''), sport: 'Football',
    sides: [String(f?.teams?.home?.name || ''), String(f?.teams?.away?.name || '')],
    kickoff: f?.fixture?.date || '', status: state,
    score: final ? `${goals.home}-${goals.away}` : undefined,
  };
}

export function tennisCandidate(m) {
  const state = String(m?.status || '').toLowerCase();
  const event = String(m?.event_status || '').toLowerCase();
  const outcome = String(m?.outcome || '').toLowerCase();
  const settled = ['completed', 'retired', 'walkover', 'default'].includes(outcome);
  const sets = m?.score?.sets;
  const validScore = Array.isArray(sets) && sets.length === 2 && sets.every((n) => Number.isInteger(n) && n >= 0);
  const status = state === 'completed' && settled && validScore ? 'Terminé' :
    event === 'postponed' ? 'Reporté' : event === 'cancelled' || state === 'cancelled' ? 'Annulé' :
    event === 'interrupted' ? 'Suspendu' : state === 'live' ? 'En cours' :
    state === 'completed' ? 'Résultat à confirmer' : 'À venir';
  return {
    provider: 'Live Tennis API', providerId: String(m?.id || ''), sport: 'Tennis',
    sides: [String(m?.players?.p1?.name || ''), String(m?.players?.p2?.name || '')],
    kickoff: m?.scheduled_time || '', status,
    score: status === 'Terminé' ? `${sets[0]}-${sets[1]}` : undefined,
  };
}

export function applyEvidence(previous, observation, checkedAt) {
  if (!observation || !STATUSES.has(observation.status)) return previous;
  if (previous?.status === 'Terminé' && observation.status !== 'Terminé') return previous;
  if (previous?.status === 'En cours' && observation.status === 'À venir') return previous;
  if (observation.status === 'Terminé' && !/^\d+-\d+$/.test(observation.score || '')) return previous;
  const score = observation.score && /^\d+-\d+$/.test(observation.score) ? observation.score : undefined;
  return {
    status: observation.status,
    provider: observation.provider,
    providerId: observation.providerId,
    checkedAt,
    observedLive: previous?.observedLive || ['En cours', 'Suspendu'].includes(observation.status),
    reversed: observation.reversed ?? previous?.reversed ?? false,
    ...(score ? { score } : {}),
    ...(observation.status === 'Terminé' && previous?.status === 'Terminé' && previous.score === score ? { checkedAt } : {}),
  };
}

export function missingAfterLive(previous, checkedAt, providerIsComplete) {
  if (!providerIsComplete || !previous?.observedLive || !['En cours', 'Résultat à confirmer', 'Suspendu'].includes(previous.status)) return previous;
  return { ...previous, status: 'Résultat à confirmer', checkedAt };
}
