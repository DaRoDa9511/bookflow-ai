import { describe, expect, it } from "vitest";
import {
  computeSlotsForDate,
  computeSlotsForRange,
  isSlotAvailable,
  pickSuggestions,
  type AvailabilityInput,
} from "./availability.ts";
import { addDays, localDate, localTime, weekdayOf, zonedToUtc } from "./time.ts";

const TZ = "America/Bogota"; // UTC-5, no DST
const A = "staff-a";
const B = "staff-b";
const DATE = "2026-12-07"; // Monday

function base(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    durationMin: 30,
    bufferMin: 0,
    staffIds: [A],
    workingHours: [{ staff_id: A, weekday: 1, start_time: "09:00", end_time: "12:00" }],
    timeOff: [],
    busy: [],
    now: new Date("2026-12-01T12:00:00Z"),
    stepMin: 30,
    ...over,
  };
}

const times = (slots: { start: string }[]) => slots.map((s) => localTime(new Date(s.start), TZ));

describe("time helpers", () => {
  it("converts wall-clock time to UTC for a fixed-offset zone", () => {
    expect(zonedToUtc(DATE, 9 * 60, TZ).toISOString()).toBe("2026-12-07T14:00:00.000Z");
  });

  it("handles DST transitions (Madrid, last Sunday of March)", () => {
    // 2026-03-29 02:00 → 03:00 in Europe/Madrid. 10:00 local is UTC+2.
    expect(zonedToUtc("2026-03-29", 10 * 60, "Europe/Madrid").toISOString()).toBe(
      "2026-03-29T08:00:00.000Z",
    );
    expect(zonedToUtc("2026-03-28", 10 * 60, "Europe/Madrid").toISOString()).toBe(
      "2026-03-28T09:00:00.000Z",
    );
  });

  it("computes weekday, local date and date arithmetic", () => {
    expect(weekdayOf(DATE)).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(localDate(new Date("2026-12-08T03:00:00Z"), TZ)).toBe("2026-12-07");
  });
});

