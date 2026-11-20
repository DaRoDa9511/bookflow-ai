import { CalendarClock, CheckCircle2, Phone, UserX, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatInZone, localDate } from "@shared/time.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useServices, useStaff, useStaffServices } from "@/features/catalog/api";
import { DateStrip, SlotPicker } from "@/features/availability/SlotPicker";
import { E164, errorCode, formatMoney, normalizePhone } from "@/lib/utils";
import type { Booking, Business } from "@/types/models";
import { statusVariant, useBookingActions } from "./api";

export function useErrorToast() {
  const { t } = useTranslation();
  return (e: unknown) => {
    const code = errorCode(e);
    toast.error(t(`errors.${code}` as "errors.forbidden", { defaultValue: t("common.error") }));
  };
}

export function BookingDetailsDialog({
  booking,
  business,
  onClose,
  canManage,
}: {
  booking: Booking;
  business: Business;
  onClose: () => void;
  canManage: boolean;
}) {
  const { t, i18n } = useTranslation();
  const actions = useBookingActions(business.id);
  const onError = useErrorToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  const active = booking.status === "confirmed" || booking.status === "pending_payment";
  const started = new Date(booking.starts_at) <= new Date();

  async function set(status: "completed" | "no_show") {
    try {
      await actions.setStatus.mutateAsync({ id: booking.id, status });
      toast.success(t("common.saved"));
      onClose();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {booking.services?.name}
              <Badge variant={statusVariant[booking.status]}>{t(`status.${booking.status}`)}</Badge>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />
              {formatInZone(booking.starts_at, business.timezone, i18n.language, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("common.customer")}</dt>
              <dd className="font-medium">{booking.customers?.name ?? "—"}</dd>
              {booking.customers?.phone && (
                <a
                  className="flex items-center gap-1 text-primary hover:underline"
                  href={`tel:${booking.customers.phone}`}
                >
                  <Phone className="h-3.5 w-3.5" /> {booking.customers.phone}
                </a>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">{t("common.staff")}</dt>
              <dd className="font-medium">{booking.staff?.display_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("common.price")}</dt>
              <dd className="font-medium">
                {formatMoney(booking.price, business.currency, i18n.language)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("common.source")}</dt>
              <dd className="font-medium">{t(`sources.${booking.source}`)}</dd>
            </div>
            {booking.notes && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">{t("common.notes")}</dt>
                <dd>{booking.notes}</dd>
              </div>
            )}
            {booking.cancelled_reason && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">{t("bookings.cancelReason")}</dt>
                <dd>{booking.cancelled_reason}</dd>
              </div>
            )}
          </dl>
          {canManage && active && (
            <DialogFooter className="flex-wrap">
              <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                <XCircle /> {t("bookings.cancelBooking")}
              </Button>
              {started && (
                <Button
                  variant="outline"
                  loading={actions.setStatus.isPending}
                  onClick={() => set("no_show")}
                >
                  <UserX /> {t("bookings.markNoShow")}
                </Button>
              )}
              <Button loading={actions.setStatus.isPending} onClick={() => set("completed")}>
                <CheckCircle2 /> {t("bookings.markCompleted")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("bookings.cancelTitle")}
        description={t("bookings.cancelHint")}
        confirmLabel={t("bookings.cancelBooking")}
        cancelLabel={t("common.close")}
        loading={actions.cancel.isPending}
        onConfirm={async () => {
          try {
            await actions.cancel.mutateAsync({ id: booking.id, reason: reason || undefined });
            toast.success(t("bookings.cancelled"));
            setConfirmCancel(false);
            onClose();
          } catch (e) {
            onError(e);
          }
        }}
      >
        <Input
          aria-label={t("bookings.cancelReason")}
          placeholder={t("bookings.cancelReason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </>
  );
}

export function NewBookingDialog({
  business,
  initialDate,
  initialStaffId,
  onClose,
}: {
  business: Business;
  initialDate?: string;
  initialStaffId?: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const services = (useServices(business.id).data ?? []).filter((s) => s.is_active);
  const staff = (useStaff(business.id).data ?? []).filter((s) => s.is_active);
  const links = useStaffServices(business.id).data ?? [];
  const actions = useBookingActions(business.id);
  const onError = useErrorToast();
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>(initialStaffId ?? "");
  const [date, setDate] = useState<string>(initialDate ?? localDate(new Date(), business.timezone));
  const [slot, setSlot] = useState<{ start: string; staff_id: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const eligible = staff.filter(
    (s) => !serviceId || links.some((l) => l.staff_id === s.id && l.service_id === serviceId),
  );
  const normalized = normalizePhone(phone);
  const valid = serviceId && slot && name.trim().length >= 2 && E164.test(normalized);
  const staffNames = Object.fromEntries(staff.map((s) => [s.id, s.display_name]));

  async function submit() {
    if (!valid || !slot) return;
    try {
      await actions.create.mutateAsync({
        slug: business.slug,
        serviceId,
        staffId: slot.staff_id,
        start: slot.start,
        name: name.trim(),
        phone: normalized,
        notes: notes || undefined,
      });
      toast.success(t("bookings.created"));
      onClose();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("bookings.newBooking")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.service")} htmlFor="nb-service">
            <Select
              id="nb-service"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSlot(null);
              }}
            >
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {t("common.minutes", { count: s.duration_min })} ·{" "}
                  {formatMoney(s.price, business.currency, i18n.language)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.staff")} htmlFor="nb-staff">
            <Select
              id="nb-staff"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setSlot(null);
              }}
            >
              <option value="">{t("booking.anyStaff")}</option>
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {serviceId && (
          <div className="space-y-3">
            <DateStrip
              timezone={business.timezone}
              value={date}
              onChange={(d) => {
                setDate(d);
                setSlot(null);
              }}
            />
            <SlotPicker
              slug={business.slug}
              timezone={business.timezone}
              serviceId={serviceId}
              staffId={staffId || null}
              date={date}
              value={slot}
              onChange={setSlot}
              staffNames={staffNames}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.name")} htmlFor="nb-name">
            <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field
            label={t("common.phone")}
            htmlFor="nb-phone"
            error={phone && !E164.test(normalized) ? t("errors.invalid_phone") : undefined}
          >
            <Input
              id="nb-phone"
              type="tel"
              placeholder="+573001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        <Field label={`${t("common.notes")} (${t("common.optional")})`} htmlFor="nb-notes">
          <Textarea
            id="nb-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} loading={actions.create.isPending} onClick={submit}>
            {t("bookings.createBooking")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
