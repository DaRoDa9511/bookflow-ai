import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency = "USD",
  locale = "es",
) {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      // "45 Bs" instead of "45,00 Bs"; cents only when there are cents.
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: ["COP", "CLP", "PYG"].includes(currency) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function initials(name: string | null | undefined) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Extracts the error code raised by our SQL functions (e.g. "slot_taken"). */
export function errorCode(error: unknown): string {
  const msg =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const known = msg.match(/[a-z]+(_[a-z]+)+/);
  return known ? known[0] : msg;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
    "\n",
  );
}

export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalizes a phone to E.164. Numbers typed without "+" get the business
 * country's dialing code (e.g. "72792030" in Bolivia -> "+59172792030").
 */
export function normalizePhone(raw: string, dialCode = ""): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return "+" + cleaned.slice(1).replace(/\D/g, "");
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  const local = cleaned.replace(/^0+/, "");
  if (dialCode && !local.startsWith(dialCode)) return `+${dialCode}${local}`;
  return "+" + local;
}
