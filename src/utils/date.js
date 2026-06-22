// ============================================================
//  utils/date.js
// ============================================================
// `due_date` is a Postgres DATE column — pg serializes it as
// "YYYY-MM-DDT00:00:00.000Z", which is just a calendar date wearing
// a bogus UTC-midnight timestamp. Comparing that directly against
// `new Date()` makes a task look overdue starting at 07:00 Thai time
// on the due date itself, instead of staying valid through the whole
// day. The deadline should instead expire at the end of that day in
// Thai time (UTC+7) — i.e. at 17:00 UTC on the due date.
export function dueDateCutoffUTC(dueDateStr) {
  const [y, m, d] = dueDateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
}

export function isOverdue(dueDateStr) {
  return new Date() >= dueDateCutoffUTC(dueDateStr);
}
