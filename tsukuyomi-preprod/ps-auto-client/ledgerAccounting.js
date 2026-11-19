const amount = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedAmount = new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});

export const referenceStake = 100;
export const outcomeLabel = { won: "Gagné", lost: "Perdu", void: "Remboursé" };

export function isCanonicalTicket(ticket) {
  return ticket?.schema_version === "TSUKUYOMI_TICKET_V1";
}

export function ticketStake(ticket) {
  if (!isCanonicalTicket(ticket)) return referenceStake;
  return Number.isFinite(ticket.stake_chf) && ticket.stake_chf > 0 ? ticket.stake_chf : null;
}

export function confirmedOutcome(ticket) {
  const outcome = ticket.settlement?.outcome;
  return Object.hasOwn(outcomeLabel, outcome) ? outcome : null;
}

export function ticketDate(ticket) {
  return ticket.placed_at || ticket.published_at;
}

export function selectionOutcome(ticket, leg) {
  if (!leg) return null;
  return leg.outcome ?? (ticket.legs?.length === 1 ? ticket.settlement?.outcome : null);
}

export function netAmount(ticket) {
  const { outcome, payout_odds } = ticket.settlement ?? {};
  const stake = ticketStake(ticket);
  if (stake === null) return null;
  if (outcome === "won") return stake * ((payout_odds ?? ticket.odds) - 1);
  if (outcome === "lost") return -stake;
  if (outcome === "void") return 0;
  return null;
}

export function formatChf(value, signed = false) {
  return Number.isFinite(value) ? (signed ? signedAmount : amount).format(value) + "\u00a0CHF" : "—";
}

export function summarizeFunds(tickets) {
  const funds = { net: 0, wonStake: 0, lostStake: 0, pendingStake: 0, hasNet: false };
  for (const ticket of tickets) {
    const stake = ticketStake(ticket);
    if (stake === null) continue;
    const outcome = confirmedOutcome(ticket);
    if (!outcome) {
      funds.pendingStake += stake;
      continue;
    }
    const net = netAmount(ticket);
    if (!Number.isFinite(net)) continue;
    funds.net += net;
    funds.hasNet = true;
    if (outcome === "won") funds.wonStake += stake;
    if (outcome === "lost") funds.lostStake += stake;
  }
  return funds;
}

export function summarize(tickets, funds = summarizeFunds(tickets)) {
  const stake = funds.wonStake + funds.lostStake;
  const totals = { won: 0, lost: 0, void: 0, pending: 0, net: funds.net, roi: stake ? funds.net / stake : null, winRate: null };
  for (const ticket of tickets) totals[confirmedOutcome(ticket) ?? "pending"] += 1;
  const counted = totals.won + totals.lost;
  if (counted) totals.winRate = totals.won / counted;
  return totals;
}
