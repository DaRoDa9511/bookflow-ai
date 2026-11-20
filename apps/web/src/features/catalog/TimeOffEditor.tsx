import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addDays, formatInZone, localDate, parseTime, zonedToUtc } from "@shared/time.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/misc";
import type { Business } from "@/types/models";
import { catalogKeys, useStaff, useTableMutation, useTimeOff } from "./api";

export function TimeOffEditor({
  business,
  onlyStaffId,
}: {
  business: Business;
  /** When set (staff role), only that person's time off can be created. */
  onlyStaffId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const staff = useStaff(business.id).data ?? [];
  const items = (useTimeOff(business.id).data ?? []).filter(
    (x) => new Date(x.ends_at) > new Date(),
  );
  const { upsert, remove } = useTableMutation("time_off", [catalogKeys.timeOff(business.id)]);
  const [open, setOpen] = useState(false);
  const today = localDate(new Date(), business.timezone);
  const [form, setForm] = useState({
    staff_id: onlyStaffId ?? "",
    fromDate: today,
    fromTime: "00:00",
    toDate: today,
    toTime: "23:59",
    reason: "",
  });

  async function save() {
    const starts = zonedToUtc(form.fromDate, parseTime(form.fromTime), business.timezone);
    const ends = zonedToUtc(form.toDate, parseTime(form.toTime), business.timezone);
    if (ends <= starts) {
      toast.error(t("common.error"));
      return;
    }
    try {
      await upsert.mutateAsync({
        business_id: business.id,
        staff_id: form.staff_id || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        reason: form.reason || null,
      });
      toast.success(t("common.saved"));
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const visible = onlyStaffId
    ? items.filter((x) => x.staff_id === onlyStaffId || x.staff_id === null)
    : items;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("catalog.timeOff")}</CardTitle>
          <CardDescription>{t("catalog.timeOffHint")}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t("catalog.addTimeOff")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.length === 0 ? (
          <EmptyState icon={<CalendarOff />} title={t("catalog.noTimeOff")} />
        ) : (
          visible.map((x) => {
            const canDelete = !onlyStaffId || x.staff_id === onlyStaffId;
            return (
              <div
                key={x.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {x.staff_id
                      ? staff.find((s) => s.id === x.staff_id)?.display_name
                      : t("catalog.wholeBusiness")}
                    {x.reason && (
                      <span className="font-normal text-muted-foreground"> · {x.reason}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatInZone(x.starts_at, business.timezone, i18n.language)} →{" "}
                    {formatInZone(x.ends_at, business.timezone, i18n.language)}
                  </p>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    onClick={() => remove.mutate(x.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("catalog.addTimeOff")}</DialogTitle>
            </DialogHeader>
            {!onlyStaffId && (
              <Field label={t("common.staff")} htmlFor="to-staff">
                <Select
                  id="to-staff"
                  value={form.staff_id}
                  onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                >
                  <option value="">{t("catalog.wholeBusiness")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("catalog.from")} htmlFor="to-fd">
                <Input
                  id="to-fd"
                  type="date"
                  value={form.fromDate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fromDate: e.target.value,
                      toDate: form.toDate < e.target.value ? e.target.value : form.toDate,
                    })
                  }
                />
              </Field>
              <Field label={t("common.time")} htmlFor="to-ft">
                <Input
                  id="to-ft"
                  type="time"
                  value={form.fromTime}
                  onChange={(e) => setForm({ ...form, fromTime: e.target.value })}
                />
              </Field>
              <Field label={t("catalog.to")} htmlFor="to-td">
                <Input
                  id="to-td"
                  type="date"
                  min={form.fromDate}
                  max={addDays(form.fromDate, 365)}
                  value={form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                />
              </Field>
              <Field label={t("common.time")} htmlFor="to-tt">
                <Input
                  id="to-tt"
                  type="time"
                  value={form.toTime}
                  onChange={(e) => setForm({ ...form, toTime: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("catalog.reason")} htmlFor="to-reason">
              <Input
                id="to-reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button loading={upsert.isPending} onClick={save}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
