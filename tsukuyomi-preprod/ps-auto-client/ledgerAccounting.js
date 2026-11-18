const amount = new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedAmount = new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});

export const referenceStake = 100;
export const outcomeLabel = { won: "Gagné", lost: "Perdu", void: "Remboursé" };

export function ticketDate(ticket) {
  return ticket.placed_at || ticket.published_at;
}

export function netAmount(ticket) {
  const { outcome, payout_odds } = ticket.settlement ?? {};
  if (outcome === "won") return referenceStake * ((payout_odds ?? ticket.odds) - 1);
  if (outcome === "lost") return -referenceStake;
  if (outcome === "void") return 0;
  return null;
}

export function formatChf(value, signed = false) {
  return Number.isFinite(value) ? (signed ? signedAmount : amount).format(value) + "\u00a0CHF" : "—";
}

export function summarize(tickets) {
  const totals = { won: 0, lost: 0, void: 0, pending: 0, net: 0, roi: null, winRate: null };
  for (const ticket of tickets) {
    const outcome = ticket.settlement?.outcome;
    const net = netAmount(ticket);
    if (!Number.isFinite(net)) {
      totals.pending += 1;
      continue;
    }
    totals[outcome] += 1;
    totals.net += net;
  }
  const staked = totals.won + totals.lost;
  if (staked) {
    totals.roi = totals.net / (referenceStake * staked);
    totals.winRate = totals.won / staked;
  }
  return totals;
}
