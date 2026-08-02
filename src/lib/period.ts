// Fixed 14-day reporting periods, anchored to Monday 2024-01-01.
// Every period is exactly 14 days, always starting/ending on the same
// calendar boundaries for everyone (like a biweekly pay period) — it does
// NOT roll on a per-user or per-shift basis.
//
// IMPORTANT: this logic must exactly match the `weekly_credit_v` SQL view.
// If you ever change PERIOD_DAYS or the anchor date, update the view too.

const ANCHOR_UTC = Date.UTC(2024, 0, 1); // Mon 2024-01-01
const PERIOD_DAYS = 14;
const DAY_MS = 86400000;

function periodIndexFor(date: Date): number {
  const dayUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceAnchor = Math.floor((dayUTC - ANCHOR_UTC) / DAY_MS);
  return Math.floor(daysSinceAnchor / PERIOD_DAYS);
}

/** Returns the period's key as its start date, e.g. "2026-07-14". Matches weekly_credit_v.week_key. */
export function getPeriodKey(date: Date): string {
  const start = new Date(ANCHOR_UTC + periodIndexFor(date) * PERIOD_DAYS * DAY_MS);
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(start.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns the start/end Date objects for the period containing `date`. */
export function getPeriodRange(date: Date): { start: Date; end: Date } {
  const start = new Date(ANCHOR_UTC + periodIndexFor(date) * PERIOD_DAYS * DAY_MS);
  const end = new Date(start.getTime() + (PERIOD_DAYS - 1) * DAY_MS);
  return { start, end };
}

/** Human-readable range for display, e.g. "Jul 14 – Jul 27". */
export function formatPeriodRange(date: Date): string {
  const { start, end } = getPeriodRange(date);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}
