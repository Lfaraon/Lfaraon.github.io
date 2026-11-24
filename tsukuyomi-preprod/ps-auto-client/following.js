const ticketId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,133}$/;
const maxStakeCents = 2_147_483_647;

export function isFollowableTicketId(value) {
  return typeof value === "string" && ticketId.test(value);
}

export function isPersonalStakeCents(value) {
  return Number.isInteger(value) && value > 0 && value <= maxStakeCents;
}

export function parsePersonalStake(value) {
  const input = value.trim();
  if (!input) return null;
  if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(input)) return undefined;
  const cents = Math.round(Number(input.replace(",", ".")) * 100);
  return isPersonalStakeCents(cents) ? cents : undefined;
}

export function readFollowingState(message) {
  const { status, followingIds, pendingIds, stakeEntries, error } = message;
  if (status === "hidden") return { status };
  if (!["loading", "ready", "error"].includes(status)
      || !Array.isArray(followingIds) || !Array.isArray(pendingIds)) return null;
  const ids = new Set(followingIds.filter(isFollowableTicketId));
  const stakes = Array.isArray(stakeEntries) ? new Map() : undefined;
  for (const entry of stakes ? stakeEntries : []) {
    if (Array.isArray(entry) && ids.has(entry[0]) && isPersonalStakeCents(entry[1])) stakes.set(entry[0], entry[1]);
  }
  return {
    status,
    ids,
    stakes,
    pending: new Set(pendingIds.filter(isFollowableTicketId)),
    error: typeof error === "string" ? error.trim() : "",
  };
}
