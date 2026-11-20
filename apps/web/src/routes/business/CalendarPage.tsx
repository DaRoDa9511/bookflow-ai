import type { DatesSetArg, EventClickArg, EventDropArg } from "@fullcalendar/core";
import esLocale from "@fullcalendar/core/locales/es";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import { Plus, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { localDate, zonedParts } from "@shared/time.ts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { useBookingActions, useBookings, useBookingsRealtime } from "@/features/bookings/api";
import {
  BookingDetailsDialog,
  NewBookingDialog,
  useErrorToast,
} from "@/features/bookings/BookingDialogs";
import { useStaff } from "@/features/catalog/api";
import { useBusiness } from "@/lib/auth";
import type { Booking } from "@/types/models";

/**
 * FullCalendar works in the browser's timezone; we render the business's wall
 * clock by shifting each instant into a "fake local" Date and back on drop.
 */
function toWallClock(iso: string, timezone: string): Date {
  const p = zonedParts(new Date(iso), timezone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
function fromWallClock(d: Date, timezone: string): string {
  const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  const p = zonedParts(new Date(guess), timezone);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset).toISOString();
}

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { business, isOwner, staffId: myStaffId } = useBusiness();
  const staffQ = useStaff(business.id);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [filterStaff, setFilterStaff] = useState<string>(isOwner ? "" : (myStaffId ?? ""));
  const [selected, setSelected] = useState<Booking | null>(null);
  const [creating, setCreating] = useState<{ date?: string } | null>(null);
  const actions = useBookingActions(business.id);
  const onError = useErrorToast();
  useBookingsRealtime(business.id);

  const bookingsQ = useBookings({
    businessId: business.id,
    from: range?.from,
    to: range?.to,
    staffId: filterStaff || null,
  });

  const events = useMemo(
    () =>
      (bookingsQ.data ?? [])
        .filter((b) => b.status !== "cancelled")
        .map((b) => ({
          id: b.id,
          title: `${b.customers?.name ?? b.customers?.phone ?? ""} · ${b.services?.name ?? ""}`,
          start: toWallClock(b.starts_at, business.timezone),
          end: toWallClock(b.ends_at, business.timezone),
          backgroundColor: b.status === "no_show" ? "#94a3b8" : (b.staff?.color ?? "#6366f1"),
          borderColor: "transparent",
          classNames: b.status === "completed" ? ["opacity-60"] : [],
          editable: b.status === "confirmed" && (isOwner || b.staff_id === myStaffId),
          extendedProps: { booking: b },
        })),
    [bookingsQ.data, business.timezone, isOwner, myStaffId],
  );

  async function onDrop(arg: EventDropArg) {
    const booking = arg.event.extendedProps.booking as Booking;
    try {
      await actions.reschedule.mutateAsync({
        id: booking.id,
        start: fromWallClock(arg.event.start!, business.timezone),
      });
      toast.success(t("bookings.moved"));
    } catch (e) {
      arg.revert();
      onError(e);
    }
  }

  return (
    <>
      <PageHeader
        title={t("nav.calendar")}
        description={t("calendar.subtitle", { tz: business.timezone })}
        actions={
          <>
            <span className="flex items-center gap-1.5 self-center text-xs text-success">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> {t("calendar.live")}
            </span>
            {isOwner && (
              <Select
                aria-label={t("common.staff")}
                className="w-44"
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
              >
                <option value="">{t("calendar.allStaff")}</option>
                {staffQ.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </Select>
            )}
            <Button onClick={() => setCreating({})}>
              <Plus /> {t("bookings.newBooking")}
            </Button>
          </>
        }
      />
      {isOwner && staffQ.data && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {staffQ.data.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.display_name}
            </span>
          ))}
        </div>
      )}
      <Card className="p-2 sm:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={window.innerWidth < 640 ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth",
          }}
          locales={[esLocale]}
          locale={i18n.language.startsWith("es") ? "es" : "en"}
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          height="auto"
          expandRows
          events={events}
          eventDurationEditable={false}
          eventDrop={onDrop}
          eventClick={(arg: EventClickArg) =>
            setSelected(arg.event.extendedProps.booking as Booking)
          }
          dateClick={(arg: DateClickArg) =>
            setCreating({
              date: `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, "0")}-${String(arg.date.getDate()).padStart(2, "0")}`,
            })
          }
          datesSet={(arg: DatesSetArg) => {
            const from = new Date(arg.start.getTime() - 86_400_000).toISOString();
            const to = new Date(arg.end.getTime() + 86_400_000).toISOString();
            setRange((r) => (r?.from === from && r?.to === to ? r : { from, to }));
          }}
        />
      </Card>
      {selected && (
        <BookingDetailsDialog
          booking={selected}
          business={business}
          canManage={isOwner || selected.staff_id === myStaffId}
          onClose={() => setSelected(null)}
        />
      )}
      {creating && (
        <NewBookingDialog
          business={business}
          initialDate={creating.date ?? localDate(new Date(), business.timezone)}
          initialStaffId={isOwner ? filterStaff || null : myStaffId}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  );
}
