/** État des matchs : on ne transforme jamais un horaire écoulé en résultat. */
export const STATUSES = new Set([
  'À venir', 'En cours', 'Résultat à confirmer', 'Terminé', 'Suspendu', 'Reporté', 'Annulé',
]);
const scorePattern = /^\d+\s*[-–—:]\s*\d+$/;
const footballFinalStatuses = new Set(['FT', 'AET', 'PEN']);
const exceptionalResults = /^(?:abd|awd|wo|w o|ret|retired|walk over|walkover|default|abandoned|cancelled|postponed|interrupted|suspended|unresolved)$/;

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

export function isVerifiedFinal(observation, kickoff, now = Date.now()) {
  if (observation?.status !== 'Terminé' || typeof observation.score !== 'string'
    || !scorePattern.test(observation.score.trim()) || !normalized(observation.provider)) return false;
  const checked = Date.parse(observation.checkedAt);
  const starts = Date.parse(observation.rescheduledKickoff ?? kickoff);
  if (!Number.isFinite(checked) || checked > now || (Number.isFinite(starts) && checked <= starts)) return false;
  if ([observation.statusCode, observation.resultType, observation.outcome].map(normalized).some((mark) => exceptionalResults.test(mark))) return false;
  const note = normalized(observation.statusBasis)
    .replace(/\b(?:non|pas|jamais) presumee?\b/g, '')
    .replace(/\b(?:pas|non) une? cloture horaire presumee?\b/g, '')
    .replace(/\b(?:pas|non) (?:un|des) scores? provisoires?\b/g, '');
  if (/\b(?:presumee?|regle horaire)\b/.test(normalized(observation.provider))
    || /\bpresumee?\b|\b(?:abandonne|abandon|forfait|walkover|retired)\b|\b(?:score|resultat) final (?:inconnu|absent|non confirme)\b|\baucun (?:score|resultat) (?:final|verifie)\b|\bscore provisoire\b|\b(?:termine|fin) (?:automatiquement|estimee?)\b/.test(note)) return false;
  const { sourceUrl } = observation;
  if (typeof sourceUrl !== 'string' || sourceUrl.length > 2048 || /[\s\\\p{Cc}]/u.test(sourceUrl)) return false;
  try {
    const url = new URL(sourceUrl);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && !/(?:^|\/)(?:match-source|live-match-status)\.json$/i.test(url.pathname);
  } catch {
    return false;
  }
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

function scoreText(home, away) {
  return Number.isSafeInteger(home) && Number.isSafeInteger(away) && home >= 0 && away >= 0
    ? `${home}-${away}` : undefined;
}

export function footballCandidate(f) {
  const status = String(f?.fixture?.status?.short || '');
  const providerId = String(f?.fixture?.id || '');
  const goals = scoreText(f?.goals?.home, f?.goals?.away);
  // Le calendrier affiche le score final, les marchés utilisent celui des 90 minutes.
  const regulationScore = scoreText(f?.score?.fulltime?.home, f?.score?.fulltime?.away)
    ?? (status === 'FT' ? goals : undefined);
  const score = goals ?? (status === 'FT' ? regulationScore : undefined);
  const final = footballFinalStatuses.has(status) && Boolean(score) && Boolean(regulationScore) && /^\d+$/.test(providerId);
  const state = final ? 'Terminé' :
    ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status) ? 'En cours' :
    ['SUSP', 'INT'].includes(status) ? 'Suspendu' :
    status === 'PST' ? 'Reporté' : status === 'CANC' ? 'Annulé' :
    ['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO'].includes(status) ? 'Résultat à confirmer' : 'À venir';
  return {
    provider: 'API-Football', providerId, sport: 'Football',
    sides: [String(f?.teams?.home?.name || ''), String(f?.teams?.away?.name || '')],
    kickoff: f?.fixture?.date || '', status: state, statusCode: status,
    ...(final && { score, regulationScore, sourceUrl: `https://v3.football.api-sports.io/fixtures?id=${providerId}` }),
  };
}

