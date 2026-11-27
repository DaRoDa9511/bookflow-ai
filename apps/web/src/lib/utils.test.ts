import { describe, expect, it } from "vitest";
import { E164, errorCode, normalizePhone, toCsv } from "./utils";

describe("web utils", () => {
  it("extracts SQL error codes", () => {
    expect(errorCode({ message: "slot_taken" })).toBe("slot_taken");
    expect(errorCode(new Error("ERROR: outside_working_hours (P0001)"))).toBe(
      "outside_working_hours",
    );
  });

  it("normalizes phones to E.164", () => {
    expect(normalizePhone("300 123 4567", "57")).toBe("+573001234567");
    expect(normalizePhone("727 92030", "591")).toBe("+59172792030");
    expect(normalizePhone("59172792030", "591")).toBe("+59172792030");
    expect(normalizePhone("+52 55 1234 5678")).toBe("+525512345678");
    expect(E164.test(normalizePhone("0034 600 111 222"))).toBe(true);
  });

  it("builds CSV with escaping", () => {
    expect(toCsv([{ a: "x,y", b: 1 }])).toBe('a,b\n"x,y",1');
  });
});
