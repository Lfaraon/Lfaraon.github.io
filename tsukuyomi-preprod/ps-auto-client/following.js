const ticketId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,133}$/;

export function isFollowableTicketId(value) {
  return typeof value === "string" && ticketId.test(value);
}

export function readFollowingState(message) {
  const { status, followingIds, pendingIds, error } = message;
  if (status === "hidden") return { status };
  if (!["loading", "ready", "error"].includes(status)
      || !Array.isArray(followingIds) || !Array.isArray(pendingIds)) return null;
  return {
    status,
    ids: new Set(followingIds.filter(isFollowableTicketId)),
    pending: new Set(pendingIds.filter(isFollowableTicketId)),
    error: typeof error === "string" ? error.trim() : "",
  };
}
