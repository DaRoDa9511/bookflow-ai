// Single source of truth for slot availability. Used by the AI agent (Edge
// Functions), the public booking page and the business panel.
import { eachDate, localDate, parseTime, weekdayOf, zonedToUtc } from "./time.ts";

export interface WorkingHoursRow {
  staff_id: string;
  weekday: number; // 0 = Sunday
  start_time: string; // HH:MM[:SS] local time
  end_time: string;
}

export interface TimeOffRow {
  staff_id: string | null; // null = whole business closed
  starts_at: string; // ISO (UTC)
  ends_at: string;
}

export interface BusyRow {
  staff_id: string;
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityInput {
  timezone: string;
  durationMin: number;
  bufferMin?: number;
  /** Staff members eligible for the service (already filtered by staff_services / is_active). */
  staffIds: string[];
  workingHours: WorkingHoursRow[];
  timeOff: TimeOffRow[];
  busy: BusyRow[];
  now: Date;
  /** Do not offer slots starting sooner than this. Default 60 minutes. */
  minLeadMinutes?: number;
  /** Granularity of candidate start times. Default 15 minutes. */
  stepMin?: number;
}

export interface Slot {
  start: string; // ISO UTC
  end: string; // ISO UTC (start + duration, buffer excluded)
  staff_id: string;
}

interface Interval {
  s: number;
  e: number;
}

const overlaps = (a: Interval, b: Interval) => a.s < b.e && b.s < a.e;

/** All free slots for one local calendar date, sorted by start then staff. */
export function computeSlotsForDate(input: AvailabilityInput, date: string): Slot[] {
  const {
    timezone,
    durationMin,
    bufferMin = 0,
    staffIds,
    workingHours,
    timeOff,
    busy,
    now,
    minLeadMinutes = 60,
    stepMin = 15,
  } = input;
  if (durationMin <= 0 || staffIds.length === 0) return [];

  const weekday = weekdayOf(date);
  const earliest = now.getTime() + minLeadMinutes * 60_000;
  const durMs = durationMin * 60_000;
  const bufMs = Math.max(0, bufferMin) * 60_000;

  const blockedFor = (staffId: string): Interval[] => [
    ...timeOff
      .filter((t) => t.staff_id === null || t.staff_id === staffId)
      .map((t) => ({ s: Date.parse(t.starts_at), e: Date.parse(t.ends_at) })),
    ...busy
      .filter((b) => b.staff_id === staffId)
      .map((b) => ({ s: Date.parse(b.starts_at), e: Date.parse(b.ends_at) })),
  ];

  const slots: Slot[] = [];
  for (const staffId of staffIds) {
    const shifts = workingHours.filter((w) => w.staff_id === staffId && w.weekday === weekday);
    if (shifts.length === 0) continue;
    const blocked = blockedFor(staffId);
    for (const shift of shifts) {
      const startMin = parseTime(shift.start_time);
      const endMin = parseTime(shift.end_time);
      for (let m = startMin; m + durationMin <= endMin; m += stepMin) {
        const start = zonedToUtc(date, m, timezone).getTime();
        const end = start + durMs;
        // The appointment itself must fit in the shift (checked in local minutes
        // above); the buffer only needs to be free of other appointments.
        if (start < earliest) continue;
        const occupied = { s: start, e: end + bufMs };
        if (blocked.some((b) => overlaps(occupied, b))) continue;
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          staff_id: staffId,
        });
      }
    }
  }
  slots.sort((a, b) =>
    a.start === b.start ? a.staff_id.localeCompare(b.staff_id) : a.start < b.start ? -1 : 1,
  );
  // Remove duplicates produced by overlapping shift rows.
  return slots.filter(
    (s, i) => i === 0 || s.start !== slots[i - 1].start || s.staff_id !== slots[i - 1].staff_id,
  );
}

export function computeSlotsForRange(input: AvailabilityInput, from: string, to: string): Slot[] {
  return eachDate(from, to, 31).flatMap((d) => computeSlotsForDate(input, d));
}

/**
 * Picks up to `limit` distinct start times (first staff that is free wins),
 * spread across the list so the agent can offer morning and afternoon options.
 */
export function pickSuggestions(slots: Slot[], limit = 6): Slot[] {
  const byStart = new Map<string, Slot>();
  for (const s of slots) if (!byStart.has(s.start)) byStart.set(s.start, s);
  const unique = [...byStart.values()];
  if (unique.length <= limit) return unique;
  const step = unique.length / limit;
  const out: Slot[] = [];
  for (let i = 0; i < limit; i++) out.push(unique[Math.floor(i * step)]);
  return out;
}

/** Validates that a concrete slot is still bookable (used before inserting). */
export function isSlotAvailable(
  input: AvailabilityInput,
  staffId: string,
  startIso: string,
): boolean {
  if (!input.staffIds.includes(staffId)) return false;
  const date = localDate(new Date(startIso), input.timezone);
  return computeSlotsForDate({ ...input, staffIds: [staffId], stepMin: 1 }, date).some(
    (s) => s.start === new Date(startIso).toISOString(),
  );
}
