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
  const { t, i18n } = useTranslation();
  const today = localDate(new Date(), timezone);
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
  return (
    <div
      className="no-scrollbar flex min-w-0 max-w-full gap-1.5 overflow-x-auto"
      role="listbox"
      aria-label={t("common.dates")}
    >
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
              "flex w-12 shrink-0 flex-col items-center rounded-md border py-1.5 text-[11px] leading-tight transition",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span className="uppercase opacity-80">
              {dt.toLocaleDateString(i18n.language, { weekday: "short", timeZone: "UTC" })}
            </span>
            <span className={cn("text-sm font-semibold", !selected && "text-foreground")}>
              {Number(d.slice(8))}
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
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-14" />
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

  const groups: { key: "morning" | "afternoon" | "evening"; slots: typeof unique }[] = [
    { key: "morning", slots: [] },
    { key: "afternoon", slots: [] },
    { key: "evening", slots: [] },
  ];
  for (const s of unique) {
    const hh = Number(localTime(new Date(s.start), timezone).slice(0, 2));
    groups[hh < 12 ? 0 : hh < 18 ? 1 : 2].slots.push(s);
  }
  const selectedSlot = unique.find(
    (s) => value?.start === s.start && (!staffId || value.staff_id === s.staff_id),
  );

  return (
    <div className="space-y-3" role="listbox" aria-label={t("common.time")}>
      {groups
        .filter((g) => g.slots.length > 0)
        .map((g) => (
          <div key={g.key} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t(`booking.${g.key}`)}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.slots.map((s) => {
                const selected = selectedSlot === s;
                return (
                  <button
                    key={`${s.start}-${s.staff_id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={staffNames?.[s.staff_id]}
                    onClick={() => onChange({ start: s.start, staff_id: s.staff_id })}
                    className={cn(
                      "h-8 rounded-md border px-2.5 text-xs font-medium tabular-nums transition",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary/60 hover:bg-accent",
                    )}
                  >
                    {localTime(new Date(s.start), timezone)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      {selectedSlot && !staffId && staffNames && (
        <p className="text-xs text-muted-foreground">
          {t("booking.withStaff", {
            time: localTime(new Date(selectedSlot.start), timezone),
            name: staffNames[selectedSlot.staff_id],
          })}
        </p>
      )}
    </div>
  );
}
