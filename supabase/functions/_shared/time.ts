// Timezone helpers with zero dependencies (Intl only) so the same code runs in
// Deno (Edge Functions), the browser (Vite) and Node (Vitest).

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset in milliseconds of `timeZone` relative to UTC at `instant`. */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function parseDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function parseTime(time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Converts a wall-clock time in `timeZone` to the UTC instant. DST safe. */
export function zonedToUtc(date: string, minutesOfDay: number, timeZone: string): Date {
  const { y, m, d } = parseDate(date);
  const guess = Date.UTC(y, m - 1, d, 0, minutesOfDay, 0);
  let offset = tzOffsetMs(new Date(guess), timeZone);
  let result = guess - offset;
  const offset2 = tzOffsetMs(new Date(result), timeZone);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset;
  }
  return new Date(result);
}

/** YYYY-MM-DD of `instant` as seen in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** HH:MM of `instant` as seen in `timeZone`. */
export function localTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday for a calendar date. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string, max = 31): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < max) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatInZone(
  instant: Date | string,
  timeZone: string,
  locale = "es",
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(d);
}
