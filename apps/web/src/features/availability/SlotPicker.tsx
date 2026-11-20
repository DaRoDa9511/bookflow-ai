import { CalendarX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addDays, localDate, localTime } from "@shared/time.ts";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useSlots } from "./api";

/** Horizontal list of the next `days` dates in the business timezone. */
export function DateStrip({
  timezone,
  value,
  onChange,
  days = 14,
}: {
  timezone: string;
  value: string | null;
  onChange: (d: string) => void;
  days?: number;
}) {
  const { i18n } = useTranslation();
  const today = localDate(new Date(), timezone);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="dates">
      {dates.map((d) => {
        const dt = new Date(`${d}T12:00:00Z`);
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(d)}
            className={cn(
              "flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-xs transition",
              selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <span className="uppercase opacity-80">
              {dt.toLocaleDateString(i18n.language, { weekday: "short", timeZone: "UTC" })}
            </span>
            <span className="text-lg font-semibold leading-tight">{Number(d.slice(8))}</span>
            <span className="opacity-80">
              {dt.toLocaleDateString(i18n.language, { month: "short", timeZone: "UTC" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SlotPicker({
  slug,
  timezone,
  serviceId,
  staffId,
  date,
  value,
  onChange,
  staffNames,
  minLeadMinutes,
}: {
  slug: string;
  timezone: string;
  serviceId: string | null;
  staffId: string | null;
  date: string | null;
  value: { start: string; staff_id: string } | null;
  onChange: (slot: { start: string; staff_id: string }) => void;
  staffNames?: Record<string, string>;
  minLeadMinutes?: number;
}) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useSlots({ slug, serviceId, staffId, date, minLeadMinutes });

  if (!date) return null;
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{t("common.error")}</p>;

  // When "any staff" is selected, show each time once (first free staff wins).
  const unique = staffId
    ? (data ?? [])
    : [...new Map((data ?? []).map((s) => [s.start, s])).values()];

  if (unique.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <CalendarX className="h-6 w-6" />
        {t("booking.noSlots")}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      role="listbox"
      aria-label={t("common.time")}
    >
      {unique.map((s) => {
        const selected = value?.start === s.start && (!staffId || value.staff_id === s.staff_id);
        return (
          <button
            key={`${s.start}-${s.staff_id}`}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange({ start: s.start, staff_id: s.staff_id })}
            className={cn(
              "rounded-md border px-2 py-2 text-sm font-medium tabular-nums transition",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary hover:bg-accent",
            )}
          >
            {localTime(new Date(s.start), timezone)}
            {!staffId && staffNames && (
              <span className="block truncate text-[10px] font-normal opacity-70">
                {staffNames[s.staff_id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