function tennisSetScores(games, setWins) {
  const count = setWins[0] + setWins[1];
  const requiredWins = Math.max(...setWins);
  if (![2, 3].includes(requiredWins) || !Array.isArray(games) || games.length !== 2
    || games.some((player) => !Array.isArray(player) || player.length !== count)) return undefined;

  const won = [0, 0];
  const scores = [];
  for (let i = 0; i < count; i++) {
    const [first, second] = [games[0][i], games[1][i]];
    const score = scoreText(first, second);
    if (!score) return undefined;
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    if (!(high === 6 && low <= 4) && !(high === 7 && (low === 5 || low === 6))) return undefined;
    const winner = first > second ? 0 : 1;
    won[winner] += 1;
    if (won[winner] === requiredWins && i < count - 1) return undefined;
    scores.push(score);
  }
  return won[0] === setWins[0] && won[1] === setWins[1] ? scores.join(', ') : undefined;
}

export function tennisCandidate(m) {
  const state = String(m?.status || '').toLowerCase();
  const event = String(m?.event_status || '').toLowerCase();
  const outcome = String(m?.outcome || '').toLowerCase();
  const setWins = m?.score?.sets;
  const score = Array.isArray(setWins) && setWins.length === 2 && setWins[0] !== setWins[1] ? scoreText(...setWins) : undefined;
  const sets = score ? tennisSetScores(m.score.games, setWins) : undefined;
  const providerId = String(m?.id || '');
  const final = state === 'completed' && outcome === 'completed' && !exceptionalResults.test(normalized(event))
    && Boolean(sets) && /^\d+$/.test(providerId);
  const status = final ? 'Terminé' :
    event === 'postponed' ? 'Reporté' : event === 'cancelled' || state === 'cancelled' ? 'Annulé' :
    event === 'interrupted' ? 'Suspendu' : state === 'live' ? 'En cours' :
    state === 'completed' ? 'Résultat à confirmer' : 'À venir';
  return {
    provider: 'Live Tennis API', providerId, sport: 'Tennis',
    sides: [String(m?.players?.p1?.name || ''), String(m?.players?.p2?.name || '')],
    kickoff: m?.scheduled_time || '', status, outcome, statusCode: event,
    ...(final && { score, sets, sourceUrl: `https://api.livetennisapi.com/api/public/v1/matches/${providerId}` }),
  };
}

export function orientObservation(observation, reversed) {
  const aligned = { ...observation, reversed };
  if (!reversed) return aligned;
  const reverse = (score) => score.split('-').reverse().join('-');
  if (aligned.score) aligned.score = reverse(aligned.score);
  if (aligned.regulationScore) aligned.regulationScore = reverse(aligned.regulationScore);
  if (aligned.sets) aligned.sets = aligned.sets.split(', ').map(reverse).join(', ');
  return aligned;
}

export function applyEvidence(previous, observation, checkedAt, kickoff = observation?.kickoff) {
  if (!observation || !STATUSES.has(observation.status)) return previous;
  const now = Date.parse(checkedAt);
  if (isVerifiedFinal(previous, kickoff, now)) return previous;
  if (previous?.status === 'En cours' && observation.status === 'À venir') return previous;
  if (observation.status === 'Terminé' && !isVerifiedFinal({ ...observation, checkedAt }, kickoff, now)) return previous;
  return {
    status: observation.status,
    provider: observation.provider,
    providerId: observation.providerId,
    checkedAt,
    observedLive: previous?.observedLive || ['En cours', 'Suspendu'].includes(observation.status),
    reversed: observation.reversed ?? previous?.reversed ?? false,
    ...(observation.statusCode && { statusCode: observation.statusCode }),
    ...(observation.outcome && { outcome: observation.outcome }),
    ...(observation.status === 'Terminé' && {
      score: observation.score,
      sourceUrl: observation.sourceUrl,
      ...(observation.regulationScore && { regulationScore: observation.regulationScore }),
      ...(observation.sets && { sets: observation.sets }),
    }),
  };
}

export function missingAfterLive(previous, checkedAt, providerIsComplete) {
  if (!providerIsComplete || !previous?.observedLive || !['En cours', 'Résultat à confirmer', 'Suspendu'].includes(previous.status)) return previous;
  return { ...previous, status: 'Résultat à confirmer', checkedAt };
}
