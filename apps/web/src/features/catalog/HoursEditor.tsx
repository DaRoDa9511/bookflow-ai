import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Copy } from "lucide-react";
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

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function toRows(hours: WorkingHours[], staffId: string): DayRow[] {
  return Array.from({ length: 7 }, (_, wd) => {
    const h = hours.find((x) => x.staff_id === staffId && x.weekday === wd);
    return h
      ? { enabled: true, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) }
      : { enabled: false, start: "09:00", end: "18:00" };
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
      .map((r) => ({ weekday: r.wd, start_time: r.start, end_time: r.end }));

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
                <div className="flex items-center gap-2">
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
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{t("catalog.closed")}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
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
