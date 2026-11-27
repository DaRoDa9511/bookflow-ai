import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Copy, LayoutTemplate } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import type { Business, WorkingHours } from "@/types/models";
import { catalogKeys, setWeeklyHours, useStaff, useWorkingHours } from "./api";
import { StaffAvatar } from "./StaffEditor";
import { HOURS_TEMPLATES } from "./templates";

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
  /** Optional lunch break inside the day (saved as two working-hour rows). */
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
}

const CLOSED: DayRow = {
  enabled: false,
  start: "09:00",
  end: "18:00",
  hasBreak: false,
  breakStart: "13:00",
  breakEnd: "14:00",
};

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function toRows(hours: WorkingHours[], staffId: string): DayRow[] {
  return Array.from({ length: 7 }, (_, wd) => {
    const day = hours
      .filter((x) => x.staff_id === staffId && x.weekday === wd)
      .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
    if (day.length === 0) return { ...CLOSED };
    const first = day[0];
    const last = day[day.length - 1];
    return {
      enabled: true,
      start: first.start_time.slice(0, 5),
      end: last.end_time.slice(0, 5),
      hasBreak: day.length > 1,
      breakStart: day.length > 1 ? first.end_time.slice(0, 5) : CLOSED.breakStart,
      breakEnd: day.length > 1 ? day[1].start_time.slice(0, 5) : CLOSED.breakEnd,
    };
  });
}

export function HoursEditor({ business }: { business: Business }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const staffQ = useStaff(business.id);
  const hoursQ = useWorkingHours(business.id);
  const [staffId, setStaffId] = useState<string>("");
  const [rows, setRows] = useState<DayRow[]>([]);
  const [saving, setSaving] = useState(false);
  const weekdays = t("weekdays", { returnObjects: true }) as string[];

  useEffect(() => {
    if (!staffId && staffQ.data?.[0]) setStaffId(staffQ.data[0].id);
  }, [staffQ.data, staffId]);
  useEffect(() => {
    if (staffId && hoursQ.data) setRows(toRows(hoursQ.data, staffId));
  }, [staffId, hoursQ.data]);

  if (staffQ.isLoading || hoursQ.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!staffQ.data?.length) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title={t("catalog.noStaff")}
        description={t("catalog.hoursNeedStaff")}
      />
    );
  }

  const payload = () =>
    rows
      .map((r, wd) => ({ ...r, wd }))
      .filter((r) => r.enabled && r.end > r.start)
      .flatMap((r) =>
        r.hasBreak && r.start < r.breakStart && r.breakStart < r.breakEnd && r.breakEnd < r.end
          ? [
              { weekday: r.wd, start_time: r.start, end_time: r.breakStart },
              { weekday: r.wd, start_time: r.breakEnd, end_time: r.end },
            ]
          : [{ weekday: r.wd, start_time: r.start, end_time: r.end }],
      );

  async function save(targets: string[]) {
    setSaving(true);
    try {
      for (const id of targets) await setWeeklyHours(business.id, id, payload());
      await qc.invalidateQueries({ queryKey: catalogKeys.hours(business.id) });
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const current = staffQ.data.find((s) => s.id === staffId);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {current && <StaffAvatar staff={current} />}
        <Select
          aria-label={t("common.staff")}
          className="max-w-xs"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
        >
          {staffQ.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </Select>
      </div>
      <div className="divide-y rounded-lg border">
        {ORDER.map((wd) => {
          const r = rows[wd];
          if (!r) return null;
          const update = (patch: Partial<DayRow>) =>
            setRows((prev) => prev.map((x, i) => (i === wd ? { ...x, ...patch } : x)));
          return (
            <div key={wd} className="flex flex-wrap items-center gap-3 p-3">
              <label className="flex w-36 items-center gap-2 text-sm font-medium">
                <Switch checked={r.enabled} onCheckedChange={(v) => update({ enabled: v })} />
                {weekdays[wd]}
              </label>
              {r.enabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${weekdays[wd]} start`}
                    className="w-28"
                    value={r.start}
                    onChange={(e) => update({ start: e.target.value })}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    aria-label={`${weekdays[wd]} end`}
                    className="w-28"
                    value={r.end}
                    onChange={(e) => update({ end: e.target.value })}
                  />
                  <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={r.hasBreak}
                      onChange={(e) => update({ hasBreak: e.target.checked })}
                    />
                    {t("catalog.lunchBreak")}
                  </label>
                  {r.hasBreak && (
                    <>
                      <Input
                        type="time"
                        aria-label={`${weekdays[wd]} ${t("catalog.lunchBreak")} start`}
                        className="h-8 w-24"
                        value={r.breakStart}
                        onChange={(e) => update({ breakStart: e.target.value })}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        aria-label={`${weekdays[wd]} ${t("catalog.lunchBreak")} end`}
                        className="h-8 w-24"
                        value={r.breakEnd}
                        onChange={(e) => update({ breakEnd: e.target.value })}
                      />
                    </>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{t("catalog.closed")}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const tpl = HOURS_TEMPLATES[business.category] ?? HOURS_TEMPLATES.other;
            setRows(
              Array.from({ length: 7 }, (_, wd) =>
                tpl[wd]
                  ? { ...CLOSED, enabled: true, start: tpl[wd][0], end: tpl[wd][1] }
                  : { ...CLOSED },
              ),
            );
            toast.info(t("templates.hoursFilled"));
          }}
        >
          <LayoutTemplate /> {t("templates.typicalHours")}
        </Button>
        {staffQ.data.length > 1 && (
          <Button
            variant="outline"
            loading={saving}
            onClick={() => save(staffQ.data!.map((s) => s.id))}
          >
            <Copy /> {t("catalog.applyToAll")}
          </Button>
        )}
        <Button loading={saving} onClick={() => save([staffId])}>
          {t("common.save")}
        </Button>
      </div>
    </Card>
  );
}
