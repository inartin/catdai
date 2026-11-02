export const ADMIN_PERIOD_OPTIONS = [
  { key: "day", label: "1 day" },
  { key: "week", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "previous_month", label: "Previous month" },
  { key: "all", label: "All time" },
];

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Chisinau", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function localTime(date) {
  const p = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

function midnight(year, month, day) {
  const target = Date.UTC(year, month, day);
  let start = target;
  // Resolve the offset at the boundary itself, including daylight-saving changes.
  for (let i = 0; i < 2; i++) start += target - localTime(new Date(start));
  return new Date(start).toISOString();
}

export function adminPeriod(value, now = new Date()) {
  const period = ADMIN_PERIOD_OPTIONS.some(({ key }) => key === value) ? value : "all";
  const local = new Date(localTime(now));
  const year = local.getUTCFullYear(), month = local.getUTCMonth();
  let since = null, until = null;
  if (period === "day") since = midnight(year, month, local.getUTCDate());
  if (period === "week") since = new Date(now.getTime() - 7 * 86400000).toISOString();
  if (period === "month") since = midnight(year, month, 1);
  if (period === "previous_month") {
    since = midnight(year, month - 1, 1);
    until = midnight(year, month, 1);
  }
  return { period, since, until };
}

export function chisinauDateKey(date) {
  const local = new Date(localTime(new Date(date)));
  return local.toISOString().slice(0, 10);
}

export function applyAdminPeriod(query, column, range = {}) {
  if (range.since) query = query.gte(column, range.since);
  if (range.until) query = query.lt(column, range.until);
  return query;
}