describe("computeSlotsForDate", () => {
  it("generates slots inside working hours", () => {
    expect(times(computeSlotsForDate(base(), DATE))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("returns nothing on a day without working hours", () => {
    expect(computeSlotsForDate(base(), "2026-12-08")).toEqual([]);
  });

  it("respects duration so the appointment ends before closing", () => {
    expect(times(computeSlotsForDate(base({ durationMin: 90 }), DATE))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
    ]);
  });

  it("applies the buffer after the appointment against existing bookings", () => {
    const busy = [
      { staff_id: A, starts_at: "2026-12-07T15:00:00Z", ends_at: "2026-12-07T15:30:00Z" },
    ]; // 10:00-10:30
    const noBuffer = times(computeSlotsForDate(base({ busy }), DATE));
    expect(noBuffer).toEqual(["09:00", "09:30", "10:30", "11:00", "11:30"]);
    const withBuffer = times(computeSlotsForDate(base({ busy, bufferMin: 15 }), DATE));
    expect(withBuffer).toEqual(["09:00", "10:30", "11:00", "11:30"]);
  });

  it("excludes staff time off and business-wide closures", () => {
    const timeOff = [
      { staff_id: A, starts_at: "2026-12-07T14:00:00Z", ends_at: "2026-12-07T15:00:00Z" },
    ];
    expect(times(computeSlotsForDate(base({ timeOff }), DATE))).toEqual([
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    const closed = [
      { staff_id: null, starts_at: "2026-12-07T05:00:00Z", ends_at: "2026-12-08T05:00:00Z" },
    ];
    expect(computeSlotsForDate(base({ timeOff: closed }), DATE)).toEqual([]);
  });

  it("never offers past slots or slots within the minimum lead time", () => {
    const now = new Date("2026-12-07T14:40:00Z"); // 09:40 local
    expect(times(computeSlotsForDate(base({ now }), DATE))).toEqual(["11:00", "11:30"]);
    expect(times(computeSlotsForDate(base({ now, minLeadMinutes: 0 }), DATE))).toEqual([
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("supports split shifts and multiple staff", () => {
    const input = base({
      staffIds: [A, B],
      workingHours: [
        { staff_id: A, weekday: 1, start_time: "09:00", end_time: "10:00" },
        { staff_id: A, weekday: 1, start_time: "15:00", end_time: "16:00" },
        { staff_id: B, weekday: 1, start_time: "09:30", end_time: "10:30" },
      ],
    });
    const slots = computeSlotsForDate(input, DATE);
    expect(slots.map((s) => `${localTime(new Date(s.start), TZ)}-${s.staff_id}`)).toEqual([
      "09:00-staff-a",
      "09:30-staff-a",
      "09:30-staff-b",
      "10:00-staff-b",
      "15:00-staff-a",
      "15:30-staff-a",
    ]);
  });

  it("ignores staff not eligible for the service", () => {
    const input = base({
      staffIds: [B],
      workingHours: [{ staff_id: A, weekday: 1, start_time: "09:00", end_time: "12:00" }],
    });
    expect(computeSlotsForDate(input, DATE)).toEqual([]);
  });

  it("returns empty for invalid durations", () => {
    expect(computeSlotsForDate(base({ durationMin: 0 }), DATE)).toEqual([]);
  });

  it("works across a DST change", () => {
    const input = base({
      timezone: "Europe/Madrid",
      workingHours: [{ staff_id: A, weekday: 0, start_time: "10:00", end_time: "11:00" }],
      now: new Date("2026-03-01T00:00:00Z"),
    });
    const slots = computeSlotsForDate(input, "2026-03-29");
    expect(slots.map((s) => s.start)).toEqual([
      "2026-03-29T08:00:00.000Z",
      "2026-03-29T08:30:00.000Z",
    ]);
  });
});

describe("range, suggestions and validation", () => {
  it("computes slots across several days", () => {
    const input = base({
      workingHours: [
        { staff_id: A, weekday: 1, start_time: "09:00", end_time: "10:00" },
        { staff_id: A, weekday: 2, start_time: "09:00", end_time: "10:00" },
      ],
    });
    expect(computeSlotsForRange(input, DATE, addDays(DATE, 6))).toHaveLength(4);
  });

  it("picks up to N distinct start times spread through the day", () => {
    const slots = computeSlotsForDate(
      base({
        stepMin: 15,
        staffIds: [A, B],
        workingHours: [
          { staff_id: A, weekday: 1, start_time: "09:00", end_time: "18:00" },
          { staff_id: B, weekday: 1, start_time: "09:00", end_time: "18:00" },
        ],
      }),
      DATE,
    );
    const picks = pickSuggestions(slots, 6);
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((p) => p.start)).size).toBe(6);
    expect(localTime(new Date(picks[0].start), TZ)).toBe("09:00");
    expect(localTime(new Date(picks[5].start), TZ) > "14:00").toBe(true);
  });

  it("validates a concrete slot, including off-grid starts", () => {
    const input = base();
    expect(isSlotAvailable(input, A, "2026-12-07T14:00:00Z")).toBe(true);
    expect(isSlotAvailable(input, A, "2026-12-07T14:10:00Z")).toBe(true);
    expect(isSlotAvailable(input, A, "2026-12-07T16:45:00Z")).toBe(false); // 11:45 + 30 > 12:00
    const busy = [
      { staff_id: A, starts_at: "2026-12-07T14:00:00Z", ends_at: "2026-12-07T14:30:00Z" },
    ];
    expect(isSlotAvailable({ ...input, busy }, A, "2026-12-07T14:00:00Z")).toBe(false);
    expect(isSlotAvailable(input, B, "2026-12-07T14:00:00Z")).toBe(false);
  });
});
